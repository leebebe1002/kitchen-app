/**
 * ☁️ Family Kitchen 2.0 CloudSyncEngine
 * 專為 Bebe 全家打造的免登入、高可靠、雙向即時雲端同步引擎
 * 支援：飲食紀錄 (daily_logs)、智慧冰箱 (pantry_inventory)、自訂食材庫 (custom_ingredients)
 */

class CloudSyncEngine {
    constructor(options = {}) {
        // 全家預設專屬同步暗號 (可在設定中自訂，全家共用同一個 ID 即自動連通)
        this.familyId = localStorage.getItem('family_kitchen_sync_id') || 'bebe_kitchen_family_2026_safe';
        this.syncEndpoint = `https://kvdb.io/4y9pB2z8nF2q1u7v5r3x6w/${this.familyId}_`;
        
        this.isSyncing = false;
        this.lastSyncTime = 0;
        this.syncListeners = [];
        this.debounceTimers = {};
        this.offlineQueue = [];
        
        // 監聽手機切換回前台 (App Focus) 或網路重新連線時自動拉取最新資料
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.syncAllPending());
            window.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.notifyListeners('refresh_needed');
                }
            });
        }
    }

    setFamilyId(newId) {
        if (!newId) return;
        this.familyId = newId.trim();
        localStorage.setItem('family_kitchen_sync_id', this.familyId);
        this.syncEndpoint = `https://kvdb.io/4y9pB2z8nF2q1u7v5r3x6w/${this.familyId}_`;
    }

    onSync(callback) {
        if (typeof callback === 'function') {
            this.syncListeners.push(callback);
        }
    }

    notifyListeners(event, data) {
        this.syncListeners.forEach(cb => {
            try { cb(event, data); } catch (e) {}
        });
    }

    /**
     * 📥 從雲端中樞拉取指定檔案最新資料
     */
    async fetchFromCloud(filename) {
        const cleanKey = filename.replace('.json', '');
        const targetUrl = `${this.syncEndpoint}${cleanKey}`;
        
        try {
            const resp = await fetch(`${targetUrl}?t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (resp.ok) {
                const cloudData = await resp.json();
                if (cloudData && typeof cloudData === 'object') {
                    console.log(`☁️ [CloudSync] 成功從雲端拉取最新 ${filename}`);
                    this.lastSyncTime = Date.now();
                    return cloudData;
                }
            }
        } catch (e) {
            console.warn(`☁️ [CloudSync] 從雲端讀取 ${filename} 暫時離線或初次建立:`, e.message);
        }
        return null;
    }

    /**
     * 📤 將本地最新資料推播至雲端中樞 (防抖動 600ms)
     */
    async pushToCloud(filename, data) {
        if (!data || typeof data !== 'object') return;
        const cleanKey = filename.replace('.json', '');
        
        // 防抖動機制：短時間內連續修改合併為一次推播
        if (this.debounceTimers[cleanKey]) {
            clearTimeout(this.debounceTimers[cleanKey]);
        }

        return new Promise((resolve) => {
            this.debounceTimers[cleanKey] = setTimeout(async () => {
                this.isSyncing = true;
                this.notifyListeners('syncing_start', { filename });
                
                const targetUrl = `${this.syncEndpoint}${cleanKey}`;
                try {
                    const resp = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (resp.ok) {
                        this.lastSyncTime = Date.now();
                        this.isSyncing = false;
                        console.log(`☁️ [CloudSync] 成功同步推播 ${filename} 至全家雲端！`);
                        this.notifyListeners('sync_success', { filename, timestamp: this.lastSyncTime });
                        resolve(true);
                        return;
                    }
                } catch (e) {
                    console.warn(`☁️ [CloudSync] 推播 ${filename} 暫時進入離線佇列:`, e.message);
                    this.offlineQueue.push({ filename, data, time: Date.now() });
                }
                
                this.isSyncing = false;
                this.notifyListeners('sync_offline', { filename });
                resolve(false);
            }, 600);
        });
    }

    /**
     * 🧬 深度智慧合流：飲食記錄 (daily_logs)
     * 依據日期與成員 (bebe, ariel, jason) 各自的餐點 ID/時間戳進行聯集合併，確保媽媽與小孩記的每一餐都不會遺失！
     */
    mergeDailyLogs(localLogs = {}, cloudLogs = {}) {
        if (!cloudLogs || !cloudLogs.logs) return localLogs || { logs: [] };
        if (!localLogs || !localLogs.logs) return cloudLogs || { logs: [] };

        const localList = Array.isArray(localLogs.logs) ? localLogs.logs : [];
        const cloudList = Array.isArray(cloudLogs.logs) ? cloudLogs.logs : [];

        const localMap = new Map(localList.filter(l => l && l.date).map(l => [l.date, l]));
        const cloudMap = new Map(cloudList.filter(l => l && l.date).map(l => [l.date, l]));

        const allDates = Array.from(new Set([...localMap.keys(), ...cloudMap.keys()]));
        const mergedLogs = [];

        allDates.forEach(date => {
            const lDay = localMap.get(date) || { date, diners: {} };
            const cDay = cloudMap.get(date) || { date, diners: {} };

            const mergedDiners = {};
            ['bebe', 'ariel', 'jason'].forEach(member => {
                const lM = (lDay.diners && lDay.diners[member]) ? lDay.diners[member] : { totals: {}, meals: [] };
                const cM = (cDay.diners && cDay.diners[member]) ? cDay.diners[member] : { totals: {}, meals: [] };

                const lMeals = Array.isArray(lM.meals) ? lM.meals : [];
                const cMeals = Array.isArray(cM.meals) ? cM.meals : [];

                const mealMap = new Map();
                // 雲端紀錄先入 Map
                cMeals.forEach(meal => {
                    if (!meal) return;
                    const key = meal.id || `${meal.time || ''}_${meal.dishName || ''}_${meal.dishId || ''}`;
                    mealMap.set(key, meal);
                });
                // 本地紀錄覆蓋或新增入 Map
                lMeals.forEach(meal => {
                    if (!meal) return;
                    const key = meal.id || `${meal.time || ''}_${meal.dishName || ''}_${meal.dishId || ''}`;
                    mealMap.set(key, meal);
                });

                const mergedMeals = Array.from(mealMap.values());
                // 自動精算加總該成員當日 totals
                const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
                mergedMeals.forEach(m => {
                    const n = m.nutrients || m.nutrition || {};
                    totals.kcal += Number(n.kcal || 0);
                    totals.protein += Number(n.protein || 0);
                    totals.carbs += Number(n.carbs || 0);
                    totals.fat += Number(n.fat || 0);
                    totals.sodium += Number(n.sodium || 0);
                });

                // 四捨五入至小數點一位
                Object.keys(totals).forEach(k => {
                    totals[k] = Math.round(totals[k] * 10) / 10;
                });

                mergedDiners[member] = {
                    totals,
                    meals: mergedMeals
                };
            });

            mergedLogs.push({
                date,
                diners: mergedDiners
            });
        });

        // 依日期降序排序 (最新日期排在最前面)
        mergedLogs.sort((a, b) => b.date.localeCompare(a.date));

        return { logs: mergedLogs };
    }

    /**
     * 🧬 深度智慧合流：智慧冰箱與庫存 (pantry_inventory)
     */
    mergePantryInventory(localPantry = {}, cloudPantry = {}) {
        if (!cloudPantry || Object.keys(cloudPantry).length === 0) return localPantry || {};
        if (!localPantry || Object.keys(localPantry).length === 0) return cloudPantry || {};

        const merged = { ...cloudPantry, ...localPantry };
        
        // 1. 食材庫存狀態合流 (foodStockStatus)
        merged.foodStockStatus = {
            ...(cloudPantry.foodStockStatus || {}),
            ...(localPantry.foodStockStatus || {})
        };

        // 2. 家用品庫存狀態合流 (supplyStockStatus)
        merged.supplyStockStatus = {
            ...(cloudPantry.supplyStockStatus || {}),
            ...(localPantry.supplyStockStatus || {})
        };

        // 3. 採買清單聯集合流 (shoppingList)
        const localShop = localPantry.shoppingList || [];
        const cloudShop = cloudPantry.shoppingList || [];
        const shopMap = new Map();
        [...cloudShop, ...localShop].forEach(item => {
            if (item && item.id) shopMap.set(item.id, item);
        });
        merged.shoppingList = Array.from(shopMap.values());

        return merged;
    }

    async syncAllPending() {
        if (this.offlineQueue.length === 0) return;
        const queue = [...this.offlineQueue];
        this.offlineQueue = [];
        for (const item of queue) {
            await this.pushToCloud(item.filename, item.data);
        }
    }
}

export default CloudSyncEngine;
