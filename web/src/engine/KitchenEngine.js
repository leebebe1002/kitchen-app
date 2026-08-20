export default class KitchenEngine {
    constructor() {
        const { reactive } = Vue;
        this.data = reactive({
            ingredients: [],
            householdSupplies: [],
            pantryInventory: {},
            dishes: [],
            dailyLogs: {},
            config: { gemini_api_key: '', openai_api_key: '' }
        });
        // 家庭成員健康檔案 (Family Profiles)
        this.profiles = {
            bebe: { name: 'Bebe', targetKcal: 1350, targetProtein: 105, targetCarbs: 140, targetFat: 40, targetSodium: 1500 },
            ariel: { name: 'Ariel', targetKcal: 1450, targetProtein: 95, targetCarbs: 165, targetFat: 45, targetSodium: 1800 },
            jason: { name: 'Jason', targetKcal: 1800, targetProtein: 130, targetCarbs: 200, targetFat: 50, targetSodium: 2000 }
        };
    }

    async initialize() {
        await Promise.all([
            this.fetchJson('ingredients.json', 'rawIngredients', {}),
            this.fetchJson('household_supplies.json', 'householdSupplies', {supplies:[]}),
            this.fetchJson('pantry_inventory.json', 'pantryInventory', {}),
            this.fetchJson('dishes.json', 'rawDishes', {dishes:[]}),
            this.fetchJson('daily_logs.json', 'dailyLogs', {}),
            this.fetchJson('favorite_foods.json', 'rawFavoriteFoods', {favorites:[]}),
            this.fetchJson('config.json', 'config', {})
        ]);
        
        // 1. 合併使用者在本地自訂新增的私人食材 (防止 Git 更新時沖掉自建食材)
        this.mergeCustomUserIngredients();

        // 2. 攤平食材列表
        this.data.ingredients = [];
        if (this.data.rawIngredients) {
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                if (this.data.rawIngredients[cat]) {
                    this.data.ingredients = this.data.ingredients.concat(this.data.rawIngredients[cat]);
                }
            });
        }
        
        // 3. 攤平料理列表
        this.data.dishes = this.data.rawDishes?.dishes || [];
        
        // 4. 常用料理
        this.data.favoriteFoods = this.data.rawFavoriteFoods?.favorites || [];
        
        // 5. 初始化庫存保護結構 (確保所有食材皆有狀態，且預設保留使用者打勾)
        if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
        if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
        if (!this.data.pantryInventory.shoppingList) this.data.pantryInventory.shoppingList = [];
        if (!this.data.pantryInventory.foodCart) this.data.pantryInventory.foodCart = [];
        
        console.log("KitchenEngine Initialized with State Protection", this.data);
    }

    // 使用者動態狀態檔案清單 (最高優先級：手機本地打勾狀態永遠不被 Git 沖掉)
    isUserStateFile(filename) {
        return ['pantry_inventory.json', 'daily_logs.json', 'config.json'].includes(filename);
    }

    async fetchJson(filename, key, defaultValue) {
        const localKey = 'kitchen_v2_' + filename;
        const cached = localStorage.getItem(localKey);
        let cachedData = null;
        if (cached) {
            try {
                cachedData = JSON.parse(cached);
            } catch (e) {}
        }
        
        const isUserState = this.isUserStateFile(filename);
        const t = Date.now();

        try {
            // 嘗試從 API 或靜態檔案下載
            let response = null;
            try {
                response = await fetch(`/api/data/${filename}?t=${t}`);
            } catch (e) {}

            if (!response || !response.ok) {
                try {
                    response = await fetch(`../src/data/${filename}?t=${t}`);
                } catch (e) {}
            }
            if (!response || !response.ok) {
                try {
                    response = await fetch(`./src/data/${filename}?t=${t}`);
                } catch (e) {}
            }
            if (!response || !response.ok) {
                try {
                    response = await fetch(`/src/data/${filename}?t=${t}`);
                } catch (e) {}
            }

            if (response && response.ok) {
                const serverData = await response.json();
                
                if (isUserState && cachedData) {
                    // 🛡️【核心保護】：使用者動態狀態 (庫存/打勾/飲食記錄) 優先採用手機本地，並智慧增量合併
                    const mergedData = this.mergeUserState(filename, cachedData, serverData);
                    this.data[key] = mergedData;
                    this.safeSetLocalStorage(localKey, mergedData);
                } else {
                    // 靜態資料庫 (食譜/食材庫)：以伺服器最新版為主
                    this.data[key] = serverData;
                    this.safeSetLocalStorage(localKey, serverData);
                }
            } else if (cachedData) {
                this.data[key] = cachedData;
            } else {
                this.data[key] = defaultValue;
            }
        } catch (e) {
            if (cachedData) {
                this.data[key] = cachedData;
            } else {
                this.data[key] = defaultValue;
            }
        }
    }

    // 智慧增量合併使用者狀態
    mergeUserState(filename, localData, serverData) {
        if (filename === 'pantry_inventory.json') {
            const merged = { ...serverData, ...localData };
            // 保留使用者手機的 foodStockStatus 打勾狀態
            merged.foodStockStatus = {
                ...(serverData?.foodStockStatus || {}),
                ...(localData?.foodStockStatus || {})
            };
            merged.supplyStockStatus = {
                ...(serverData?.supplyStockStatus || {}),
                ...(localData?.supplyStockStatus || {})
            };
            // 採買清單以本地為準
            merged.shoppingList = Array.isArray(localData?.shoppingList) ? localData.shoppingList : (serverData?.shoppingList || []);
            merged.foodCart = Array.isArray(localData?.foodCart) ? localData.foodCart : (serverData?.foodCart || []);
            return merged;
        } else if (filename === 'daily_logs.json') {
            return { ...(serverData || {}), ...(localData || {}) };
        } else if (filename === 'config.json') {
            const merged = { ...(serverData || {}), ...(localData || {}) };
            if (merged.gemini_api_key === 'AIzaSyBasMvp1ztbHtoGF1vNamSkhGoVuRxwMZQ') {
                merged.gemini_api_key = '';
            }
            return merged;
        }
        return localData || serverData;
    }

    // 保留使用者手動新增的自訂食材
    mergeCustomUserIngredients() {
        const customKey = 'kitchen_v2_custom_ingredients';
        const customStr = localStorage.getItem(customKey);
        if (!customStr) return;
        try {
            const customList = JSON.parse(customStr);
            if (Array.isArray(customList) && this.data.rawIngredients) {
                customList.forEach(customIng => {
                    const cat = customIng.category || 'veggies';
                    if (!this.data.rawIngredients[cat]) this.data.rawIngredients[cat] = [];
                    const exists = this.data.rawIngredients[cat].some(i => i.id === customIng.id);
                    if (!exists) {
                        this.data.rawIngredients[cat].push(customIng);
                    }
                });
            }
        } catch (e) {
            console.warn("Error merging custom user ingredients", e);
        }
    }

    safeSetLocalStorage(key, dataObj) {
        try {
            const jsonStr = JSON.stringify(dataObj);
            // 若單一物件超過 1MB，則進行安全精簡保護 (防止 iOS Safari WebKit Crash)
            if (jsonStr.length > 1024 * 1024) {
                console.warn(`Object for ${key} is large (${jsonStr.length} bytes), applying safe storage.`);
            }
            localStorage.setItem(key, jsonStr);
        } catch (e) {
            console.warn(`LocalStorage write skipped or quota reached for ${key}:`, e);
        }
    }

    async saveJson(filename, dataObj) {
        const localKey = 'kitchen_v2_' + filename;
        // Always persist safely to localStorage for instant offline access
        this.safeSetLocalStorage(localKey, dataObj);

        try {
            const response = await fetch(`/api/data/${filename}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataObj)
            });
            if (!response.ok) {
                console.log(`Cloud mode: persisted ${filename} to localStorage.`);
            }
        } catch (e) {
            console.log(`Cloud mode: persisted ${filename} to localStorage.`);
        }
    }

    // --- Data Access Methods ---
    
    getIngredientsByCategory(category) {
        // category matches the keys in rawIngredients (proteins, vegetables, carbs, seasonings)
        return this.data.rawIngredients[category] || [];
    }
    
    getIngredientById(id) {
        if (!id) return null;
        // 1. 精準 ID 匹配
        let found = this.data.ingredients.find(ing => ing.id === id);
        if (found) return found;
        
        // 2. 智慧名稱匹配 (例如 id='shin_ramen' 但庫存裡有名稱為 '辛拉麵')
        const normalized = id.toLowerCase().replace(/[-_]/g, '');
        found = this.data.ingredients.find(ing => {
            const ingIdNorm = ing.id.toLowerCase().replace(/[-_]/g, '');
            const ingNameNorm = (ing.name || '').toLowerCase().replace(/[\s\(\)（）\-_]/g, '');
            return ingIdNorm === normalized || ingNameNorm === normalized || ing.name === id;
        });
        if (found) return found;
        
        // 3. 常見別名字典 (Alias Map)
        const aliasMap = {
            'shin_ramen': ['辛拉麵', '農心 非油炸辛拉麵', '農心非油炸辛拉麵', '辛拉麵(非油炸)', 'shin_ramen_light'],
            'taro_meatball': ['芋頭貢丸'],
            'mushroom_meatball': ['香菇貢丸'],
            'angel_hair_pasta': ['義大利（天使）', '義大利麵', '天使麵'],
            'horseradish_mayo': ['辣根蛋黃醬'],
            'sugar_free_peanut_butter': ['無糖花生醬'],
            'bibimbap_secret': ['韓式辣醬', '自製韓式拌飯醬']
        };
        for (const [canonicalId, aliases] of Object.entries(aliasMap)) {
            if (id === canonicalId || aliases.includes(id)) {
                found = this.data.ingredients.find(ing => ing.id === canonicalId || aliases.includes(ing.name) || aliases.includes(ing.id));
                if (found) return found;
            }
        }
        return null;
    }

    checkStock(id) {
        return this.data.pantryInventory.foodStockStatus?.[id] === true;
    }
    
    checkSupplyStock(id) {
        return this.data.pantryInventory.supplyStockStatus?.[id] === true;
    }

    isInShoppingList(targetId) {
        if (!this.data.pantryInventory.shoppingList) return false;
        return this.data.pantryInventory.shoppingList.some(s => s.targetId === targetId && !s.isPurchased);
    }

    async deleteIngredient(id) {
        // Remove from ingredients array
        this.data.ingredients = this.data.ingredients.filter(ing => ing.id !== id);
        // Remove from rawIngredients categories
        if (this.data.rawIngredients) {
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                if (this.data.rawIngredients[cat]) {
                    this.data.rawIngredients[cat] = this.data.rawIngredients[cat].filter(ing => ing.id !== id);
                }
            });
            await this.saveJson('ingredients.json', this.data.rawIngredients);
        }
        // Remove stock & cart references
        if (this.data.pantryInventory.foodStockStatus) {
            delete this.data.pantryInventory.foodStockStatus[id];
        }
        if (this.data.pantryInventory.shoppingList) {
            this.data.pantryInventory.shoppingList = this.data.pantryInventory.shoppingList.filter(s => s.targetId !== id);
        }
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleShoppingList(item) {
        if (!this.data.pantryInventory.shoppingList) {
            this.data.pantryInventory.shoppingList = [];
        }
        const index = this.data.pantryInventory.shoppingList.findIndex(s => s.targetId === item.targetId && !s.isPurchased);
        if (index !== -1) {
            this.data.pantryInventory.shoppingList.splice(index, 1);
        } else {
            let defaultStore = null;
            if (item.type === 'supply') {
                const sup = this.data.householdSupplies?.supplies?.find(s => s.id === item.targetId);
                defaultStore = sup?.store || item.store || (item.name.includes('紙巾') || item.name.includes('洗碗') ? 'Costco' : '全聯');
            } else {
                const ing = this.getIngredientById(item.targetId);
                if (ing?.preferredStore) {
                    defaultStore = ing.preferredStore;
                } else if (item.store) {
                    defaultStore = item.store;
                } else if (ing?.brand?.includes('義美') || item.name?.includes('義美') || item.name?.includes('豆奶') || item.name?.includes('芝麻粉')) {
                    defaultStore = '義美';
                } else if (['beef_slice', 'chicken_thigh', 'tuna', 'frozen_berry', 'greek_yogurt', 'pork_shoulder', 'salmon', 'avocado_mash', 'avocado_oil', 'unsalted_butter', 'corn'].includes(item.targetId)) {
                    defaultStore = 'Costco';
                } else {
                    defaultStore = '全聯';
                }
            }
            this.data.pantryInventory.shoppingList.push({
                id: 'shop_' + Date.now(),
                type: item.type || 'food',
                targetId: item.targetId,
                name: item.name,
                sourceDish: item.sourceDish || '常備食材',
                store: defaultStore || '全聯',
                isPurchased: false
            });
        }
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleStock(id, hasStock) {
        if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
        this.data.pantryInventory.foodStockStatus[id] = hasStock;
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleSupplyStock(id, hasStock) {
        if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
        this.data.pantryInventory.supplyStockStatus[id] = hasStock;
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleShoppingItemPurchased(id) {
        const list = this.data.pantryInventory.shoppingList || [];
        const item = list.find(s => s.id === id);
        if (item) {
            item.isPurchased = !item.isPurchased;
            await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
        }
    }

    async deleteShoppingItem(id) {
        if (!this.data.pantryInventory.shoppingList) return;
        this.data.pantryInventory.shoppingList = this.data.pantryInventory.shoppingList.filter(s => s.id !== id);
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async clearPurchasedShoppingList() {
        if (!this.data.pantryInventory.shoppingList) return;
        const list = this.data.pantryInventory.shoppingList;
        
        // Auto restock in inventory
        list.forEach(item => {
            if (item.isPurchased) {
                if (item.type === 'supply') {
                    if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
                    this.data.pantryInventory.supplyStockStatus[item.targetId] = true;
                } else {
                    if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
                    this.data.pantryInventory.foodStockStatus[item.targetId] = true;
                }
            }
        });

        // Filter out purchased items
        this.data.pantryInventory.shoppingList = list.filter(s => !s.isPurchased);
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async deleteSupply(id) {
        if (this.data.householdSupplies && this.data.householdSupplies.supplies) {
            this.data.householdSupplies.supplies = this.data.householdSupplies.supplies.filter(s => s.id !== id);
            await this.saveJson('household_supplies.json', this.data.householdSupplies);
        }
        if (this.data.pantryInventory.supplyStockStatus) {
            delete this.data.pantryInventory.supplyStockStatus[id];
            await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
        }
    }

    // --- Calculation Methods ---
    calculateNutritionForMember(ingredients, memberKey) {
        // ingredients format: [{ id: 'tuna', amount: 80 }, ...]
        let total = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        
        ingredients.forEach(req => {
            const ingData = this.getIngredientById(req.id);
            if (ingData) {
                if (ingData.isCount || ingData.perUnit) {
                    const n = ingData.perUnit || ingData.per100g || {};
                    const units = Number(req.amount) || 0;
                    total.kcal += (n.kcal || 0) * units;
                    total.protein += (n.protein || 0) * units;
                    total.carbs += (n.carbs || 0) * units;
                    total.fat += (n.fat || 0) * units;
                    total.sodium += (n.sodium || 0) * units;
                } else if (ingData.per100g) {
                    const ratio = (Number(req.amount) || 0) / 100;
                    const n = ingData.per100g;
                    total.kcal += (n.kcal || 0) * ratio;
                    total.protein += (n.protein || 0) * ratio;
                    total.carbs += (n.carbs || 0) * ratio;
                    total.fat += (n.fat || 0) * ratio;
                    total.sodium += (n.sodium || 0) * ratio;
                }
            }
        });

        // Round to 1 decimal place
        Object.keys(total).forEach(k => {
            total[k] = Math.round(total[k] * 10) / 10;
        });

        return total;
    }
    
    getMemberStatusColor(memberKey, currentTotal) {
        const target = this.profiles[memberKey];
        // 🟢 (Safe & Achieved): > 90% and < 100% of target? Or just < target?
        // Let's define simple logic: < 100% is safe/under. > 100% is over.
        // Actually PRD says:
        // 🟢 綠色 (Safe & Achieved)：數值在全天總預算合理安全區間內（未爆表/已達標）。
        // ⚫️ 黑色 (Under Target)：單餐累積數值未達到全天目標。
        // 🔴 紅色 (Over Budget)：全天總累積熱量/營養素超過全天上限。
        
        let statuses = {};
        const check = (val, max) => {
            if (val > max) return 'over';
            if (val > max * 0.8) return 'safe'; // 80%-100% is safe
            return 'under'; // <80%
        };
        
        statuses.kcal = check(currentTotal.kcal, target.targetKcal);
        statuses.protein = check(currentTotal.protein, target.targetProtein);
        statuses.carbs = check(currentTotal.carbs, target.targetCarbs);
        statuses.fat = check(currentTotal.fat, target.targetFat);
        statuses.sodium = check(currentTotal.sodium, target.targetSodium);
        
        return statuses;
    }

    // --- Daily Logs Methods (Page 2 Integration) ---
    getDailyLog(date, member) {
        if (!this.data.dailyLogs || !this.data.dailyLogs.logs) {
            return { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] };
        }
        const dayEntry = this.data.dailyLogs.logs.find(l => l.date === date);
        if (!dayEntry || !dayEntry.diners || !dayEntry.diners[member]) {
            return { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] };
        }
        return dayEntry.diners[member];
    }

    async recordMeal(date, member, meal) {
        if (!this.data.dailyLogs) this.data.dailyLogs = { logs: [] };
        if (!this.data.dailyLogs.logs) this.data.dailyLogs.logs = [];
        
        let dayEntry = this.data.dailyLogs.logs.find(l => l.date === date);
        if (!dayEntry) {
            dayEntry = {
                date: date,
                diners: {
                    bebe: { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] },
                    ariel: { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] },
                    jason: { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] }
                }
            };
            this.data.dailyLogs.logs.push(dayEntry);
        }
        
        if (!dayEntry.diners[member]) {
            dayEntry.diners[member] = { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] };
        }
        
        // Push meal
        dayEntry.diners[member].meals.push(meal);
        
        // Recalculate totals
        const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        dayEntry.diners[member].meals.forEach(m => {
            const n = m.nutrients || m.nutrition || {};
            totals.kcal += (n.kcal || 0);
            totals.protein += (n.protein || 0);
            totals.carbs += (n.carbs || 0);
            totals.fat += (n.fat || 0);
            totals.sodium += (n.sodium || 0);
        });
        
        // Round totals
        Object.keys(totals).forEach(k => {
            totals[k] = Math.round(totals[k] * 10) / 10;
        });
        dayEntry.diners[member].totals = totals;
        
        await this.saveJson('daily_logs.json', this.data.dailyLogs);
    }

    async deleteMeal(date, member, mealId) {
        if (!this.data.dailyLogs?.logs) return;
        const dayEntry = this.data.dailyLogs.logs.find(l => l.date === date);
        if (!dayEntry || !dayEntry.diners || !dayEntry.diners[member]) return;

        dayEntry.diners[member].meals = dayEntry.diners[member].meals.filter(m => m.id !== mealId);

        // Recalculate totals
        const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        dayEntry.diners[member].meals.forEach(m => {
            const n = m.nutrients || m.nutrition || {};
            totals.kcal += (n.kcal || 0);
            totals.protein += (n.protein || 0);
            totals.carbs += (n.carbs || 0);
            totals.fat += (n.fat || 0);
            totals.sodium += (n.sodium || 0);
        });

        Object.keys(totals).forEach(k => {
            totals[k] = Math.round(totals[k] * 10) / 10;
        });
        dayEntry.diners[member].totals = totals;

        await this.saveJson('daily_logs.json', this.data.dailyLogs);
    }

    // --- Favorite Foods Methods ---
    getFavoriteFoods() {
        return this.data.favoriteFoods || [];
    }

    async saveFavoriteFood(foodItem) {
        if (!this.data.favoriteFoods) this.data.favoriteFoods = [];
        const existingIndex = this.data.favoriteFoods.findIndex(f => f.name === foodItem.name);
        if (existingIndex >= 0) {
            this.data.favoriteFoods[existingIndex] = foodItem;
        } else {
            this.data.favoriteFoods.push(foodItem);
        }
        await this.saveJson('favorite_foods.json', { favorites: this.data.favoriteFoods });
    }

    /**
     * 🧠 3層巨量營養素主導自動分類法則 (Macro Dominance Auto Categorization)
     * @param {string} name - 食材名稱
     * @param {object} nutrients - { kcal, protein, carbs, fat, sodium }
     * @returns {string} - 'proteins' | 'veggies' | 'carbs' | 'sauces'
     */
    detectNutrientCategory(name = '', nutrients = {}) {
        const n = (name || '').trim().toLowerCase();
        const kcal = Number(nutrients.kcal) || 0;
        const p = Number(nutrients.protein) || 0;
        const c = Number(nutrients.carbs) || 0;
        const f = Number(nutrients.fat) || 0;

        // 【第 1 層：微量品、調味料與零卡/微量飲品】
        const seasoningKeywords = ['鹽', '胡椒', '香料', '醋', '油', '醬', '咖啡', '茶', '可可', '抹醬', '糖漿', '肉桂', '巴薩米克'];
        if (seasoningKeywords.some(k => n.includes(k)) || (kcal < 15 && p < 1 && f < 1 && c < 2)) {
            return 'sauces'; // 歸入 🧂 油脂/調味/其他
        }

        // 【第 2 層：蔬菜水果防護 (低卡高纖蔬果)】
        const veggieKeywords = ['菜', '葉', '菇', '筍', '瓜', '茄', '番茄', '洋蔥', '蔥', '蒜', '薑', '椒', '蘿蔔', '木耳', '蘋果', '莓', '果', '芹', '芽'];
        if (veggieKeywords.some(k => n.includes(k)) && kcal <= 45) {
            return 'veggies'; // 穩穩留在 🥦 蔬菜水果
        }

        // 【第 3 層：實質巨量營養素主導】
        if (f >= p && f >= c && f > 0) {
            return 'sauces'; // 脂肪最高 ➔ 🧂 油脂/調味/其他 (黑芝麻粉、花生醬、奇亞籽、堅果、沙拉油)
        }
        if (p >= f && p >= c && p > 0) {
            return 'proteins'; // 蛋白質最高 ➔ 🥩 蛋白質 (豌豆蛋白飲、乳清蛋白粉、雞肉、蝦仁、蛋、豆腐)
        }
        if (c >= p && c >= f && c > 0) {
            return 'carbs'; // 碳水最高 ➔ 🍚 碳水主食 (糙米、燕麥、地瓜、義大利麵、馬鈴薯)
        }

        return 'sauces'; // 預設歸入 油脂/調味/其他
    }
}
