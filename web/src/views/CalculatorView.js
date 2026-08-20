const { ref, computed, watch, onMounted } = Vue;

export default {
    props: ['engine', 'onNavigate'],
    setup(props) {
        const engine = props.engine;
        const userHasManuallySelected = ref(false);

        // 判定當前時段與推薦標籤
        const getTimeSlotInfo = () => {
            const now = new Date();
            const hour = now.getHours();
            const min = now.getMinutes();
            const totalMin = hour * 60 + min;

            // 07:00 - 11:59: 早餐時段 (優格、早午餐、乳清蛋白)
            if (totalMin >= 7 * 60 && totalMin < 12 * 60) {
                return {
                    id: 'breakfast',
                    name: '晨光早餐',
                    icon: '🌅',
                    recommendedDishIds: ['yogurt_bowl', 'brunch_set', 'whey_protein_shake']
                };
            }
            // 12:00 - 14:59: 中餐時段 (波奇碗、生菜沙拉、泡麵、早午餐、優格碗、火鍋)
            else if (totalMin >= 12 * 60 && totalMin < 15 * 60) {
                return {
                    id: 'lunch',
                    name: '元氣中餐',
                    icon: '☀️',
                    recommendedDishIds: ['poke_bowl', 'salad', 'ramen_meal', 'brunch_set', 'yogurt_bowl', 'hotpot']
                };
            }
            // 15:00 - 16:59: 午後輕食 (優格碗、早午餐、乳清蛋白、生菜沙拉)
            else if (totalMin >= 15 * 60 && totalMin < 17 * 60) {
                return {
                    id: 'snack',
                    name: '午後輕食',
                    icon: '☕',
                    recommendedDishIds: ['yogurt_bowl', 'brunch_set', 'whey_protein_shake', 'salad']
                };
            }
            // 17:00 - 21:59: 晚餐時段 (幸福家常飯、波奇碗、拌飯、泡麵、火鍋)
            else if (totalMin >= 17 * 60 && totalMin < 22 * 60) {
                return {
                    id: 'dinner',
                    name: '溫馨晚餐',
                    icon: '🌙',
                    recommendedDishIds: ['home_cooking', 'poke_bowl', 'bibimbap', 'ramen_meal', 'hotpot']
                };
            }
            // 22:00 - 06:59: 宵夜 / 深夜食堂 (泡麵、優格碗、乳清蛋白)
            else {
                return {
                    id: 'late_night',
                    name: '深夜食堂',
                    icon: '✨',
                    recommendedDishIds: ['ramen_meal', 'yogurt_bowl', 'whey_protein_shake']
                };
            }
        };

        const currentSlot = ref(getTimeSlotInfo());

        const dishesList = computed(() => {
            return (engine && engine.data && engine.data.dishes && engine.data.dishes.length > 0) ? engine.data.dishes : [];
        });

        // 計算當前時段推薦料理（依時段優先序 ＋ 動態比對料理 categories）
        const recommendedDishes = computed(() => {
            const list = dishesList.value || [];
            const slot = currentSlot.value;
            if (!slot || list.length === 0) return list;

            const recList = [];
            if (slot.recommendedDishIds) {
                slot.recommendedDishIds.forEach(id => {
                    const found = list.find(d => d.id === id);
                    if (found && !recList.includes(found)) recList.push(found);
                });
            }
            // 自動動態納入任何 categories 包含當前時段的料理
            list.forEach(dish => {
                if (dish.categories && dish.categories.includes(slot.id)) {
                    if (!recList.includes(dish)) recList.push(dish);
                }
            });
            return recList.length > 0 ? recList : list;
        });

        // 其他料理清單
        const otherDishes = computed(() => {
            const list = dishesList.value || [];
            const recIds = new Set(recommendedDishes.value.map(d => d.id));
            return list.filter(d => !recIds.has(d.id));
        });

        const getBestDefaultDishId = () => {
            const rec = recommendedDishes.value;
            if (rec && rec.length > 0) return rec[0].id;
            const list = dishesList.value;
            if (list && list.length > 0) return list[0].id;
            return 'yogurt_bowl';
        };

        const selectedDish = ref(getBestDefaultDishId());
        const showSOP = ref(false);
        const hideOutOfStock = ref(false);
        const isCalculated = ref(false);
        
        // Record Success Modal State
        const showRecordSuccessModal = ref(false);
        const recordSuccessDishName = ref('');
        const recordSuccessDate = ref('');

        // Cart Modal & Ingredient Detail Modal & Add Modal
        const showCartModal = ref(false);
        const showIngredientDetailModal = ref(false);
        const showAddModal = ref(false);

        // Modal 背景鎖定機制 (Body Scroll Lock)
        watch([showIngredientDetailModal, showCartModal, showRecordSuccessModal, showAddModal], (newVals) => {
            const isAnyOpen = newVals.some(v => v === true);
            if (isAnyOpen) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        });
        const searchQuery = ref('');
        const drawerCategory = ref('all');
        const isQuickCreate = ref(false);
        const quickForm = ref({
            name: '',
            category: 'veggies',
            unitLabel: 'g',
            isCount: false
        });

        const drawerTabs = [
            { id: 'all', label: '全部' },
            { id: 'proteins', label: '🥩 蛋白質' },
            { id: 'veggies', label: '🥦 蔬菜水果' },
            { id: 'carbs', label: '🍚 碳水主食' },
            { id: 'sauces', label: '🧂 醬料與油脂' },
            { id: 'drinks', label: '☕️ 飲品沖泡' }
        ];

        // Master selected ingredients in Section 02 (The Single Filter for all calculations)
        const selectedMasterIngredients = ref([]);

        // Full member ingredient configs: { bebe: [{id, amount, unit}...], ariel: [...], jason: [...] }
        const memberIngredients = ref({
            bebe: [],
            ariel: [],
            jason: []
        });
        
        const diners = ref({
            bebe: true,
            ariel: false,
            jason: false
        });

        const activeMembers = computed(() => {
            const members = [];
            if (diners.value.bebe) members.push('bebe');
            if (diners.value.ariel) members.push('ariel');
            if (diners.value.jason) members.push('jason');
            return members;
        });

        const currentDish = computed(() => {
            const list = dishesList.value;
            if (!list || list.length === 0) return null;
            return list.find(d => d.id === selectedDish.value) || list[0];
        });

        const currentSopSteps = computed(() => {
            return currentDish.value ? (currentDish.value.sopSteps || []) : [];
        });

        const getIngredientName = (id) => {
            const ing = engine.getIngredientById(id);
            return ing ? ing.name : id;
        };

        const checkStock = (id) => {
            return engine.checkStock(id);
        };

        const isInCart = (id) => {
            return engine.isInShoppingList(id);
        };

        const toggleCart = async (id) => {
            const ing = engine.getIngredientById(id);
            const name = ing ? ing.name : id;
            await engine.toggleShoppingList({
                type: 'food',
                targetId: id,
                name: name,
                sourceDish: currentDish.value ? currentDish.value.name : '備料計算器'
            });
        };

        const statusIcon = (status) => {
            if (status === 'safe') return '🟢';
            if (status === 'over') return '🔴';
            return '⚫️';
        };

        const groupedCategories = computed(() => {
            if (!currentDish.value) return [];
            
            const filterStock = (arr) => {
                let items = [...(arr || [])];
                if (hideOutOfStock.value) {
                    items = items.filter(id => engine.checkStock(id));
                } else {
                    items.sort((a, b) => {
                        const stockA = engine.checkStock(a) ? 1 : 0;
                        const stockB = engine.checkStock(b) ? 1 : 0;
                        return stockB - stockA; 
                    });
                }
                return items;
            };

            const groups = [
                { label: '蛋白質', items: filterStock(currentDish.value.recommendedProteins) },
                { label: '蔬菜', items: filterStock(currentDish.value.recommendedVeggies) },
                { label: '碳水', items: filterStock(currentDish.value.recommendedCarbs) },
                { label: '醬料與油脂', items: filterStock(currentDish.value.recommendedSauces) }
            ];
            
            return groups.filter(g => g.items.length > 0);
        });

        // Filtered master library ingredients for drawer (Filtered by Search Query + Nutrient Tab)
        const filteredMasterIngredients = computed(() => {
            const q = (searchQuery.value || '').trim().toLowerCase();
            const cat = drawerCategory.value;
            const currentRecommended = [
                ...(currentDish.value?.recommendedProteins || []),
                ...(currentDish.value?.recommendedVeggies || []),
                ...(currentDish.value?.recommendedCarbs || []),
                ...(currentDish.value?.recommendedSauces || [])
            ];

            return (engine.data?.ingredients || []).filter(ing => {
                // Filter out already existing items in this dish
                if (currentRecommended.includes(ing.id)) return false;

                // Category filter
                if (cat !== 'all' && ing.category !== cat) return false;

                // Search query
                if (q && !ing.name.toLowerCase().includes(q) && !(ing.category || '').toLowerCase().includes(q)) {
                    return false;
                }
                return true;
            });
        });

        // Reset and populate ingredients when dish changes
        const onDishChange = () => {
            const dish = currentDish.value;
            if (dish) {
                // 1. 只有「預設食材 (defaultIngredients) 且 有庫存」或「推薦食材中有庫存者」才納入初始選取
                const initialMaster = [];
                
                // 若料理有明訂 defaultIngredients，以 defaultIngredients 且有庫存者為準
                if (dish.defaultIngredients && dish.defaultIngredients.length > 0) {
                    dish.defaultIngredients.forEach(item => {
                        if (checkStock(item.id) && !initialMaster.includes(item.id)) {
                            initialMaster.push(item.id);
                        }
                    });
                }
                
                // 若上述無任何有庫存者，則從推薦清單中挑選有庫存者
                if (initialMaster.length === 0) {
                    const allRec = [
                        ...(dish.recommendedProteins || []),
                        ...(dish.recommendedVeggies || []),
                        ...(dish.recommendedCarbs || []),
                        ...(dish.recommendedFats || []),
                        ...(dish.recommendedSauces || [])
                    ];
                    allRec.forEach(id => {
                        if (checkStock(id) && !initialMaster.includes(id)) {
                            initialMaster.push(id);
                        }
                    });
                }

                selectedMasterIngredients.value = initialMaster;

                // 2. Setup member ingredients
                ['bebe', 'ariel', 'jason'].forEach(member => {
                    if (dish.memberPortions && dish.memberPortions[member]) {
                        memberIngredients.value[member] = JSON.parse(JSON.stringify(dish.memberPortions[member]));
                    } else {
                        // Build defaults from defaultIngredients or standard list
                        const newIngredients = [];
                        const addIngredients = (arr) => {
                            if (!arr) return;
                            arr.forEach(id => {
                                const defItem = dish.defaultIngredients?.find(i => i.id === id);
                                const ingData = engine.getIngredientById(id);
                                const defaultUnit = ingData ? ingData.unitLabel || (ingData.isCount ? '顆' : 'g') : 'g';
                                if (defItem) {
                                    newIngredients.push({
                                        id: id,
                                        amount: defItem.amount,
                                        unit: defItem.unit || defaultUnit
                                    });
                                } else {
                                    let safeAmount = 50;
                                    if (ingData) {
                                        if (ingData.isCount || defaultUnit === '顆' || defaultUnit === '包' || defaultUnit === '條') {
                                            safeAmount = 1;
                                        } else if (ingData.category === 'sauces') {
                                            safeAmount = 10;
                                        } else if (ingData.category === 'proteins' || ingData.category === 'carbs') {
                                            safeAmount = 80;
                                        } else if (ingData.category === 'veggies') {
                                            safeAmount = 50;
                                        }
                                    }
                                    newIngredients.push({
                                        id: id,
                                        amount: safeAmount,
                                        unit: defaultUnit
                                    });
                                }
                            });
                        };
                        addIngredients(dish.recommendedProteins);
                        addIngredients(dish.recommendedVeggies);
                        addIngredients(dish.recommendedCarbs);
                        addIngredients(dish.recommendedSauces);
                        memberIngredients.value[member] = newIngredients;
                    }
                });
            } else {
                memberIngredients.value = { bebe: [], ariel: [], jason: [] };
                selectedMasterIngredients.value = [];
            }
        };

        // 監聽計算屬性 dishesList：確保非同步資料載入完成時依當前時段自動推薦第一道料理並初始化
        watch(dishesList, (newList) => {
            if (newList && newList.length > 0 && (!selectedDish.value || !userHasManuallySelected.value)) {
                selectedDish.value = getBestDefaultDishId();
            }
            if (selectedDish.value) {
                onDishChange();
            }
        }, { immediate: true });

        watch(selectedDish, (newId) => {
            if (newId) {
                onDishChange();
            }
        });

        onMounted(() => {
            if (dishesList.value.length > 0 && (!selectedDish.value || !userHasManuallySelected.value)) {
                selectedDish.value = getBestDefaultDishId();
            }
            if (selectedDish.value) {
                onDishChange();
            }
        });

        // Get only the active ingredients for a member (STRICTLY only selected in-stock ingredients)
        const getMemberActiveIngredients = (member) => {
            const list = memberIngredients.value[member] || [];
            return list.filter(item => selectedMasterIngredients.value.includes(item.id) && checkStock(item.id));
        };

        // Get original portion for reference display (e.g. "100g")
        const getDefaultAmount = (member, ingId) => {
            if (!currentDish.value) return '';
            const dish = currentDish.value;
            let item = null;
            if (dish.memberPortions && dish.memberPortions[member]) {
                item = dish.memberPortions[member].find(i => i.id === ingId);
            } else if (dish.defaultIngredients) {
                item = dish.defaultIngredients.find(i => i.id === ingId);
            }
            return item ? `${item.amount}${item.unit}` : '';
        };

        const totalPortions = computed(() => activeMembers.value.length);

        // Total aggregated ingredients across all active members STRICTLY filtered by selectedMasterIngredients
        const totalIngredientsList = computed(() => {
            const totals = {};
            
            selectedMasterIngredients.value.forEach(ingId => {
                if (!checkStock(ingId)) return;
                activeMembers.value.forEach(member => {
                    const list = memberIngredients.value[member] || [];
                    const item = list.find(i => i.id === ingId);
                    const memberName = engine.profiles[member]?.name || member;
                    
                    if (item) {
                        if (!totals[ingId]) {
                            totals[ingId] = {
                                id: ingId,
                                name: getIngredientName(ingId),
                                amount: 0,
                                unit: item.unit,
                                breakdown: []
                            };
                        }
                        totals[ingId].amount += Number(item.amount);
                        if (Number(item.amount) > 0) {
                            totals[ingId].breakdown.push({
                                memberName,
                                amount: item.amount,
                                unit: item.unit
                            });
                        }
                    }
                });
            });
            return Object.values(totals);
        });

        // Check if master ingredient is selected in Section 02
        const isIngredientSelected = (id) => {
            return selectedMasterIngredients.value.includes(id) && checkStock(id);
        };

        // Toggle master ingredient in Section 02 (Only for in-stock items)
        const toggleIngredient = (id) => {
            if (!checkStock(id)) return; // Out of stock items CANNOT be selected for cooking

            const index = selectedMasterIngredients.value.indexOf(id);
            if (index !== -1) {
                // Deselect from master filter
                selectedMasterIngredients.value.splice(index, 1);
            } else {
                // Select in master filter
                selectedMasterIngredients.value.push(id);
                
                // Ensure all members have this ingredient in their config
                ['bebe', 'ariel', 'jason'].forEach(member => {
                    const list = memberIngredients.value[member] || [];
                    if (!list.some(ing => ing.id === id)) {
                        const ingData = engine.getIngredientById(id);
                        if (ingData) {
                            let defaultAmount = 50;
                            if (ingData.isCount) {
                                defaultAmount = 1;
                            } else if (ingData.category === 'sauces') {
                                defaultAmount = 5;
                            } else if (ingData.category === 'proteins') {
                                defaultAmount = 80;
                            }
                            const defaultUnit = ingData.unitLabel || (ingData.isCount ? '顆' : 'g');
                            list.push({
                                id,
                                amount: defaultAmount,
                                unit: defaultUnit
                            });
                        }
                    }
                });
            }
        };

        // 5g Stepper increments (1g for micro-powders and count items)
        const adjustMemberAmount = (member, ing, delta) => {
            let step = 5; // Standard 5g step
            if (ing.unit === '顆' || ing.unit === '包' || ing.unit === '個') {
                step = 1;
            } else if (ing.amount <= 5 && delta < 0) {
                step = 1;
            } else if (ing.amount < 5 && delta > 0) {
                step = 1;
            }
            
            const newAmount = Math.max(0, ing.amount + (delta > 0 ? step : -step));
            ing.amount = newAmount;
        };

        // Drawer Controls
        const openAddModal = () => {
            searchQuery.value = '';
            drawerCategory.value = 'all';
            isQuickCreate.value = false;
            showAddModal.value = true;
        };

        const closeAddModal = () => {
            showAddModal.value = false;
            searchQuery.value = '';
            drawerCategory.value = 'all';
            isQuickCreate.value = false;
        };

        // Add Existing Master Ingredient to Current Dish
        const addExistingToDish = async (ing) => {
            if (!currentDish.value) return;
            const dish = currentDish.value;
            
            // Map category to dish property
            const catPropMap = {
                proteins: 'recommendedProteins',
                veggies: 'recommendedVeggies',
                carbs: 'recommendedCarbs',
                sauces: 'recommendedSauces'
            };
            const prop = catPropMap[ing.category] || 'recommendedProteins';
            if (!dish[prop]) dish[prop] = [];
            if (!dish[prop].includes(ing.id)) {
                dish[prop].push(ing.id);
            }
            
            // Auto select in 02 if has stock
            if (checkStock(ing.id) && !selectedMasterIngredients.value.includes(ing.id)) {
                selectedMasterIngredients.value.push(ing.id);
            }
            
            // Save dishes.json
            await engine.saveJson('dishes.json', engine.data.rawDishes || { dishes: engine.data.dishes });
            
            // Init member default amount
            ['bebe', 'ariel', 'jason'].forEach(m => {
                const list = memberIngredients.value[m] || [];
                if (!list.some(i => i.id === ing.id)) {
                    list.push({
                        id: ing.id,
                        amount: ing.isCount ? 1 : (ing.category === 'sauces' ? 5 : 50),
                        unit: ing.unitLabel || (ing.isCount ? '顆' : 'g')
                    });
                }
            });
            
            closeAddModal();
        };

        // 5-Second Quick Create New Ingredient
        const createAndAddToDish = async () => {
            const name = (quickForm.value.name || searchQuery.value || '').trim();
            if (!name) {
                alert('請填寫食材名稱！');
                return;
            }
            
            const newId = 'ing_' + Date.now();
            const category = quickForm.value.category || 'veggies';
            const unitLabel = quickForm.value.unitLabel || 'g';
            const isCount = quickForm.value.isCount || false;
            
            const newIng = {
                id: newId,
                name: name,
                category: category,
                isCount: isCount,
                unitLabel: unitLabel,
                per100g: { kcal: 50, protein: 1, carbs: 10, fat: 0.2, sodium: 5 }
            };
            
            // 1. Add to rawIngredients & ingredients list
            if (!engine.data.rawIngredients[category]) engine.data.rawIngredients[category] = [];
            engine.data.rawIngredients[category].push(newIng);
            engine.data.ingredients.push(newIng);
            await engine.saveJson('ingredients.json', engine.data.rawIngredients);
            
            // 2. Set stock to true in pantry_inventory.json
            if (!engine.data.pantryInventory.foodStockStatus) engine.data.pantryInventory.foodStockStatus = {};
            engine.data.pantryInventory.foodStockStatus[newId] = true;
            await engine.saveJson('pantry_inventory.json', engine.data.pantryInventory);
            
            // 3. Add to current dish
            await addExistingToDish(newIng);
            
            alert(`🎉 成功新增【${name}】並加入本道料理！`);
        };

        const getMemberNutrition = (member) => {
            return engine.calculateNutritionForMember(getMemberActiveIngredients(member), member);
        };

        const getMemberStatus = (member) => {
            return engine.getMemberStatusColor(member, getMemberNutrition(member));
        };

        const calculate = () => {
            isCalculated.value = true;
        };

        const resetToGoldenDefaults = () => {
            if (!currentDish.value) return;
            const dish = currentDish.value;
            activeMembers.value.forEach(member => {
                if (dish.memberPortions && dish.memberPortions[member]) {
                    memberIngredients.value[member] = JSON.parse(JSON.stringify(dish.memberPortions[member]));
                }
            });
            alert('✨ 已重置為全家專屬黃金配方推薦值！');
        };

        const copySOP = () => {
            alert('食譜與全家備料清單已複製！');
        };

        const goToTracker = () => {
            showRecordSuccessModal.value = false;
            if (props.onNavigate) {
                props.onNavigate('tracker');
            }
        };

        const recordMeal = async () => {
            if (!currentDish.value) return;
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            
            for (const member of activeMembers.value) {
                const ingredients = getMemberActiveIngredients(member).map(i => ({
                    id: i.id,
                    name: getIngredientName(i.id),
                    amount: i.amount,
                    unit: i.unit
                }));
                const nutrition = getMemberNutrition(member);
                
                const mealEntry = {
                    id: 'meal_' + Date.now() + '_' + member,
                    dishId: currentDish.value.id,
                    dishName: currentDish.value.name,
                    time: timeStr,
                    nutrients: nutrition,
                    ingredientsSummary: ingredients.map(i => `${i.name} ${i.amount}${i.unit}`)
                };
                
                await engine.recordMeal(dateStr, member, mealEntry);
            }
            
            recordSuccessDishName.value = currentDish.value.name;
            recordSuccessDate.value = dateStr;
            showRecordSuccessModal.value = true;
        };

        // Ingredient Detail Modal & Long Press State (750ms heavy hold + anti-drag touchmove)
        const selectedIngredient = ref(null);
        let longPressTimer = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let isLongPressTriggered = false;

        const startIngredientPress = (id, event) => {
            isLongPressTriggered = false;
            if (event && event.type === 'touchstart' && event.touches && event.touches[0]) {
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
            }
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                isLongPressTriggered = true;
                if (navigator.vibrate) navigator.vibrate(40);
                openIngredientDetail(id);
            }, 750);
        };

        const handleIngredientTouchMove = (event) => {
            if (!longPressTimer) return;
            if (event.touches && event.touches[0]) {
                const moveX = Math.abs(event.touches[0].clientX - touchStartX);
                const moveY = Math.abs(event.touches[0].clientY - touchStartY);
                if (moveX > 6 || moveY > 6) {
                    cancelIngredientPress();
                }
            }
        };

        const cancelIngredientPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const openIngredientDetail = (id) => {
            const ing = engine.getIngredientById(id);
            if (ing) {
                // 確保 per100g 結構健全，防止無 per100g 的食材（如蛋、培根）引發 template 報錯崩潰
                if (!ing.per100g) {
                    if (ing.perUnit) {
                        ing.per100g = {
                            kcal: Math.round((ing.perUnit.kcal || 0) * 1.8),
                            protein: Math.round((ing.perUnit.protein || 0) * 1.8 * 10) / 10,
                            carbs: Math.round((ing.perUnit.carbs || 0) * 1.8 * 10) / 10,
                            fat: Math.round((ing.perUnit.fat || 0) * 1.8 * 10) / 10,
                            sodium: Math.round((ing.perUnit.sodium || 0) * 1.8)
                        };
                    } else {
                        ing.per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
                    }
                }
                selectedIngredient.value = ing;
                showIngredientDetailModal.value = true;
            }
        };

        const handleIngredientClick = (id) => {
            if (longPressTimer) clearTimeout(longPressTimer);
            if (!isLongPressTriggered) {
                toggleIngredient(id);
            }
            isLongPressTriggered = false;
        };

        const handleDisabledClick = (id) => {
            if (longPressTimer) clearTimeout(longPressTimer);
            // 短按無庫存食材不觸發彈窗，只有長按 750ms (startIngredientPress) 才會開啟詳細資料卡片
            isLongPressTriggered = false;
        };

        const saveIngredientChanges = async (ing) => {
            if (!ing || !ing.id) return;
            let found = false;
            if (engine.data.rawIngredients) {
                const categories = ['proteins', 'veggies', 'carbs', 'sauces', 'drinks', 'fats'];
                for (const cat of categories) {
                    if (Array.isArray(engine.data.rawIngredients[cat])) {
                        const idx = engine.data.rawIngredients[cat].findIndex(item => item.id === ing.id);
                        if (idx !== -1) {
                            engine.data.rawIngredients[cat][idx] = { ...engine.data.rawIngredients[cat][idx], ...ing };
                            found = true;
                            break;
                        }
                    }
                }
            }
            if (found) {
                await engine.saveJson('ingredients.json', engine.data.rawIngredients);
                // 重新同步扁平化食材清單
                engine.data.ingredients = [];
                ['proteins', 'veggies', 'carbs', 'sauces', 'drinks', 'fats'].forEach(cat => {
                    if (engine.data.rawIngredients[cat]) {
                        engine.data.ingredients = engine.data.ingredients.concat(engine.data.rawIngredients[cat]);
                    }
                });
            }
        };

        const saveAndCloseIngredientModal = async (ing) => {
            await saveIngredientChanges(ing);
            showIngredientDetailModal.value = false;
        };

        const toggleStockInModal = async (ingId) => {
            const current = checkStock(ingId);
            await engine.toggleStock(ingId, !current);
        };

        const isFoodZoneSelected = (ing, zoneKey) => {
            if (!ing) return false;
            const zones = ing.storageZones || (ing.storageZone ? [ing.storageZone] : ['fridge']);
            return zones.includes(zoneKey);
        };

        const toggleFoodStorageZone = async (ing, zoneKey) => {
            if (!ing) return;
            let zones = ing.storageZones ? [...ing.storageZones] : (ing.storageZone ? [ing.storageZone] : ['fridge']);
            const idx = zones.indexOf(zoneKey);
            if (idx === -1) {
                zones.push(zoneKey);
            } else {
                if (zones.length > 1) {
                    zones.splice(idx, 1);
                }
            }
            ing.storageZones = zones;
            ing.storageZone = zones[0];
            await saveIngredientChanges(ing);
        };

        const isStoreSelected = (ing, store) => {
            if (!ing) return false;
            const stores = ing.preferredStores || (ing.preferredStore ? ing.preferredStore.split('/') : ['全聯']);
            return stores.includes(store);
        };

        const togglePreferredStore = async (ing, store) => {
            if (!ing) return;
            let stores = ing.preferredStores || (ing.preferredStore ? ing.preferredStore.split('/') : ['全聯']);
            const idx = stores.indexOf(store);
            if (idx === -1) {
                stores.push(store);
            } else {
                if (stores.length > 1) {
                    stores.splice(idx, 1);
                }
            }
            ing.preferredStores = stores;
            ing.preferredStore = stores.join('/');
            await saveIngredientChanges(ing);
        };

        const deleteIngredient = async (ingId) => {
            if (confirm('確定要永久刪除這個食材嗎？')) {
                await engine.deleteIngredient(ingId);
                showIngredientDetailModal.value = false;
            }
        };

        return {
            engine,
            selectedDish,
            memberIngredients,
            diners,
            hideOutOfStock,
            isCalculated,
            groupedCategories,
            filteredMasterIngredients,
            showAddModal,
            saveIngredientChanges,
            saveAndCloseIngredientModal,
            toggleStockInModal,
            isFoodZoneSelected,
            toggleFoodStorageZone,
            isStoreSelected,
            togglePreferredStore,
            deleteIngredient,
            searchQuery,
            drawerCategory,
            drawerTabs,
            isQuickCreate,
            quickForm,
            showRecordSuccessModal,
            recordSuccessDishName,
            recordSuccessDate,
            showIngredientDetailModal,
            selectedIngredient,
            startIngredientPress,
            handleIngredientTouchMove,
            cancelIngredientPress,
            openIngredientDetail,
            handleIngredientClick,
            handleDisabledClick,
            currentSlot,
            recommendedDishes,
            otherDishes,
            userHasManuallySelected,
            activeMembers,
            dishesList,
            totalPortions,
            totalIngredientsList,
            showSOP,
            currentDish,
            currentSopSteps,
            getMemberNutrition,
            getMemberStatus,
            getDefaultAmount,
            getIngredientName,
            checkStock,
            isInCart,
            toggleCart,
            statusIcon,
            copySOP,
            recordMeal,
            calculate,
            resetToGoldenDefaults,
            onDishChange,
            toggleIngredient,
            isIngredientSelected,
            getMemberActiveIngredients,
            adjustMemberAmount,
            openAddModal,
            closeAddModal,
            addExistingToDish,
            createAndAddToDish
        };
    },
    template: `
        <div class="view-calculator">
            <!-- 01 DISH -->
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>01 DISH 選擇料理</span>
                <span style="font-size: 0.8rem; font-weight: 500; color: var(--color-primary); background: rgba(59, 130, 246, 0.12); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.25);">
                    {{ currentSlot.name }}推薦
                </span>
            </div>
            <select v-model="selectedDish" @change="userHasManuallySelected = true; onDishChange();" class="select-box" style="margin-bottom: 24px;">
                <optgroup :label="currentSlot.name + '推薦料理'">
                    <option v-for="dish in recommendedDishes" :key="'rec_' + dish.id" :value="dish.id">
                        {{ dish.name }}
                    </option>
                </optgroup>
                <optgroup label="所有料理清單" v-if="otherDishes.length > 0">
                    <option v-for="dish in otherDishes" :key="'other_' + dish.id" :value="dish.id">
                        {{ dish.name }}
                    </option>
                </optgroup>
            </select>

            <div v-if="currentDish">
                <!-- 02 INGREDIENTS -->
                <div class="section-title">
                    <span>02 食材選取</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-icon" style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;" @click="hideOutOfStock = !hideOutOfStock">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>{{ hideOutOfStock ? '顯示全部' : '快篩' }}</span>
                        </button>
                        <button class="btn-icon" style="padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;" @click="openAddModal">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>新增食材</span>
                        </button>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div v-for="group in groupedCategories" :key="group.label" style="margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 8px;">{{ group.label }}</div>
                        <div class="capsule-group">
                            <template v-for="id in group.items" :key="id">
                                <!-- In Stock Capsule (Short Tap: Toggle Cooking / Heavy Long Press 750ms: 100g Nutrition Detail) -->
                                <div v-if="checkStock(id)"
                                     class="capsule in-stock"
                                     :class="{ 'selected': isIngredientSelected(id) }"
                                     style="cursor: pointer; user-select: none;"
                                     @mousedown="startIngredientPress(id, $event)"
                                     @mouseup="cancelIngredientPress"
                                     @mouseleave="cancelIngredientPress"
                                     @touchstart="startIngredientPress(id, $event)"
                                     @touchmove="handleIngredientTouchMove($event)"
                                     @touchend="cancelIngredientPress"
                                     @touchcancel="cancelIngredientPress"
                                     @click="handleIngredientClick(id)">
                                    {{ getIngredientName(id) }}
                                </div>
                                <!-- Out of Stock Capsule (Short Tap/Long Press: Open 100g Nutrition Detail) -->
                                <div v-else
                                     class="capsule out-stock disabled"
                                     style="cursor: pointer; user-select: none;"
                                     title="無庫存 (點擊或長按查看 100g 營養與採買)"
                                     @mousedown="startIngredientPress(id, $event)"
                                     @mouseup="cancelIngredientPress"
                                     @mouseleave="cancelIngredientPress"
                                     @touchstart="startIngredientPress(id, $event)"
                                     @touchmove="handleIngredientTouchMove($event)"
                                     @touchend="cancelIngredientPress"
                                     @touchcancel="cancelIngredientPress"
                                     @click="handleDisabledClick(id)">
                                    <span>{{ getIngredientName(id) }}</span>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- DINERS -->
                <div class="section-title">人數與計算橫列</div>
                <div class="capsule-group" style="margin-bottom: 24px; align-items: center;">
                    <label class="capsule" :class="{ 'selected': diners.bebe }" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" v-model="diners.bebe" style="display:none;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                        </svg>
                        <span>Bebe</span>
                    </label>
                    <label class="capsule" :class="{ 'selected': diners.ariel }" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" v-model="diners.ariel" style="display:none;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <span>樂樂</span>
                    </label>
                    <label class="capsule" :class="{ 'selected': diners.jason }" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" v-model="diners.jason" style="display:none;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 18L3 11L9 4L17 5L21 11L19 19L11 21L5 18Z"></path>
                            <line x1="9" y1="4" x2="11" y2="12"></line>
                            <line x1="11" y1="12" x2="19" y2="19"></line>
                            <line x1="11" y1="12" x2="3" y2="11"></line>
                        </svg>
                        <span>Jason</span>
                    </label>
                    <button class="btn-icon" @click="calculate" style="width: 42px; height: 42px; border-radius: 50%; background: var(--color-primary); color: white; border: none; margin-left: auto; padding: 0; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(245, 166, 35, 0.4); cursor: pointer;" title="進行備料計算">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                            <line x1="8" y1="6" x2="16" y2="6"></line>
                            <line x1="16" y1="14" x2="16" y2="18"></line>
                            <path d="M8 10h.01"></path>
                            <path d="M12 10h.01"></path>
                            <path d="M16 10h.01"></path>
                            <path d="M8 14h.01"></path>
                            <path d="M12 14h.01"></path>
                            <path d="M8 18h.01"></path>
                            <path d="M12 18h.01"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div v-if="selectedDish && isCalculated">
                <!-- 03 PORTIONS -->
                <div class="section-title">03 PORTIONS 全家備料大白板</div>
                <div class="card" style="margin-bottom: 24px; background: #fffdf8; border: 1px solid var(--color-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <span style="font-weight: 700; color: var(--color-text-main);">全家總備料 ({{ totalPortions }} 人份)</span>
                        <button class="btn-icon" @click="copySOP" style="font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>複製食譜</span>
                        </button>
                    </div>
                    
                    <ul style="list-style: none; padding-left: 0; margin-bottom: 16px;">
                        <li v-for="item in totalIngredientsList" :key="item.id" style="margin-bottom: 8px; font-size: 0.95rem; line-height: 1.5;">
                            <span style="font-weight: 700; color: var(--color-text-main);">✔️ {{ item.name }}：</span>
                            <span style="font-weight: 800; color: var(--color-primary);">{{ item.amount }}{{ item.unit }}</span>
                            <span v-if="activeMembers.length > 1 && item.breakdown.length > 0" style="font-size: 0.8rem; color: #888; font-weight: 400; margin-left: 6px;">
                                (<span v-for="(b, bIdx) in item.breakdown" :key="bIdx">{{ b.memberName }} {{ b.amount }}{{ b.unit }}<span v-if="bIdx < item.breakdown.length - 1">, </span></span>)
                            </span>
                        </li>
                    </ul>

                    <button class="btn-icon" @click="showSOP = !showSOP" style="width: 100%; justify-content: center; display: flex; align-items: center; gap: 8px;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                        <span>檢視食譜 SOP 步驟 {{ showSOP ? '∧' : 'v' }}</span>
                    </button>
                    <div v-if="showSOP" style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--color-border); font-size: 0.95rem; color: #2D3748; font-weight: 500; line-height: 1.8;">
                        <p v-if="selectedDish">
                            <span v-for="step in currentSopSteps" :key="step">
                                {{ step }}<br><br>
                            </span>
                        </p>
                    </div>
                </div>

                <!-- 04 MEMBER CARDS -->
                <div class="section-title">04 MEMBER CARDS 全家成員卡片</div>
                <div class="card" v-for="member in activeMembers" :key="member" style="margin-bottom: 16px;">
                    <h3 style="margin-bottom: 12px; font-size: 1.1rem;">{{ engine.profiles[member].name }} 的專屬份量</h3>
                    
                    <!-- Status Tags -->
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; font-size: 0.75rem;">
                        <span class="status-tag" :class="getMemberStatus(member).kcal">
                            {{ statusIcon(getMemberStatus(member).kcal) }} 熱量: {{ getMemberNutrition(member).kcal }}k
                        </span>
                        <span class="status-tag" :class="getMemberStatus(member).protein">
                            {{ statusIcon(getMemberStatus(member).protein) }} 蛋白: {{ getMemberNutrition(member).protein }}g
                        </span>
                        <span class="status-tag" :class="getMemberStatus(member).carbs">
                            {{ statusIcon(getMemberStatus(member).carbs) }} 碳水: {{ getMemberNutrition(member).carbs }}g
                        </span>
                        <span class="status-tag" :class="getMemberStatus(member).fat">
                            {{ statusIcon(getMemberStatus(member).fat) }} 脂: {{ getMemberNutrition(member).fat }}g
                        </span>
                        <span class="status-tag" :class="getMemberStatus(member).sodium">
                            {{ statusIcon(getMemberStatus(member).sodium) }} 鈉: {{ getMemberNutrition(member).sodium }}mg
                        </span>
                    </div>

                    <!-- Member Steppers: Name + (Xg) + [ - ] Yg [ + ] -->
                    <div v-for="ing in getMemberActiveIngredients(member)" :key="ing.id" 
                         style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);">
                        <div style="display: flex; align-items: baseline;">
                            <span style="font-weight: 500;">{{ getIngredientName(ing.id) }}</span>
                            <span v-if="getDefaultAmount(member, ing.id)" 
                                  style="font-size: 0.75rem; color: #9CA3AF; font-weight: 400; margin-left: 6px;">
                                ({{ getDefaultAmount(member, ing.id) }})
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <button class="btn-icon" @click="adjustMemberAmount(member, ing, -1)" style="padding: 4px 10px;">-</button>
                            <span style="width: 50px; text-align: center; font-weight: 600;">{{ ing.amount }}{{ ing.unit }}</span>
                            <button class="btn-icon" @click="adjustMemberAmount(member, ing, 1)" style="padding: 4px 10px;">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="fab-container" v-if="selectedDish && isCalculated">
                <button class="btn-primary" style="background: #FFFFFF; color: var(--color-text-main); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; gap: 6px;" @click="openAddModal">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>加食材</span>
                </button>
                <button class="btn-primary" @click="resetToGoldenDefaults" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    <span>重設</span>
                </button>
                <button class="btn-primary accent" @click="recordMeal" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    <span>紀錄</span>
                </button>
            </div>

            <!-- 75% 搜尋食材與 5秒現場新增抽屜 (Slide-up Drawer with Nutrient Tabs) -->
            <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
                <div class="drawer-content">
                    <!-- 第一行：搜尋框 ＋ 新增全新食材按鈕 ＋ 關閉按鈕 -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 14px;">
                        <input type="text" 
                               v-model="searchQuery" 
                               placeholder="🔍 搜尋大總庫食材..." 
                               class="search-input"
                               style="flex: 1; padding: 10px 14px;">
                        <button class="btn-icon" 
                                @click="isQuickCreate = !isQuickCreate" 
                                style="white-space: nowrap; padding: 10px 14px; font-weight: 600; color: var(--color-primary); background: #FAF8F5; flex-shrink: 0; border: 1px solid var(--color-border);">
                            ➕ 新增全新食材
                        </button>
                        <button class="btn-icon" @click="closeAddModal" style="border: none; font-size: 1.1rem; padding: 6px 10px; flex-shrink: 0; color: var(--color-text-muted);">✕</button>
                    </div>

                    <!-- Quick 5-second Form (點擊展開) -->
                    <div v-if="isQuickCreate" style="background: #FAF8F5; border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; margin-bottom: 14px;">
                        <div style="font-weight: 700; margin-bottom: 12px; font-size: 0.95rem;">⚡ 5秒極速新增食材至總庫</div>
                        <div style="margin-bottom: 10px;">
                            <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">食材名稱</label>
                            <input type="text" v-model="quickForm.name" :placeholder="searchQuery || '輸入名稱...'" class="search-input" style="background: #FFF; padding: 8px 12px;">
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                            <div style="flex: 1;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">分類</label>
                                <select v-model="quickForm.category" class="select-box" style="padding: 8px 12px; font-size: 0.9rem; background: #FFF;">
                                    <option value="proteins">🥩 蛋白質</option>
                                    <option value="veggies">🥦 蔬菜水果</option>
                                    <option value="carbs">🍚 碳水主食</option>
                                    <option value="sauces">🧂 醬料與油脂</option>
                                    <option value="drinks">☕️ 飲品與沖泡</option>
                                </select>
                            </div>
                            <div style="flex: 1;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">計算單位</label>
                                <select v-model="quickForm.unitLabel" class="select-box" style="padding: 8px 12px; font-size: 0.9rem; background: #FFF;">
                                    <option value="g">公克 (g)</option>
                                    <option value="顆">顆</option>
                                    <option value="包">包</option>
                                    <option value="條">條</option>
                                </select>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                            <button class="btn-icon" @click="isQuickCreate = false">取消</button>
                            <button class="btn-icon" @click="createAndAddToDish" style="background: var(--color-primary); color: #FFF; border: none; font-weight: 600;">
                                💾 儲存並加入料理
                            </button>
                        </div>
                    </div>

                    <!-- Nutrient Category Tabs (營養素分類切換列) -->
                    <div style="display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px;">
                        <button v-for="tab in drawerTabs" 
                                :key="tab.id"
                                class="capsule"
                                :class="{ 'selected': drawerCategory === tab.id }"
                                style="padding: 6px 12px; font-size: 0.85rem; white-space: nowrap; cursor: pointer; flex-shrink: 0;"
                                @click="drawerCategory = tab.id">
                            {{ tab.label }}
                        </button>
                    </div>

                    <!-- Master Ingredient Search Results (Filtered by Tab) -->
                    <div style="max-height: 40vh; overflow-y: auto;">
                        <div class="capsule-group" style="gap: 8px;">
                            <div v-for="ing in filteredMasterIngredients" 
                                 :key="ing.id" 
                                 class="capsule"
                                 :class="{ 'selected': ing.isAlreadyInDish }"
                                 style="cursor: pointer; font-size: 0.9rem; padding: 6px 14px;"
                                 @click="addExistingToDish(ing)">
                                <span>{{ ing.name }}</span>
                                <span v-if="ing.isAlreadyInDish" style="font-size: 0.75rem; color: #1B5E20; margin-left: 4px;">(已在料理中)</span>
                                <span v-else-if="!ing.hasStock" style="font-size: 0.75rem; color: #9CA3AF; margin-left: 4px;">(無庫存)</span>
                                <span v-else style="font-size: 0.8rem; color: var(--color-primary); margin-left: 4px;">➕</span>
                            </div>
                            <div v-if="filteredMasterIngredients.length === 0" style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 0.9rem; width: 100%;">
                                查無符合食材，點擊上方按鈕可 5 秒新增！
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="showRecordSuccessModal" class="modal-overlay" @click.self="showRecordSuccessModal = false">
                <div class="drawer-content" style="max-width: 480px; text-align: center; border-radius: 24px; padding: 32px 24px;">
                    <div style="font-size: 2.8rem; margin-bottom: 12px;">🎉</div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; color: var(--color-text-main);">
                        成功寫入飲食進度！
                    </h3>
                    <p style="font-size: 0.95rem; color: var(--color-text-muted); margin-bottom: 24px; line-height: 1.6;">
                        已將【<strong style="color: var(--color-text-main);">{{ recordSuccessDishName }}</strong>】記錄至今日 ({{ recordSuccessDate }}) 飲食時間軸中。
                    </p>

                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn-icon" @click="showRecordSuccessModal = false" style="padding: 12px 20px; font-weight: 600; font-size: 0.95rem;">
                            留在本頁
                        </button>
                        <button class="btn-primary accent" @click="goToTracker" style="padding: 12px 24px; font-weight: 700; font-size: 0.95rem;">
                            📊 前往查看今日紀錄 ➔
                        </button>
                    </div>
                </div>
            </div>

            <!-- 📱 長按/點擊【食材 100g 營養數據與詳細資料 Modal】 -->
            <div v-if="showIngredientDetailModal && selectedIngredient" class="modal-overlay" @click.self="showIngredientDetailModal = false">
                <div class="drawer-content" style="max-width: 440px; padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <!-- 1. 食材名稱：灰色實底線，刪除鉛筆 Icon -->
                        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                            <span style="font-size: 1.2rem;">🥗</span>
                            <input type="text" 
                                   v-model="selectedIngredient.name" 
                                   @change="saveIngredientChanges(selectedIngredient)" 
                                   placeholder="食材名稱"
                                   style="font-weight: 700; font-size: 1.1rem; border: none; border-bottom: 1.5px solid var(--color-border); background: transparent; padding: 2px 4px; width: 160px; color: var(--color-text-main); outline: none;" />
                        </div>
                        <!-- 2. 「有庫存」跟「沒庫存」可互相切換按鈕 -->
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button class="capsule" 
                                    :class="checkStock(selectedIngredient.id) ? 'selected' : 'disabled'" 
                                    @click="toggleStockInModal(selectedIngredient.id)" 
                                    style="cursor: pointer; padding: 4px 10px; font-size: 0.8rem; font-weight: 700; user-select: none;">
                                {{ checkStock(selectedIngredient.id) ? '❄️ 有庫存' : '🛒 無庫存' }}
                            </button>
                            <button class="btn-icon" @click="showIngredientDetailModal = false" style="border: none; font-size: 1.1rem;">✕</button>
                        </div>
                    </div>

                    <!-- 2. 每 100g 營養成份規格 (成份可直接修改，標題簡潔) -->
                    <div style="background: #FAF8F5; border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span>📊 每 100g 營養成份規格：</span>
                            <span v-if="selectedIngredient.servingSize && selectedIngredient.per100g" style="font-size: 0.72rem; color: #047857; background: #ECFDF5; padding: 2px 8px; border-radius: 6px; font-weight: 600;">
                                💡 單份({{ selectedIngredient.servingSize }}{{ selectedIngredient.servingUnit || 'g' }}): {{ Math.round((selectedIngredient.per100g.kcal || 0) * (selectedIngredient.servingSize / 100)) }} kcal
                            </span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>🔥 熱量</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedIngredient.per100g.kcal" @change="saveIngredientChanges(selectedIngredient)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">kcal</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>🥩 蛋白質</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedIngredient.per100g.protein" @change="saveIngredientChanges(selectedIngredient)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>🍚 碳水</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedIngredient.per100g.carbs" @change="saveIngredientChanges(selectedIngredient)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>🥑 脂肪</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedIngredient.per100g.fat" @change="saveIngredientChanges(selectedIngredient)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 📍 存放分區 (可複選/切換：冷藏區、冷凍區、常溫區) -->
                    <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">
                            📍 存放分區：
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button v-for="z in [{key:'fridge', label:'❄️ 冷藏區'}, {key:'freezer', label:'🧊 冷凍區'}, {key:'pantry', label:'🏠 常溫區'}]" 
                                    :key="z.key"
                                    class="capsule"
                                    :class="isFoodZoneSelected(selectedIngredient, z.key) ? 'selected' : 'in-stock'"
                                    style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                    @click="toggleFoodStorageZone(selectedIngredient, z.key)">
                                {{ z.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 3. 常用採買通路 (統一系統膠囊UI) & 4. 純 🛒 圖示按鈕 -->
                    <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">🏬 常用採買通路：</span>
                            <!-- 4. 加入採買清單：純 🛒 圖示按鈕 -->
                            <button class="btn-icon" 
                                    @click="toggleCart(selectedIngredient.id)" 
                                    style="padding: 6px 10px; border-radius: var(--radius-full); border: 1.5px solid var(--color-border); cursor: pointer; transition: all 0.15s ease;"
                                    :style="{ background: isInCart(selectedIngredient.id) ? 'var(--color-mint-active)' : '#FFFFFF', color: isInCart(selectedIngredient.id) ? '#FFFFFF' : 'var(--color-cart-gray)', borderColor: isInCart(selectedIngredient.id) ? 'var(--color-mint-active)' : 'var(--color-border)' }"
                                    :title="isInCart(selectedIngredient.id) ? '已在採買清單 (點擊移除)' : '加入採買清單'">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                    <circle cx="9" cy="21" r="1"></circle>
                                    <circle cx="20" cy="21" r="1"></circle>
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                </svg>
                            </button>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button v-for="store in ['全聯', 'Costco', '義美', 'EC', '傳統市場', '其他']" 
                                    :key="store"
                                    class="capsule"
                                    :class="isStoreSelected(selectedIngredient, store) ? 'selected' : 'in-stock'"
                                    style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                    @click="togglePreferredStore(selectedIngredient, store)">
                                {{ store }}
                            </button>
                        </div>
                    </div>

                    <!-- 5. 底部 3 按鈕：更新外包裝照片 | 🗑️ 刪除食材 | 💾 儲存 -->
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" @click="showIngredientDetailModal = false" style="flex: 1.2; justify-content: center; padding: 10px 6px; font-size: 0.8rem; font-weight: 600;">
                            📸 外包裝照片
                        </button>
                        <button class="btn-icon" @click="deleteIngredient(selectedIngredient.id)" style="flex: 1.2; justify-content: center; padding: 10px 6px; font-size: 0.8rem; font-weight: 600; color: #EF4444; background: #FEF2F2; border-color: #FCA5A5;">
                            🗑️ 刪除食材
                        </button>
                        <button class="btn-primary" @click="saveAndCloseIngredientModal(selectedIngredient)" style="flex: 1; justify-content: center; padding: 10px 6px; font-size: 0.85rem; font-weight: 600;">
                            💾 儲存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};
