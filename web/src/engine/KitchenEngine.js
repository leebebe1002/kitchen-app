export default class KitchenEngine {
    constructor() {
        const { reactive } = Vue;
        this.data = reactive({
            ingredients: [],
            householdSupplies: [],
            pantryInventory: {},
            dishes: [],
            dailyLogs: {}
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
        
        // Flatten ingredients
        this.data.ingredients = [];
        if (this.data.rawIngredients) {
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                if (this.data.rawIngredients[cat]) {
                    this.data.ingredients = this.data.ingredients.concat(this.data.rawIngredients[cat]);
                }
            });
        }
        
        // Flatten dishes
        this.data.dishes = this.data.rawDishes?.dishes || [];
        
        // Favorite foods
        this.data.favoriteFoods = this.data.rawFavoriteFoods?.favorites || [];
        
        // Initialize pantry if empty
        if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
        if (!this.data.pantryInventory.foodCart) this.data.pantryInventory.foodCart = [];
        
        console.log("KitchenEngine Initialized", this.data);
    }

    async fetchJson(filename, key, defaultValue) {
        // 1. Try local storage first if available (for cloud static usage)
        const localKey = 'kitchen_v2_' + filename;
        const cached = localStorage.getItem(localKey);
        
        try {
            // Try API endpoint first, then relative static fallbacks for GitHub Pages / Cloud
            let response = null;
            try {
                response = await fetch(`/api/data/${filename}`);
            } catch (e) {}

            if (!response || !response.ok) {
                try {
                    response = await fetch(`../src/data/${filename}`);
                } catch (e) {}
            }
            if (!response || !response.ok) {
                try {
                    response = await fetch(`./src/data/${filename}`);
                } catch (e) {}
            }
            if (!response || !response.ok) {
                try {
                    response = await fetch(`/src/data/${filename}`);
                } catch (e) {}
            }
            if (response.ok) {
                const fetchedData = await response.json();
                if (cached) {
                    try {
                        this.data[key] = JSON.parse(cached);
                    } catch (e) {
                        this.data[key] = fetchedData;
                    }
                } else {
                    this.data[key] = fetchedData;
                }
            } else if (cached) {
                this.data[key] = JSON.parse(cached);
            } else {
                this.data[key] = defaultValue;
            }
        } catch (e) {
            if (cached) {
                try {
                    this.data[key] = JSON.parse(cached);
                } catch (err) {
                    this.data[key] = defaultValue;
                }
            } else {
                this.data[key] = defaultValue;
            }
        }
    }

    async saveJson(filename, dataObj) {
        const localKey = 'kitchen_v2_' + filename;
        // Always persist to localStorage for instant offline access
        try {
            localStorage.setItem(localKey, JSON.stringify(dataObj));
        } catch (e) {
            console.warn("LocalStorage save error", e);
        }

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
        return this.data.ingredients.find(ing => ing.id === id);
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
            let defaultStore = item.store;
            if (!defaultStore) {
                if (item.type === 'supply') {
                    const sup = this.data.householdSupplies?.supplies?.find(s => s.id === item.targetId);
                    defaultStore = sup?.store || (item.name.includes('紙巾') || item.name.includes('洗碗') ? 'Costco' : '全聯');
                } else {
                    const ing = this.getIngredientById(item.targetId);
                    if (ing?.preferredStore) defaultStore = ing.preferredStore;
                    else if (ing?.brand?.includes('義美') || item.name.includes('義美') || item.name.includes('豆奶') || item.name.includes('芝麻粉')) {
                        defaultStore = '義美';
                    } else if (['beef_slice', 'chicken_thigh', 'tuna', 'frozen_berry', 'greek_yogurt', 'pork_shoulder', 'salmon'].includes(item.targetId)) {
                        defaultStore = 'Costco';
                    } else {
                        defaultStore = '全聯';
                    }
                }
            }
            this.data.pantryInventory.shoppingList.push({
                id: 'shop_' + Date.now(),
                type: item.type || 'food',
                targetId: item.targetId,
                name: item.name,
                sourceDish: item.sourceDish || '常購備品',
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
            if (ingData && ingData.per100g) {
                const ratio = req.amount / 100;
                const n = ingData.per100g;
                total.kcal += (n.kcal || 0) * ratio;
                total.protein += (n.protein || 0) * ratio;
                total.carbs += (n.carbs || 0) * ratio;
                total.fat += (n.fat || 0) * ratio;
                total.sodium += (n.sodium || 0) * ratio;
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
}
