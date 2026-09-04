/**
 * ☁️ Family Kitchen 2.0 Supabase Service
 * 負責：
 * 1. 食物照片上傳至 Storage (meal-photos)
 * 2. 飲食紀錄 (meal_logs) 雲端資料庫讀取、寫入、刪除
 * 3. 既有歷史紀錄無痛一鍵搬家
 */

const SUPABASE_CONFIG = {
    url: 'https://zfgdneacuzwyfibpuupq.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmZ2RuZWFjdXp3eWZpYnB1dXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTg5NDMsImV4cCI6MjEwMzk5NDk0M30.nvyfMF27gSEgrZSWzF7fx_KyUScVJsTArAsAZ_pSIsM',
    bucket: 'meal-photos'
};

class SupabaseService {
    constructor() {
        this.url = localStorage.getItem('family_kitchen_supabase_url') || SUPABASE_CONFIG.url;
        this.anonKey = localStorage.getItem('family_kitchen_supabase_key') || SUPABASE_CONFIG.anonKey;
        this.bucket = SUPABASE_CONFIG.bucket;
    }

    getHeaders() {
        return {
            'apikey': this.anonKey,
            'Authorization': `Bearer ${this.anonKey}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * 📷 將 Base64 格式的食物照片上傳至 Supabase Storage
     */
    async uploadMealPhoto(base64Data, member = 'bebe') {
        if (!base64Data) return null;
        
        try {
            console.log('☁️ [Supabase] 正在上傳食物照片至雲端圖床...');
            
            let mimeType = 'image/jpeg';
            let pureB64 = base64Data;
            if (base64Data.includes(',')) {
                const parts = base64Data.split(',');
                const mimeMatch = parts[0].match(/:(.*?);/);
                if (mimeMatch) mimeType = mimeMatch[1];
                pureB64 = parts[1];
            }

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timeStr = Date.now();
            const ext = mimeType.includes('png') ? 'png' : 'jpg';
            const filename = `meals/${member}_${dateStr}_${timeStr}.${ext}`;

            // 1. 優先嘗試透過本地後端 API 代理上傳 (若在本地環境可免除 RLS 限制)
            try {
                const proxyResp = await fetch('/api/upload-supabase-photo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: filename,
                        mimeType: mimeType,
                        base64: pureB64
                    })
                });
                if (proxyResp.ok) {
                    const proxyData = await proxyResp.json();
                    if (proxyData.status === 'success' && proxyData.publicUrl) {
                        console.log('✅ [Supabase] 透過本地代理上傳成功！公開網址:', proxyData.publicUrl);
                        return proxyData.publicUrl;
                    }
                }
            } catch (e) {
                // 本地代理不可用時轉直傳
            }

            // 2. Client-side 直傳模式
            const byteCharacters = atob(pureB64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });

            const uploadUrl = `${this.url}/storage/v1/object/${this.bucket}/${filename}`;
            const resp = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                    'Content-Type': mimeType
                },
                body: blob
            });

            if (resp.ok) {
                const publicUrl = `${this.url}/storage/v1/object/public/${this.bucket}/${filename}`;
                console.log('✅ [Supabase] 直傳雲端圖床成功！公開網址:', publicUrl);
                return publicUrl;
            } else {
                const errJson = await resp.json().catch(() => ({}));
                console.warn('⚠️ [Supabase] 直傳失敗:', errJson);
                return null;
            }
        } catch (err) {
            console.error('❌ [Supabase] 上傳照片發生例外:', err);
            return null;
        }
    }

    /**
     * 📥 讀取指定日期與成員的飲食紀錄
     * @returns {Promise<Array|null>} 回傳標準 meal 物件陣列，連線異常則回傳 null
     */
    async getMealsByDate(date, member = 'bebe') {
        try {
            const endpoint = `${this.url}/rest/v1/meal_logs?date=eq.${date}&member=eq.${member}&order=created_at.asc`;
            const resp = await fetch(endpoint, {
                headers: this.getHeaders()
            });

            if (!resp.ok) {
                console.warn('⚠️ [Supabase] 讀取 meal_logs 失敗:', resp.status);
                return null;
            }

            const rows = await resp.json();
            // 轉換為前端既有的標準 meal 資料結構
            return rows.map(r => ({
                id: r.id,
                dishName: r.dish_name,
                time: r.time,
                source: r.source || 'manual',
                portionRatio: r.portion_ratio || '1',
                nutrients: {
                    kcal: Number(r.kcal) || 0,
                    protein: Number(r.protein) || 0,
                    carbs: Number(r.carbs) || 0,
                    fat: Number(r.fat) || 0,
                    sodium: Number(r.sodium) || 0
                },
                items: Array.isArray(r.items) ? r.items : [],
                aiNote: r.ai_note || '',
                photoUrl: r.photo_url || null
            }));
        } catch (err) {
            console.error('❌ [Supabase] 讀取飲食紀錄失敗:', err);
            return null;
        }
    }

    /**
     * 📤 寫入單筆餐點紀錄到 Supabase 資料庫
     */
    async saveMeal(date, member, meal) {
        try {
            const row = {
                id: meal.id || ('meal_' + Date.now() + '_' + member),
                date: date,
                member: member,
                time: meal.time || '',
                dish_name: meal.dishName || '未命名餐點',
                source: meal.source || 'manual',
                portion_ratio: String(meal.portionRatio || '1'),
                kcal: Number(meal.nutrients?.kcal) || 0,
                protein: Number(meal.nutrients?.protein) || 0,
                carbs: Number(meal.nutrients?.carbs) || 0,
                fat: Number(meal.nutrients?.fat) || 0,
                sodium: Number(meal.nutrients?.sodium) || 0,
                items: Array.isArray(meal.items) ? meal.items : (Array.isArray(meal.ingredientsSummary) ? meal.ingredientsSummary : []),
                ai_note: meal.aiNote || '',
                photo_url: meal.photoUrl || null
            };

            const endpoint = `${this.url}/rest/v1/meal_logs`;
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    ...this.getHeaders(),
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(row)
            });

            if (resp.ok) {
                console.log('✅ [Supabase] 餐點紀錄成功存入雲端資料庫:', row.dish_name);
                return true;
            } else {
                const err = await resp.json().catch(() => ({}));
                console.warn('⚠️ [Supabase] 寫入餐點失敗:', err);
                return false;
            }
        } catch (err) {
            console.error('❌ [Supabase] 儲存餐點例外:', err);
            return false;
        }
    }

    /**
     * 🗑️ 從 Supabase 刪除一筆餐點紀錄
     */
    async deleteMeal(mealId) {
        try {
            const endpoint = `${this.url}/rest/v1/meal_logs?id=eq.${mealId}`;
            const resp = await fetch(endpoint, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return resp.ok;
        } catch (err) {
            console.error('❌ [Supabase] 刪除餐點失敗:', err);
            return false;
        }
    }

    /**
     * 🚚 將本地 daily_logs.json 所有歷史紀錄無痛批次搬遷至 Supabase
     */
    async migrateDailyLogs(dailyLogsData) {
        if (!dailyLogsData || !Array.isArray(dailyLogsData.logs)) return 0;
        
        const rows = [];
        dailyLogsData.logs.forEach(day => {
            const date = day.date;
            if (day.diners) {
                Object.keys(day.diners).forEach(member => {
                    const diner = day.diners[member];
                    if (Array.isArray(diner.meals)) {
                        diner.meals.forEach(m => {
                            rows.push({
                                id: m.id || ('meal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                                date: date,
                                member: member,
                                time: m.time || '',
                                dish_name: m.dishName || '餐點',
                                source: m.source || 'manual',
                                portion_ratio: String(m.portionRatio || '1'),
                                kcal: Number(m.nutrients?.kcal) || 0,
                                protein: Number(m.nutrients?.protein) || 0,
                                carbs: Number(m.nutrients?.carbs) || 0,
                                fat: Number(m.nutrients?.fat) || 0,
                                sodium: Number(m.nutrients?.sodium) || 0,
                                items: Array.isArray(m.items) ? m.items : (Array.isArray(m.ingredientsSummary) ? m.ingredientsSummary : []),
                                ai_note: m.aiNote || '',
                                photo_url: m.photoUrl || null
                            });
                        });
                    }
                });
            }
        });

        if (rows.length === 0) return 0;

        console.log(`🚚 [Supabase] 正在搬遷 ${rows.length} 筆歷史飲食紀錄至雲端...`);
        const endpoint = `${this.url}/rest/v1/meal_logs`;
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(rows)
        });

        if (resp.ok) {
            console.log(`🎉 [Supabase] 成功將 ${rows.length} 筆歷史紀錄全數搬遷上雲端！`);
            return rows.length;
        } else {
            console.warn('⚠️ [Supabase] 搬遷歷史紀錄異常:', await resp.text());
            return 0;
        }
    }
}

export default new SupabaseService();
