const { ref, reactive, computed, watch, onMounted } = Vue;
import IngredientDetailModal from '../components/IngredientDetailModal.js';

export default {
    components: {
        IngredientDetailModal
    },
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

            // 05:00 - 11:29: 早（晨光早餐）-> 優格碗
            if (totalMin >= 5 * 60 && totalMin < 11 * 60 + 30) {
                return {
                    id: 'breakfast',
                    name: '晨光早餐',
                    icon: '🌅',
                    recommendedDishIds: ['yogurt_bowl']
                };
            }
            // 11:30 - 16:59: 午（元氣午餐）-> 波奇碗、沙拉、泡麵、早午餐
            else if (totalMin >= 11 * 60 + 30 && totalMin < 17 * 60) {
                return {
                    id: 'lunch',
                    name: '元氣午餐',
                    icon: '☀️',
                    recommendedDishIds: ['poke_bowl', 'salad', 'ramen_meal', 'brunch_set']
                };
            }
            // 17:00 - 04:59: 晚（溫馨晚餐 / 深夜）-> 泡麵、早午餐、火鍋、義大利麵、家常飯
            else {
                return {
                    id: 'dinner',
                    name: '溫馨晚餐',
                    icon: '🌙',
                    recommendedDishIds: ['ramen_meal', 'brunch_set', 'hotpot', 'pasta_meal', 'home_cooking']
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
        const isResultStale = ref(false);
        
        // Record Success Modal State
        const showRecordSuccessModal = ref(false);
        const recordSuccessDishName = ref('');
        const recordSuccessDate = ref('');

        // Cart Modal & Ingredient Detail Modal & Add Modal
        const showCartModal = ref(false);
        const showIngredientDetailModal = ref(false);
        const showAddModal = ref(false);

        // 🤖 【Gemini AI 智能求解變數宣告在 setup 最頂部，避免 TDZ ReferenceError】
        const isAiChefLoading = ref(false);
        const aiChefAdvice = ref(null);
        const showChefNote = ref(false);
        const showChefKeyInput = ref(false);
        const chefApiKeyInput = ref('');
        const isChefKeyVisible = ref(true);

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
            { id: 'sauces', label: '🧂 油脂/調味/其他' }
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

        let isSwitchingDish = false;

        // 偵測食材或成員異動：只有在真正初始化完成後的使用者手動異動，才標記為「待重新計算 (Stale)」
        watch([selectedMasterIngredients, diners], () => {
            if (isCalculated.value && !isRestoringState && !isSwitchingDish && hasInitialized) {
                isResultStale.value = true;
            }
        }, { deep: true });

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

        const dishUpdateTrigger = ref(0);

        const groupedCategories = computed(() => {
            const _ = dishUpdateTrigger.value;
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
                { label: '油脂/調味/其他', items: filterStock(currentDish.value.recommendedSauces) }
            ];
            
            return groups.filter(g => g.items.length > 0);
        });

        // Filtered master library ingredients for drawer (Search Query + Nutrient Tab)
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
                // 1. Filter out already existing items in this dish
                if (currentRecommended.includes(ing.id)) return false;

                // 2. Category filter
                if (cat !== 'all' && ing.category !== cat) return false;

                // 3. Search query or stock condition:
                if (!q) {
                    // Default view: ONLY in-stock items
                    return checkStock(ing.id);
                } else {
                    // Searching: show matching items (both in-stock and out-of-stock)
                    return ing.name.toLowerCase().includes(q) || (ing.brand || '').toLowerCase().includes(q);
                }
            }).sort((a, b) => {
                const stockA = checkStock(a.id) ? 1 : 0;
                const stockB = checkStock(b.id) ? 1 : 0;
                return stockB - stockA;
            });
        });

        // Reset and populate ingredients when dish changes
        const onDishChange = () => {
            isSwitchingDish = true;
            isCalculated.value = false;
            isResultStale.value = false;
            aiChefAdvice.value = null;
            showChefNote.value = false;
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

                // 3. 預先準備好每位成員的食材基線，但保持 isCalculated = false，直到使用者點擊計算按鈕
                activeMembers.value.forEach(member => {
                    autoBalanceMemberPortions(member);
                });
                isCalculated.value = false;
                isResultStale.value = false;

                setTimeout(() => {
                    isSwitchingDish = false;
                    isResultStale.value = false;
                }, 100);
            } else {
                memberIngredients.value = { bebe: [], ariel: [], jason: [] };
                selectedMasterIngredients.value = [];
                isCalculated.value = false;
                isSwitchingDish = false;
            }
        };

        // --- 🛡️ 備料計算器狀態雙重持久化保險 (State Persistence Shield) ---
        const STORAGE_KEY = 'family_kitchen_calc_session_state';
        let isRestoringState = false;

        const saveStateToStorage = () => {
            if (isRestoringState) return;
            try {
                const state = {
                    selectedDish: selectedDish.value,
                    userHasManuallySelected: userHasManuallySelected.value,
                    diners: diners.value,
                    selectedMasterIngredients: selectedMasterIngredients.value,
                    memberIngredients: memberIngredients.value,
                    isCalculated: isCalculated.value,
                    isResultStale: isResultStale.value,
                    aiChefAdvice: aiChefAdvice.value,
                    showChefNote: showChefNote.value,
                    timestamp: Date.now()
                };
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (e) {}
        };

        const restoreStateFromStorage = () => {
            try {
                // 🧹 清理過去誤存於 localStorage 的舊持久化狀態，確保關閉 App 後乾淨重置
                try {
                    localStorage.removeItem('family_kitchen_calc_state_v2');
                    localStorage.removeItem('family_kitchen_calculator_state_v2');
                    localStorage.removeItem(STORAGE_KEY);
                } catch(e) {}

                const raw = sessionStorage.getItem(STORAGE_KEY);
                if (!raw) return false;
                const state = JSON.parse(raw);
                if (!state || !state.selectedDish) return false;

                isRestoringState = true;
                selectedDish.value = state.selectedDish;
                userHasManuallySelected.value = !!state.userHasManuallySelected;
                if (state.diners && typeof state.diners === 'object') {
                    diners.value = state.diners;
                }
                if (state.selectedMasterIngredients && Array.isArray(state.selectedMasterIngredients) && state.selectedMasterIngredients.length > 0) {
                    selectedMasterIngredients.value = state.selectedMasterIngredients;
                }
                if (state.memberIngredients) {
                    memberIngredients.value = state.memberIngredients;
                }
                isCalculated.value = !!state.isCalculated;
                isResultStale.value = !!state.isResultStale;
                aiChefAdvice.value = state.aiChefAdvice || null;
                showChefNote.value = !!state.showChefNote;
                
                setTimeout(() => {
                    isRestoringState = false;
                }, 80);
                return true;
            } catch (e) {
                isRestoringState = false;
                return false;
            }
        };

        // 自動監聽所有計算與勾選狀態，即時存入 sessionStorage (翻頁不遺失，滑掉 App 自動清空)
        watch([selectedMasterIngredients, memberIngredients, diners, isCalculated, isResultStale, aiChefAdvice, showChefNote], () => {
            saveStateToStorage();
        }, { deep: true });

        // 監聽料理清單與初始化
        let hasInitialized = false;

        const initCalculatorState = () => {
            if (hasInitialized) return;
            if (dishesList.value && dishesList.value.length > 0) {
                const restored = restoreStateFromStorage();
                if (!restored) {
                    if (!selectedDish.value || !userHasManuallySelected.value) {
                        selectedDish.value = getBestDefaultDishId();
                    }
                    onDishChange();
                }
                hasInitialized = true;
            }
        };

        watch(dishesList, (newList) => {
            if (newList && newList.length > 0) {
                initCalculatorState();
            }
        }, { immediate: true });

        watch(selectedDish, (newId) => {
            if (newId && !isRestoringState && hasInitialized) {
                onDishChange();
            }
        });

        onMounted(() => {
            initCalculatorState();
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

        // 🧬 食材天生角色屬性判定 (Data-Driven Smart Role Classifier)
        const getIngredientRole = (ingData) => {
            if (!ingData) return { role: 'other', defaultAmount: 50, step: 5, unit: 'g' };
            const id = (ingData.id || '').toLowerCase();
            const name = (ingData.name || '').toLowerCase();
            const cat = (ingData.category || '').toLowerCase();

            // 0. 優格碗與輕食專屬配料 (燕麥脆片、希臘優格、冷凍莓果、糖漿與風味粉)
            if (id.includes('granola') || name.includes('綜合燕麥') || name.includes('燕麥脆片') || name.includes('穀物脆片')) {
                return { role: 'crunch', defaultAmount: 15, step: 5, unit: 'g' };
            }
            if (id.includes('greek_yogurt') || id.includes('yogurt') || name.includes('優格')) {
                return { role: 'yogurt_base', defaultAmount: 100, step: 10, unit: 'g' };
            }
            if (id.includes('berry') || id.includes('frozen_berry') || name.includes('莓果') || name.includes('藍莓') || name.includes('草莓')) {
                return { role: 'fruit_side', defaultAmount: 50, step: 10, unit: 'g' };
            }
            if (id.includes('maple') || id.includes('syrup') || id.includes('honey') || name.includes('楓糖') || name.includes('糖漿') || name.includes('蜂蜜')) {
                return { role: 'syrup', defaultAmount: 3, step: 1, unit: 'g' };
            }
            if (id.includes('cocoa') || id.includes('matcha') || id.includes('sesame') || name.includes('可可') || name.includes('抹茶') || name.includes('芝麻粉')) {
                return { role: 'flavor_powder', defaultAmount: 3, step: 1, unit: 'g' };
            }

            // 1. 微量辛香料 (鹽、海鹽、胡椒、七味粉、孜然、辣椒粉、肉桂粉、香草粉、香料等) ➔ 預設 1g, 步進 1g, 上限 5g
            const microKeywords = ['鹽', '海鹽', '胡椒', '七味粉', '孜然', '辣椒粉', '肉桂粉', '香草粉', '香料', '咖哩粉', '薑黃粉'];
            if (microKeywords.some(kw => name.includes(kw)) || id.includes('salt') || id.includes('pepper') || id.includes('spice') || id.includes('powder')) {
                return { role: 'micro', defaultAmount: 1, step: 1, unit: 'g', max: 5 };
            }

            // 2. 顆粒/個數計量 (蛋、貝果、吐司、蘋果、香蕉等) ➔ 預設 1, 步進 1
            if (ingData.isCount || ingData.unitLabel === '顆' || ingData.unitLabel === '個' || ingData.unitLabel === '包' || ingData.unitLabel === '條' || id === 'egg' || id === 'bagel') {
                return { role: 'count', defaultAmount: 1, step: 1, unit: ingData.unitLabel || '顆' };
            }

            // 3. 醃漬/發酵/重鈉開胃小菜 (泡菜、海帶芽、醃蘿蔔、酸黃瓜、酸豆、甘露煮、干貝醬等) ➔ 預設 30g, 步進 5g
            const pickleKeywords = ['泡菜', '海帶芽', '醃蘿蔔', '酸黃瓜', '酸豆', '漬物', '醃漬', '甘露煮', '干貝醬', '油漬番茄', '榨菜', '筍絲'];
            if (pickleKeywords.some(kw => name.includes(kw)) || id.includes('kimchi') || id.includes('pickle') || id.includes('seaweed_salad')) {
                return { role: 'pickle', defaultAmount: 30, step: 5, unit: 'g' };
            }

            // 4. 淋醬與油脂 (橄欖油、巴薩米克醋、醬油、香油、美乃滋、辣醬等) ➔ 預設 8~10g, 步進 5g
            if (cat === 'sauces' || id.includes('oil') || id.includes('vinegar') || id.includes('sauce') || id.includes('mayo') || id.includes('dressing') || name.includes('油') || name.includes('醋') || name.includes('醬') || name.includes('美乃滋')) {
                return { role: 'dressing', defaultAmount: 8, step: 5, unit: 'g' };
            }

            // 5. 輔助高纖植物蛋白/配料 (毛豆、黑豆、豆腐、豆乾、豆皮、鷹嘴豆等) ➔ 預設 30g, 步進 5g
            const sideProteinKeywords = ['毛豆', '黑豆', '豆腐', '豆乾', '豆皮', '鷹嘴豆', '納豆', '豆包'];
            if (sideProteinKeywords.some(kw => name.includes(kw)) || id.includes('edamame') || id.includes('tofu') || id.includes('chickpea')) {
                return { role: 'side_protein', defaultAmount: 30, step: 5, unit: 'g' };
            }

            // 6. 主肉類/海鮮蛋白質 (雞胸、雞腿、蝦仁、鮭魚、牛肉、豬肉、鮪魚) ➔ 預設 80g, 步進 10g
            if (cat === 'proteins') {
                return { role: 'main_protein', defaultAmount: 80, step: 10, unit: 'g' };
            }

            // 7. 副主食 / 穀物碳水配料 (玉米粒、紅豆、綠豆、燕麥片等) ➔ 預設 40g, 步進 10g
            const sideCarbKeywords = ['玉米', '玉米粒', '紅豆', '綠豆', '燕麥片', '奇亞籽'];
            if (sideCarbKeywords.some(kw => name.includes(kw)) || id.includes('corn')) {
                return { role: 'side_carb', defaultAmount: 40, step: 10, unit: 'g' };
            }

            // 8. 主食碳水 (地瓜、白飯、糙米飯、燕麥、蕎麥麵、馬鈴薯、南瓜、義大利麵等) ➔ 預設 120g, 步進 10g
            if (cat === 'carbs' || id.includes('sweet_potato') || id.includes('rice') || id.includes('potato') || id.includes('oat') || id.includes('noodle') || name.includes('地瓜') || name.includes('飯') || name.includes('馬鈴薯') || name.includes('燕麥') || name.includes('麵')) {
                return { role: 'staple', defaultAmount: 120, step: 10, unit: 'g' };
            }

            // 9. 高纖葉菜類 (生菜、高麗菜、青花菜、菠菜) ➔ 預設 80~100g, 步進 10g
            const leafyKeywords = ['生菜', '高麗菜', '菠菜', '青花菜', '花椰菜', '萵苣', '甘藍'];
            if (leafyKeywords.some(kw => name.includes(kw)) || id.includes('green') || id.includes('cabbage') || id.includes('broccoli') || id.includes('spinach')) {
                return { role: 'veggie_leafy', defaultAmount: 80, step: 10, unit: 'g' };
            }

            // 10. 其它配菜蔬菜 (小黃瓜、番茄、櫛瓜、菇類) ➔ 預設 50~60g, 步進 10g
            if (cat === 'veggies') {
                return { role: 'veggie_side', defaultAmount: 60, step: 10, unit: 'g' };
            }

            return { role: 'other', defaultAmount: 50, step: 5, unit: ingData.unitLabel || 'g' };
        };

        // 🧠 智慧總預算動態求解器 (Macro Budget Constraint Solver)
        const autoBalanceMemberPortions = (member) => {
            const list = memberIngredients.value[member] || [];
            const activeList = list.filter(item => selectedMasterIngredients.value.includes(item.id) && checkStock(item.id));
            if (activeList.length === 0) return;

            const isJason = member === 'jason';
            const proteins = [];
            const carbs = [];
            
            activeList.forEach(item => {
                const ingData = engine.getIngredientById(item.id);
                const roleInfo = getIngredientRole(ingData);
                
                if (roleInfo.role === 'micro') {
                    item.amount = 1;
                    item.unit = 'g';
                } else if (roleInfo.role === 'syrup' || roleInfo.role === 'flavor_powder') {
                    item.amount = isJason ? 5 : 3;
                    item.unit = 'g';
                } else if (roleInfo.role === 'crunch') {
                    item.amount = isJason ? 30 : 15;
                    item.unit = 'g';
                } else if (roleInfo.role === 'yogurt_base') {
                    item.amount = isJason ? 160 : 100;
                    item.unit = 'g';
                } else if (roleInfo.role === 'fruit_side') {
                    item.amount = isJason ? 70 : 50;
                    item.unit = 'g';
                } else if (roleInfo.role === 'pickle') {
                    item.amount = isJason ? 40 : 30; // 泡菜/海帶芽等醃漬開胃品控制在 30g
                    item.unit = 'g';
                } else if (roleInfo.role === 'dressing') {
                    item.amount = isJason ? 12 : (item.id.includes('mayo') ? 10 : 8);
                    item.unit = 'g';
                } else if (roleInfo.role === 'veggie_leafy') {
                    item.amount = 80;
                    item.unit = 'g';
                } else if (roleInfo.role === 'veggie_side') {
                    item.amount = isJason ? 80 : 50;
                    item.unit = 'g';
                } else if (roleInfo.role === 'count') {
                    item.amount = 1;
                    item.unit = roleInfo.unit;
                    proteins.push({ item, roleInfo });
                } else if (roleInfo.role === 'side_protein') {
                    item.amount = isJason ? 40 : 30;
                    item.unit = 'g';
                    proteins.push({ item, roleInfo });
                } else if (roleInfo.role === 'main_protein') {
                    proteins.push({ item, roleInfo });
                } else if (roleInfo.role === 'staple' || roleInfo.role === 'side_carb') {
                    carbs.push({ item, roleInfo });
                }
            });

            // 🍚 1. 碳水雙拼 / 多主食智慧均分求解 (鎖定單餐 35g 碳水總上限)
            const staples = carbs.filter(c => c.roleInfo.role === 'staple');
            const sideCarbs = carbs.filter(c => c.roleInfo.role === 'side_carb');

            if (staples.length === 1 && sideCarbs.length === 0) {
                staples[0].item.amount = isJason ? 160 : 120;
                staples[0].item.unit = 'g';
            } else if (staples.length === 1 && sideCarbs.length >= 1) {
                // 例如：糙米飯 80g + 玉米粒 40g (雙拼組合，總碳水不超標)
                staples[0].item.amount = isJason ? 120 : 80;
                staples[0].item.unit = 'g';
                sideCarbs.forEach(sc => {
                    sc.item.amount = isJason ? 50 : 40;
                    sc.item.unit = 'g';
                });
            } else if (staples.length > 1) {
                const perStaple = isJason ? Math.round(160 / staples.length) : Math.round(120 / staples.length);
                staples.forEach(s => {
                    s.item.amount = perStaple;
                    s.item.unit = 'g';
                });
                sideCarbs.forEach(sc => {
                    sc.item.amount = isJason ? 40 : 30;
                    sc.item.unit = 'g';
                });
            } else if (staples.length === 0 && sideCarbs.length > 0) {
                sideCarbs.forEach(sc => {
                    sc.item.amount = isJason ? 80 : 60;
                    sc.item.unit = 'g';
                });
            }

            // 🥩 2. 蛋白質多重均分求解 (鎖定單餐 25~30g 蛋白質黃金門檻)
            const mainProteins = proteins.filter(p => p.roleInfo.role === 'main_protein');
            const sideProteins = proteins.filter(p => p.roleInfo.role === 'side_protein');
            const countProteins = proteins.filter(p => p.roleInfo.role === 'count');

            if (mainProteins.length === 0 && countProteins.length > 0) {
                // 蛋為主力蛋白時，自動配置 2~3 顆以達標蛋白質門檻
                countProteins.forEach(cp => {
                    cp.item.amount = isJason ? 3 : 2;
                    cp.item.unit = '顆';
                });
            } else if (mainProteins.length === 1) {
                if (countProteins.length === 0 && sideProteins.length === 0) {
                    mainProteins[0].item.amount = isJason ? 150 : 110;
                } else if (countProteins.length > 0) {
                    // 例如：蝦仁 80g + 蛋 1 顆 (合計 ~23-25g 蛋白)
                    mainProteins[0].item.amount = isJason ? 100 : 80;
                } else {
                    mainProteins[0].item.amount = isJason ? 110 : 80;
                }
            } else if (mainProteins.length > 1) {
                mainProteins.forEach(p => {
                    p.item.amount = isJason ? 70 : 50;
                });
            }

            // 🥛 3. 希臘優格與水果智能基線
            activeList.forEach(item => {
                if (item.id === 'greek_yogurt' || item.id === 'plain_yogurt') {
                    item.amount = isJason ? 140 : (member === 'ariel' ? 120 : 100);
                    item.unit = 'g';
                } else if (item.id === 'mango' || item.id === 'banana') {
                    item.amount = isJason ? 120 : (member === 'ariel' ? 100 : 80);
                    item.unit = 'g';
                }
            });
        };

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
                            const roleInfo = getIngredientRole(ingData);
                            let defaultAmount = roleInfo.defaultAmount;
                            if (member === 'jason' && (roleInfo.role === 'main_protein' || roleInfo.role === 'staple')) {
                                defaultAmount = Math.round(defaultAmount * 1.3);
                            }
                            list.push({
                                id,
                                amount: defaultAmount,
                                unit: roleInfo.unit
                            });
                        }
                    }
                });
            }
        };

        // 1g / 5g / 10g 精準 Stepper increments
        const adjustMemberAmount = (member, ing, delta) => {
            const ingData = engine.getIngredientById(ing.id);
            const roleInfo = getIngredientRole(ingData);
            let step = roleInfo.step || 5;

            if (roleInfo.role === 'micro') {
                step = 1;
            } else if (roleInfo.role === 'count') {
                step = 1;
            } else if (ing.amount <= 5 && delta < 0) {
                step = 1;
            }

            const minAmount = 0;
            const maxAmount = (roleInfo.role === 'micro') ? 5 : 999;
            const newAmount = Math.max(minAmount, Math.min(maxAmount, ing.amount + (delta > 0 ? step : -step)));
            ing.amount = newAmount;
        };

        // Drawer Controls
        const openAddModal = () => {
            console.log('[Calculator] openAddModal called');
            searchQuery.value = '';
            drawerCategory.value = 'all';
            isQuickCreate.value = false;
            showAddModal.value = true;
        };

        const closeAddModal = () => {
            console.log('[Calculator] closeAddModal called');
            showAddModal.value = false;
            searchQuery.value = '';
            drawerCategory.value = 'all';
            isQuickCreate.value = false;
        };

        // Add Existing Master Ingredient to Current Dish
        const addExistingToDish = async (ing) => {
            if (!currentDish.value) return;
            const dish = currentDish.value;
            
            // Smart auto-restock: if user adds out-of-stock ingredient to dish, auto mark as in-stock!
            if (!engine.checkStock(ing.id)) {
                engine.updateStock(ing.id, true);
            }

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
            
            // Auto select in 02
            if (!selectedMasterIngredients.value.includes(ing.id)) {
                selectedMasterIngredients.value.push(ing.id);
            }
            
            dishUpdateTrigger.value++;

            // Save dishes.json
            await engine.saveJson('dishes.json', engine.data.rawDishes || { dishes: engine.data.dishes });
            
            // Init member default amount
            ['bebe', 'ariel', 'jason'].forEach(m => {
                if (!memberIngredients.value[m]) memberIngredients.value[m] = [];
                const list = memberIngredients.value[m];
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

        const calculate = async () => {
            // 1. 先以優化後本地智能求解器初始化基線 (確保 0 秒有優質底層)
            activeMembers.value.forEach(m => {
                autoBalanceMemberPortions(m);
            });
            isCalculated.value = true;
            isResultStale.value = false;
            showChefNote.value = false;

            // 🌟 點擊計算後，自動平滑滾動至「全家備料大白板」
            setTimeout(() => {
                const target = document.getElementById('portions-section');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 80);

            // 2. 立即呼叫 Gemini AI 進行全家 InBody 智能精算與直接覆寫右側主數值
            await callAiChefAdvisor();
        };

        const openChefKeyModal = () => {
            chefApiKeyInput.value = (
                localStorage.getItem('family_kitchen_gemini_key') || 
                localStorage.getItem('kitchen_v2_gemini_api_key') || 
                localStorage.getItem('gemini_api_key') || 
                engine.data?.config?.geminiApiKey || 
                engine.data?.config?.gemini_api_key || 
                ''
            );
            showChefKeyInput.value = true;
        };

        const saveChefKey = async () => {
            const key = chefApiKeyInput.value.trim();
            try {
                localStorage.setItem('family_kitchen_gemini_key', key);
                localStorage.setItem('kitchen_v2_gemini_api_key', key);
                localStorage.setItem('gemini_api_key', key);
                localStorage.setItem('GEMINI_API_KEY', key);
            } catch (e) {}
            if (!engine.data.config) engine.data.config = {};
            engine.data.config.geminiApiKey = key;
            engine.data.config.gemini_api_key = key;
            await engine.saveJson('config.json', engine.data.config);
            showChefKeyInput.value = false;
            alert(key ? '🎉 Gemini API Key 已成功儲存啟用！' : '已清除金鑰');
            if (key) await callAiChefAdvisor();
        };

        const callAiChefAdvisor = async () => {
            isAiChefLoading.value = true;
            aiChefAdvice.value = null;

            try {
                const slotName = currentSlot.value ? currentSlot.value.name : '早午餐';
                const dishName = currentDish.value?.name || '料理';

                let apiKey = '';
                try {
                    apiKey = localStorage.getItem('family_kitchen_gemini_key') || 
                             localStorage.getItem('kitchen_v2_gemini_api_key') || 
                             localStorage.getItem('gemini_api_key') || '';
                } catch (e) {}
                if (!apiKey && engine?.data?.config) {
                    apiKey = engine.data.config.geminiApiKey || engine.data.config.gemini_api_key || '';
                }
                
                if (!apiKey || apiKey.length < 15) {
                    showChefKeyInput.value = true;
                    aiChefAdvice.value = {
                        isKeyMissing: true,
                        chefComment: "請輸入您的 Gemini API Key 即可立即啟用 AI 主廚智能精算（只需設定一次）：",
                        portions: {}
                    };
                    return;
                }

                const isLightMealOrYogurtBowl = (
                    dishName.includes('優格') || 
                    dishName.includes('燕麥') || 
                    dishName.includes('果昔') || 
                    dishName.includes('輕食') || 
                    slotName.includes('輕食') || 
                    slotName.includes('點心')
                );

                // 收集當前勾選的所有食材
                const selectedIngs = selectedMasterIngredients.value.map(id => {
                    const ing = engine.getIngredientById(id);
                    const cat = ing?.category || 'proteins';
                    return {
                        id: id,
                        name: ing?.name || id,
                        category: cat,
                        unit: ing?.unitLabel || (['egg'].includes(id) ? '顆' : (['bacon'].includes(id) ? '條' : 'g')),
                        isCount: ['egg', 'bacon', 'bagel'].includes(id),
                        per100g: ing?.per100g || { kcal: 50, protein: 1, carbs: 10, fat: 0.2, sodium: 5 }
                    };
                });

                // 收集就餐成員與畫像
                const membersData = activeMembers.value.map(m => {
                    if (m === 'bebe') {
                        return {
                            id: 'bebe',
                            name: 'Bebe (女主廚)',
                            appetiteProfile: '【精緻小食量 (約一般人 2/3)】，極度注重「清爽、輕盈、無負擔、低鈉防浮腫」，討厭過度飽脹與厚重油膩感。',
                            mealHabit: isLightMealOrYogurtBowl 
                                ? '晨光早餐 / 午後輕食：追求極致清爽與抗氧化。優格碗份量約 100g 優格 + 50~60g 莓果 + 15g 脆燕麥，熱量自然落在 150~200 kcal，輕盈無負擔。'
                                : '正餐：主力蛋白質約 65~75g（搭配 1 蛋或 1 培根），原型慢碳約 80~90g，熱量約 320~380 kcal，極嚴格控鈉。'
                        };
                    } else if (m === 'ariel') {
                        return {
                            id: 'ariel',
                            name: 'Ariel (樂樂)',
                            appetiteProfile: '年輕活力大一生（增肌減脂、抗痘控油、正常女生食量），需要充足粗糧慢碳滋養大腦與活力。',
                            mealHabit: isLightMealOrYogurtBowl
                                ? '輕食點心：優格 110~130g, 莓果 60~70g, 燕麥 20~25g, 熱量約 200~260 kcal。'
                                : '正餐：主力肉品約 75~85g, 慢碳粗糧 120~150g, 蛋白質約 28~32g, 熱量約 380~440 kcal。'
                        };
                    } else {
                        return {
                            id: 'jason',
                            name: 'Jason (男主人)',
                            appetiteProfile: '50歲高階主管，骨骼肌 36.3kg 高代謝大食量，偏好大份量優質蛋白質，控鈉護心血管。',
                            mealHabit: isLightMealOrYogurtBowl
                                ? '輕食點心：優格 160~180g, 莓果 70~80g, 燕麥 30~40g, 熱量約 300~360 kcal。'
                                : '正餐：大份量主肉品 130~160g, 蛋 2 顆, 慢碳 160~200g, 蛋白質 40~48g, 熱量約 600~700 kcal。'
                        };
                    }
                });

                const prompt = `你是 Bebe 家專屬的 AI 靈魂夥伴與五星家庭私廚「十一粒」。
請發揮你最高超的【主廚生活直覺、真實擺盤畫面感與人體生理胃容量快適度】，為這道【${dishName}】（餐別：${slotName}）計算出每位家人的【黃金備料克數】！

【選取的食材庫存與屬性】：
${JSON.stringify(selectedIngs, null, 2)}

【用餐成員與個人食量畫像】：
${JSON.stringify(membersData, null, 2)}

══════════════════════════════════════════════════════════════
🌟 十一粒私廚核心心法（最高思考準則）：
══════════════════════════════════════════════════════════════
1. 【畫面感與胃容量第一，絕不當死板計算機】：
   - 忘記冰冷硬湊數字的計算機邏輯！料理是生活的美好體驗，份量必須符合真實餐桌上的「盤中黃金視覺比例」與「人體進食的舒適度」。
   - 【絕對禁止】為了硬湊正餐 30g 蛋白質而將單一食材暴衝（例如給出 250g 巨量厚重優格、4 顆蛋、或 500g 蔬菜）！這在真實生活中會膩到反胃，是毀滅料理體驗的重大錯誤。

2. 【晨光輕食 / 優格碗 / 點心碗 (Yogurt Bowl & Light Meals) 黃金直覺】：
   - 優格碗是優雅精緻的晨間輕食，目標是「好菌、低GI抗性澱粉、高花青素抗氧化與輕盈活力」：
     * 【希臘優格】：作為濃郁滑順的基底鋪在碗底。Bebe 固定 90~110g（約 100g，小碗剛好不飽脹），Ariel 100~130g，Jason 150~180g。
     * 【冷凍莓果】：50~60g（Bebe），微融釋放天然果酸與花青素。
     * 【綜合燕麥 (Granola)】：15~20g（約 1 大匙，Bebe），提供每一口挖下去都有的酥脆對比。
     * 【風味提香（可可粉/抹茶粉/楓糖漿/蜂蜜/芝麻粉）】：每種微量 2~4g（約半茶匙提香點綴，嚴格控糖）。
     * 營養自然水到渠成：此類輕食熱量自然落在 150~220 kcal（Bebe），蛋白質約 12~15g，這就是最完美的輕食狀態！

3. 【正餐 / 排餐 / 拌飯 / 早午餐大盤 (Main Dish) 黃金直覺】：
   - 主肉品/海鮮扛起主要蛋白質：Bebe 抓 65~75g，Ariel 抓 75~85g，Jason 抓 130~160g。
   - 培根在有主肉品時定位為「風味提香配角」：Bebe 固定 1 條（約 15g，控鈉防腫），Ariel 1 條，Jason 2 條。
   - 蛋在有主肉品時固定 1 顆。
   - 盤邊生菜沙拉抓 50~70g（適量鋪盤清爽），瓜果配菜抓 30~50g。
   - 慢碳粗糧（地瓜/馬鈴薯/飯）：Bebe 精緻小食量抓 80~90g，Ariel 120~140g，Jason 160~200g。

4. 【主廚評語 (Chef Comment)】：
   - 以十一粒溫暖、懂生活、有品味的親切語氣，寫 2~3 句主廚評語，點出這道料理的口感層次、食材搭配亮點與清爽無負擔之處。

請輸出嚴格的合法 JSON（不要 markdown 標籤）：
{
  "chefComment": "十一粒主廚溫暖且懂生活的評語",
  "portions": {
    "bebe": [
      { "id": "食材id", "amount": 數值, "unit": "g或顆或條" }
    ]
  }
}`;

                apiKey = (apiKey || '').trim();

                // 🌟 Google 官方穩定主力端點相容矩陣 (優先調用穩定低延遲模型)
                const endpoints = [
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${encodeURIComponent(apiKey)}`,
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`,
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${encodeURIComponent(apiKey)}`,
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent?key=${encodeURIComponent(apiKey)}`
                ];
                
                let resultJson = null;
                let lastErrDetail = '';

                // 多端點輪詢嘗試
                for (let i = 0; i < endpoints.length; i++) {
                    const fetchUrl = endpoints[i];
                    const modelName = fetchUrl.split('/models/')[1]?.split(':')[0] || 'gemini';
                    try {
                        const resp = await fetch(fetchUrl, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'x-goog-api-key': apiKey
                            },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: prompt }] }],
                                generationConfig: { 
                                    responseMimeType: "application/json",
                                    temperature: 0.2
                                }
                            })
                        });

                        if (resp.ok) {
                            const resData = await resp.json();
                            const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (rawText) {
                                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                                if (jsonMatch) {
                                    resultJson = JSON.parse(jsonMatch[0]);
                                    break;
                                }
                            }
                        } else {
                            const errTxt = await resp.text();
                            if (resp.status === 429) {
                                lastErrDetail = `額度限制 (429)`;
                                break;
                            } else if (resp.status === 503) {
                                lastErrDetail = `伺服器短暫繁忙 (503)`;
                                await new Promise(r => setTimeout(r, 200));
                                continue;
                            } else {
                                lastErrDetail = `HTTP ${resp.status}`;
                                continue;
                            }
                        }
                    } catch (err) {
                        lastErrDetail = err.message || String(err);
                        continue;
                    }
                }

                if (resultJson && resultJson.portions) {
                    // 🌟 成功獲取 AI 精算數值！覆寫至各成員的右側實際主數值！
                    const totalSelectedCount = selectedMasterIngredients.value.length;
                    Object.keys(resultJson.portions).forEach(member => {
                        const aiItems = resultJson.portions[member];
                        if (Array.isArray(aiItems) && memberIngredients.value[member]) {
                            aiItems.forEach(aiItem => {
                                const target = memberIngredients.value[member].find(i => i.id === aiItem.id || getIngredientName(i.id) === aiItem.id);
                                if (target && typeof aiItem.amount === 'number') {
                                    let safeAmount = aiItem.amount;
                                    const targetIdLower = (target.id || '').toLowerCase();
                                    
                                    // 🛡️ 常理防呆夾持：
                                    if (targetIdLower.includes('cucumber') || targetIdLower.includes('瓜') || targetIdLower.includes('tomato') || targetIdLower.includes('茄')) {
                                        const maxLimit = totalSelectedCount > 1 ? (member === 'jason' ? 70 : 50) : (member === 'jason' ? 220 : 160);
                                        safeAmount = Math.min(safeAmount, maxLimit);
                                    } else if (targetIdLower.includes('salt') || targetIdLower.includes('鹽')) {
                                        safeAmount = Math.min(safeAmount, 1.0);
                                    }
                                    
                                    target.amount = safeAmount;
                                    if (aiItem.unit) target.unit = aiItem.unit;
                                }
                            });
                        }
                    });
                    resultJson.source = 'ai';
                    aiChefAdvice.value = resultJson;
                    showChefNote.value = true;
                } else {
                    // 🌟 本地智慧私廚立即無縫接管（生成懂生活、懂胃容量的溫暖評語與黃金份量）
                    activeMembers.value.forEach(m => autoBalanceMemberPortions(m));
                    const isYogurt = isLightMealOrYogurtBowl;
                    aiChefAdvice.value = {
                        source: 'local',
                        chefComment: isYogurt
                            ? `十一粒為您調配了這碗輕盈舒暢的黃金優格碗！滑順濃郁的希臘優格鋪底，綴上微融酸甜的冷凍莓果，再撒上一匙酥脆綜合燕麥。每一口都剛剛好，無負擔享受美好晨光～`
                            : `十一粒已為全家人精算好今日黃金備料配比！蛋白質與慢碳份量均衡、低鈉清爽，享受美味同時為身體注入滿滿活力。`,
                        portions: {}
                    };
                    showChefNote.value = true;
                }
            } catch (e) {
                console.error("AI Chef error:", e);
                activeMembers.value.forEach(m => autoBalanceMemberPortions(m));
                aiChefAdvice.value = {
                    source: 'local',
                    chefComment: "十一粒已為您調配好黃金備料比例，清爽無負擔！",
                    portions: {}
                };
                showChefNote.value = true;
            } finally {
                isAiChefLoading.value = false;
            }
        };

        const applyAiAdjustments = (member = 'bebe') => {
            if (!aiChefAdvice.value || !aiChefAdvice.value.adjustments) return;
            const list = memberIngredients.value[member] || [];
            aiChefAdvice.value.adjustments.forEach(adj => {
                const ing = list.find(i => getIngredientName(i.id) === adj.name || i.id === adj.name);
                if (ing && typeof adj.recommendedAmount === 'number') {
                    ing.amount = adj.recommendedAmount;
                }
            });
            aiChefAdvice.value = null;
        };

        const resetToGoldenDefaults = () => {
            if (!currentDish.value) return;
            onDishChange();
            isCalculated.value = false;
            aiChefAdvice.value = null;
            saveStateToStorage();
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
            if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        };

        const selectedIngredient = ref(null);
        let longPressTimer = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let isLongPressTriggered = false;
        let isPressing = false;

        const startIngredientPress = (id, event) => {
            console.log('[Calculator] startIngredientPress on:', id, event?.type);
            isLongPressTriggered = false;
            isPressing = true;
            if (event && event.touches && event.touches[0]) {
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
            } else if (event) {
                touchStartX = event.clientX || 0;
                touchStartY = event.clientY || 0;
            }
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (isPressing) {
                    isLongPressTriggered = true;
                    console.log('[Calculator] Long press fired (350ms)! Opening detail for:', id);
                    if (navigator.vibrate) navigator.vibrate(40);
                    openIngredientDetail(id);
                }
            }, 350);
        };

        const handleIngredientTouchMove = (event) => {
            if (!longPressTimer) return;
            if (event.touches && event.touches[0]) {
                const moveX = Math.abs(event.touches[0].clientX - touchStartX);
                const moveY = Math.abs(event.touches[0].clientY - touchStartY);
                if (moveX > 20 || moveY > 20) {
                    cancelIngredientPress();
                }
            }
        };

        const cancelIngredientPress = () => {
            isPressing = false;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        // 全域共用食材模組狀態
        const sharedIngredientModal = reactive({
            isOpen: false,
            mode: 'edit', // 'edit' | 'create'
            context: 'calculator', // 'calculator' | 'calculator_create'
            ingredient: null,
            initialName: ''
        });

        const openIngredientDetail = (id) => {
            console.log('[Calculator] openIngredientDetail for:', id);
            let ing = engine.getIngredientById(id);
            if (!ing) {
                // Fallback for orphan or removed ingredient IDs
                ing = {
                    id: id,
                    name: id === 'whey_protein' ? '乳清蛋白粉 (舊版標籤)' : id,
                    category: 'proteins',
                    per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 },
                    storageZones: ['pantry'],
                    preferredStores: ['全聯'],
                    isOrphan: true
                };
            }
            sharedIngredientModal.isOpen = true;
            sharedIngredientModal.mode = 'edit';
            sharedIngredientModal.context = 'calculator';
            sharedIngredientModal.ingredient = ing;
            sharedIngredientModal.initialName = '';
        };

        const openCreateIngredientFromDrawer = () => {
            sharedIngredientModal.isOpen = true;
            sharedIngredientModal.mode = 'create';
            sharedIngredientModal.context = 'calculator_create';
            sharedIngredientModal.ingredient = null;
            sharedIngredientModal.initialName = (searchQuery.value || '').trim();
        };

        const handleIngredientClick = (id) => {
            if (longPressTimer) clearTimeout(longPressTimer);
            if (!isLongPressTriggered) {
                toggleIngredient(id);
            }
            isLongPressTriggered = false;
            isPressing = false;
        };

        const handleDisabledClick = (id) => {
            if (longPressTimer) clearTimeout(longPressTimer);
            openIngredientDetail(id);
            isLongPressTriggered = false;
            isPressing = false;
        };

        const handleSharedModalSaved = async (savedIng, autoAddToDish) => {
            if (autoAddToDish) {
                await addExistingToDish(savedIng);
            } else {
                if (!engine.checkStock(savedIng.id)) {
                    selectedMasterIngredients.value = selectedMasterIngredients.value.filter(id => id !== savedIng.id);
                }
                dishUpdateTrigger.value++;
                if (isCalculated.value) {
                    calculate();
                }
            }
        };

        const handleSharedModalDeleted = async (ingId) => {
            await removeFromCurrentDish(ingId);
        };

        const removeFromCurrentDish = async (ingId) => {
            if (!currentDish.value) return;
            const dish = currentDish.value;
            ['recommendedProteins', 'recommendedVeggies', 'recommendedCarbs', 'recommendedSauces'].forEach(prop => {
                if (dish[prop]) {
                    dish[prop] = dish[prop].filter(id => id !== ingId);
                }
            });
            selectedMasterIngredients.value = selectedMasterIngredients.value.filter(id => id !== ingId);
            dishUpdateTrigger.value++;
            await engine.saveJson('dishes.json', engine.data.rawDishes || { dishes: engine.data.dishes });
            if (isCalculated.value) {
                calculate();
            }
        };

        return {
            engine,
            selectedDish,
            memberIngredients,
            diners,
            hideOutOfStock,
            isCalculated,
            isResultStale,
            groupedCategories,
            filteredMasterIngredients,
            showAddModal,
            searchQuery,
            drawerCategory,
            drawerTabs,
            openAddModal,
            closeAddModal,
            addExistingToDish,
            sharedIngredientModal,
            openCreateIngredientFromDrawer,
            handleSharedModalSaved,
            handleSharedModalDeleted,
            removeFromCurrentDish,
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
            createAndAddToDish,
            isAiChefLoading,
            aiChefAdvice,
            showChefNote,
            callAiChefAdvisor,
            applyAiAdjustments,
            showRecordSuccessModal,
            recordSuccessDishName,
            recordSuccessDate,
            goToTracker,
            showChefKeyInput,
            chefApiKeyInput,
            isChefKeyVisible,
            openChefKeyModal,
            saveChefKey
        };
    },
    template: `
        <div class="view-calculator">
            <!-- 01 DISH -->
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>01 DISH 選擇料理</span>
                <span style="font-size: 0.8rem; font-weight: 500; color: var(--color-primary); background: rgba(59, 130, 246, 0.12); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.25);">
                    {{ currentSlot ? currentSlot.name : '熱門' }}推薦
                </span>
            </div>
            <select v-model="selectedDish" @change="userHasManuallySelected = true; onDishChange();" class="select-box" style="margin-bottom: 24px;">
                <optgroup :label="(currentSlot ? currentSlot.name : '時段') + '推薦料理'">
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
                            <span>加食材</span>
                        </button>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div v-for="group in groupedCategories" :key="group.label" style="margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 8px;">{{ group.label }}</div>
                        <div class="capsule-group">
                            <template v-for="id in group.items" :key="id">
                                <!-- In Stock Capsule (Short Tap: Toggle Cooking / Long Press 450ms: 100g Nutrition Detail) -->
                                <div v-if="checkStock(id)"
                                     class="capsule in-stock"
                                     :class="{ 'selected': isIngredientSelected(id) }"
                                     style="cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
                                     @mousedown="startIngredientPress(id, $event)"
                                     @mouseup="cancelIngredientPress"
                                     @mouseleave="cancelIngredientPress"
                                     @touchstart="startIngredientPress(id, $event)"
                                     @touchmove="handleIngredientTouchMove($event)"
                                     @touchend="cancelIngredientPress"
                                     @touchcancel="cancelIngredientPress"
                                     @contextmenu.prevent
                                     @click="handleIngredientClick(id)">
                                    {{ getIngredientName(id) }}
                                </div>
                                <!-- Out of Stock Capsule (Short Tap/Long Press: Open 100g Nutrition Detail) -->
                                <div v-else
                                     class="capsule out-stock disabled"
                                     style="cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
                                     title="無庫存 (點擊或長按查看 100g 營養與採買)"
                                     @mousedown="startIngredientPress(id, $event)"
                                     @mouseup="cancelIngredientPress"
                                     @mouseleave="cancelIngredientPress"
                                     @touchstart="startIngredientPress(id, $event)"
                                     @touchmove="handleIngredientTouchMove($event)"
                                     @touchend="cancelIngredientPress"
                                     @touchcancel="cancelIngredientPress"
                                     @contextmenu.prevent
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
                            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
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

            <div v-if="selectedDish && isCalculated" style="position: relative;">
                <!-- 03 PORTIONS -->
                <div id="portions-section" class="section-title">03 PORTIONS 全家備料大白板</div>
                <div class="card" style="margin-bottom: 24px; background: #fffdf8; border: 1px solid var(--color-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 700; color: var(--color-text-main);">全家總備料 ({{ totalPortions }} 人份)</span>
                            <span v-if="isAiChefLoading" style="font-size: 0.74rem; color: #92400E; background: #FEF3C7; padding: 2px 9px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #FDE68A;">
                                <span class="apple-spinner"></span>
                                <span>AI 精算中...</span>
                            </span>
                            <span v-else-if="aiChefAdvice && aiChefAdvice.source === 'ai'" style="font-size: 0.72rem; color: #B45309; background: #FEF3C7; padding: 2px 8px; border-radius: 10px; font-weight: 700;">✨ AI 智能配比</span>
                            <span v-else-if="aiChefAdvice && aiChefAdvice.source === 'local'" style="font-size: 0.72rem; color: #4B5563; background: #F3F4F6; padding: 2px 8px; border-radius: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #E5E7EB;">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                <span>系統配比</span>
                            </span>
                        </div>
                        <!-- 📋 精簡正圓形複製食譜按鈕 -->
                        <button class="btn-icon" 
                                @click="copySOP" 
                                style="width: 32px; height: 32px; border-radius: 50%; background: #FAF8F5; border: 1px solid var(--color-border); color: #4B5563; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.04);" 
                                title="複製食譜">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
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
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="margin-bottom: 0; font-size: 1.1rem;">{{ engine.profiles[member].name }} 的專屬份量</h3>
                        
                        <!-- ✨ AI vs Local Status Indicator -->
                        <div>
                            <!-- Loading State (Minimalist Apple-style Single Ring Spinner) -->
                            <div v-if="isAiChefLoading" 
                                 style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700; color: #92400E; background: #FEF3C7; padding: 3px 10px; border-radius: 12px; border: 1px solid #FDE68A;">
                                <span class="apple-spinner"></span>
                                <span>AI 精算中...</span>
                            </div>
                            <!-- AI Success State -->
                            <button v-else-if="aiChefAdvice && aiChefAdvice.source === 'ai'" 
                                     @click="showChefNote = !showChefNote"
                                     style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 700; color: #B45309; background: #FEF3C7; padding: 3px 10px; border-radius: 12px; border: 1px solid #FDE68A; cursor: pointer; transition: all 0.2s ease;">
                                 <span>✨ AI 主廚已精算</span>
                                 <span style="font-size: 0.7rem;">{{ showChefNote ? '∧' : '∨' }}</span>
                             </button>
                             <!-- Local Fallback State -->
                             <button v-else-if="aiChefAdvice && aiChefAdvice.source === 'local'" 
                                     @click="showChefNote = !showChefNote"
                                     style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 600; color: #4B5563; background: #F3F4F6; padding: 3px 10px; border-radius: 12px; border: 1px solid #E5E7EB; cursor: pointer; transition: all 0.2s ease;">
                                 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                     <circle cx="12" cy="12" r="3"></circle>
                                     <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                 </svg>
                                 <span>系統預設</span>
                                 <span style="font-size: 0.7rem;">{{ showChefNote ? '∧' : '∨' }}</span>
                             </button>
                        </div>
                    </div>

                    <!-- Expandable Chef Note Box (Collapsible) -->
                    <div v-if="member === 'bebe' && showChefNote && aiChefAdvice && aiChefAdvice.chefComment" 
                         style="margin-bottom: 14px; background: #FFFDF8; border-left: 3px solid var(--color-primary); border-radius: 8px; padding: 10px 12px; font-size: 0.85rem; color: #4B5563; line-height: 1.6; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                        <div style="font-weight: 700; color: var(--color-primary); margin-bottom: 4px; font-size: 0.78rem;">
                            {{ aiChefAdvice.source === 'ai' ? '💬 十一粒主廚 AI 點評：' : '⚙️ 系統計算狀態：' }}
                        </div>
                        <div>{{ aiChefAdvice.chefComment }}</div>
                        <div v-if="aiChefAdvice.source === 'local'" style="margin-top: 10px;">
                            <button @click="showChefKeyInput = true" style="background: var(--color-primary, #FFCA60); color: #78350F; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; box-shadow: 0 2px 6px rgba(255, 202, 96, 0.3);">
                                🔑 點此更換 / 設定 Gemini API Key (AQ... 或 AIza...)
                            </button>
                        </div>
                    </div>
                    
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

                <!-- 🔄 形式 C：毛玻璃微遮罩 ＋ 原地一鍵重算 (Frosted Glass Stale Recalculate Overlay) -->
                <div v-if="isResultStale" 
                     @click="calculate"
                     style="position: absolute; top: 0; left: -6px; right: -6px; bottom: -6px; background: rgba(255, 255, 255, 0.45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); border-radius: var(--radius-lg, 16px); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 100px; z-index: 50; cursor: pointer; transition: all 0.3s ease;">
                    <button @click.stop="calculate" 
                            style="display: flex; align-items: center; gap: 8px; background: var(--color-primary, #F5A623); color: #FFFFFF; border: none; padding: 12px 24px; border-radius: 30px; font-weight: 700; font-size: 0.95rem; box-shadow: 0 6px 20px rgba(245, 166, 35, 0.45); cursor: pointer;">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                            <line x1="8" y1="6" x2="16" y2="6"></line>
                            <line x1="16" y1="14" x2="16" y2="18"></line>
                            <path d="M16 10h.01"></path>
                            <path d="M12 10h.01"></path>
                            <path d="M8 10h.01"></path>
                            <path d="M12 14h.01"></path>
                            <path d="M8 14h.01"></path>
                            <path d="M12 18h.01"></path>
                            <path d="M8 18h.01"></path>
                        </svg>
                        <span>食材已調整 · 點擊重新計算</span>
                    </button>
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
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
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
            </div>

            <!-- 📱 加食材抽屜 (82vh 固定高度 + 蝦皮式內嵌新增按鈕) -->
            <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
                <div class="drawer-content" style="height: 82vh; max-height: 85vh; display: flex; flex-direction: column; padding: 20px 20px 24px 20px;">
                    <!-- 第 1 排：極致純粹搜尋框 + ✕ 關閉按鈕 -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
                        <input type="text" 
                               v-model="searchQuery" 
                               placeholder="🔍 搜尋冰箱食材..." 
                               class="search-input"
                               style="flex: 1; padding: 10px 14px; border-radius: 12px; background: #FAF8F5; border: 1px solid var(--color-border); font-size: 0.9rem;">
                        <button class="btn-icon" @click="closeAddModal" style="border: none; font-size: 1.2rem; padding: 6px 10px; flex-shrink: 0; color: var(--color-text-muted);">✕</button>
                    </div>

                    <!-- 第 2 排：四大營養素分類標籤 (純淨分類) -->
                    <div style="display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px; align-items: center;">
                        <button v-for="tab in drawerTabs" 
                                :key="tab.id"
                                class="capsule"
                                :class="{ 'selected': drawerCategory === tab.id }"
                                style="padding: 6px 12px; font-size: 0.85rem; white-space: nowrap; cursor: pointer; flex-shrink: 0;"
                                @click="drawerCategory = tab.id">
                            {{ tab.label }}
                        </button>
                    </div>

                    <!-- 中間可滾動食材區 -->
                    <div style="flex: 1; overflow-y: auto; padding-right: 2px;">
                        <div class="capsule-group" style="gap: 8px;">
                            <div v-for="ing in filteredMasterIngredients" 
                                 :key="ing.id" 
                                 class="capsule"
                                 :class="checkStock(ing.id) ? 'in-stock' : 'out-stock'"
                                 style="cursor: pointer; font-size: 0.9rem; padding: 6px 12px; user-select: none; display: inline-flex; align-items: center; gap: 4px;"
                                 @click="addExistingToDish(ing)">
                                <span>{{ ing.name }}</span>
                                <span v-if="checkStock(ing.id)" style="font-size: 0.65rem; color: var(--color-primary); font-weight: 700; opacity: 0.85; margin-left: 2px;">＋</span>
                                <span v-else style="font-size: 0.7rem; color: var(--color-text-muted); margin-left: 2px;">🛒</span>
                            </div>

                            <!-- 搜尋不到時的智能提示卡片 (方案 A) -->
                            <div v-if="searchQuery && filteredMasterIngredients.length === 0" 
                                 @click="openCreateIngredientFromDrawer"
                                 style="padding: 20px 16px; border: 1.5px dashed var(--color-primary, #FFCA60); background: #FFFDF8; border-radius: 16px; text-align: center; color: #B45309; font-weight: 700; font-size: 0.92rem; width: 100%; cursor: pointer; box-shadow: 0 2px 8px rgba(255, 202, 96, 0.15); transition: all 0.2s ease;">
                                <div style="font-size: 1.3rem; margin-bottom: 6px;">➕</div>
                                <div>找不到【<strong style="color: var(--color-text-main);">{{ searchQuery }}</strong>】，點此建立並加入料理</div>
                            </div>
                            <div v-else-if="!searchQuery && filteredMasterIngredients.length === 0" style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 0.9rem; width: 100%;">
                                目前分類下無庫存食材，可切換分類或搜尋新增！
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 🔑 設定 Gemini API Key 彈窗 (支援明文切換與狀態核對) -->
            <div v-if="showChefKeyInput" class="modal-overlay" @click.self="showChefKeyInput = false">
                <div class="card" style="width: 90%; max-width: 420px; padding: 24px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); background: #FFF;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: 700; font-size: 1.1rem; color: var(--color-text-main);">
                            🔑 設定 Gemini API Key
                        </div>
                        <button class="btn-icon" @click="showChefKeyInput = false" style="border: none; font-size: 1.1rem;">✕</button>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 16px;">
                        請輸入 Google AI Studio 產生的 Gemini API Key（支援 <strong>AQ...</strong> 或 <strong>AIzaSy...</strong> 格式）：
                    </div>
                    
                    <div style="position: relative; margin-bottom: 8px;">
                        <input :type="isChefKeyVisible ? 'text' : 'password'" 
                               v-model="chefApiKeyInput" 
                               placeholder="貼上你的 Gemini API Key (AQ... 或 AIza...)" 
                               style="width: 100%; padding: 12px 42px 12px 12px; border: 1px solid var(--color-border); border-radius: 10px; font-size: 0.9rem; font-family: monospace; box-sizing: border-box; background: #FAF8F5;">
                        <button type="button" 
                                @click="isChefKeyVisible = !isChefKeyVisible" 
                                style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #6B7280; padding: 6px; display: flex; align-items: center;"
                                :title="isChefKeyVisible ? '隱藏金鑰' : '顯示完整金鑰'">
                            <span style="font-size: 1.1rem;">{{ isChefKeyVisible ? '🙈' : '👁️' }}</span>
                        </button>
                    </div>

                    <div style="font-size: 0.76rem; color: #6B7280; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                        <span>目前金鑰：{{ chefApiKeyInput ? chefApiKeyInput.slice(0, 8) + '...' + chefApiKeyInput.slice(-4) : '尚未輸入' }}</span>
                        <button v-if="chefApiKeyInput" @click="chefApiKeyInput = ''" style="background: none; border: none; color: #EF4444; cursor: pointer; font-size: 0.76rem; text-decoration: underline;">清空金鑰</button>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn-secondary" @click="showChefKeyInput = false" style="padding: 8px 16px; border-radius: 8px; border: 1px solid var(--color-border); background: #FFF; cursor: pointer;">取消</button>
                        <button class="btn-primary" @click="saveChefKey" style="padding: 8px 18px; border-radius: 8px; font-weight: 700; background: var(--color-primary); color: #FFF; border: none; cursor: pointer;">儲存並啟用 AI</button>
                    </div>
                </div>
            </div>

            <!-- 🎉 飲食紀錄成功彈窗 -->
            <div v-if="showRecordSuccessModal" class="modal-overlay" @click.self="showRecordSuccessModal = false">
                <div class="card" style="width: 88%; max-width: 360px; padding: 26px 20px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); background: #FFF; text-align: center;">
                    <div style="font-size: 2.6rem; margin-bottom: 8px; animation: bounce 0.6s ease;">🎉</div>
                    <div style="font-weight: 700; font-size: 1.2rem; color: var(--color-text-main); margin-bottom: 8px;">
                        飲食紀錄成功！
                    </div>
                    <div style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.6; margin-bottom: 22px;">
                        已成功為全家記錄<strong>【{{ recordSuccessDishName }}】</strong>至今日飲食追蹤庫存！
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn-primary" @click="goToTracker" style="width: 100%; padding: 13px; border-radius: 12px; font-weight: 700; background: var(--color-primary); color: #FFF; border: none; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);">
                            <span>📊 前往飲食追蹤查看</span>
                        </button>
                        <button class="btn-secondary" @click="showRecordSuccessModal = false" style="width: 100%; padding: 11px; border-radius: 12px; border: 1px solid var(--color-border); background: #FAF8F5; color: var(--color-text-main); font-size: 0.9rem; font-weight: 600; cursor: pointer;">
                            留在此頁繼續
                        </button>
                    </div>
                </div>
            </div>

            <!-- 📱 全域共用食材卡片 (Unified Modal) -->
            <ingredient-detail-modal 
                :is-open="sharedIngredientModal.isOpen"
                :mode="sharedIngredientModal.mode"
                :initial-ingredient="sharedIngredientModal.ingredient"
                :initial-name="sharedIngredientModal.initialName"
                :context="sharedIngredientModal.context"
                :engine="engine"
                @close="sharedIngredientModal.isOpen = false"
                @saved="handleSharedModalSaved"
                @deleted="handleSharedModalDeleted"
                @remove-from-dish="removeFromCurrentDish"
            />
        </div>
    `
};
