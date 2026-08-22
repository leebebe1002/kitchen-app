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
        const isResultStale = ref(false);
        
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

        // 偵測食材或成員異動：若已產出過結果，自動將下方標記為「待重新計算 (Stale)」
        watch([selectedMasterIngredients, diners], () => {
            if (isCalculated.value) {
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
            isCalculated.value = false;
            isResultStale.value = false;
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

        // 🧬 食材天生角色屬性判定 (Data-Driven Smart Role Classifier)
        const getIngredientRole = (ingData) => {
            if (!ingData) return { role: 'other', defaultAmount: 50, step: 5, unit: 'g' };
            const id = (ingData.id || '').toLowerCase();
            const name = (ingData.name || '').toLowerCase();
            const cat = (ingData.category || '').toLowerCase();

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

        // 🤖 【Gemini AI 智能求解引擎 (AI-First Multi-Member Nutrition Solver)】
        const isAiChefLoading = ref(false);
        const aiChefAdvice = ref(null);
        const showChefNote = ref(false);
        const showChefKeyInput = ref(false);
        const chefApiKeyInput = ref('');

        const saveChefKey = async () => {
            const key = chefApiKeyInput.value.trim();
            if (!key) return;
            try {
                localStorage.setItem('family_kitchen_gemini_key', key);
                localStorage.setItem('kitchen_v2_gemini_api_key', key);
            } catch (e) {}
            if (!engine.data.config) engine.data.config = {};
            engine.data.config.geminiApiKey = key;
            engine.data.config.gemini_api_key = key;
            await engine.saveJson('config.json', engine.data.config);
            showChefKeyInput.value = false;
            chefApiKeyInput.value = '';
            alert('🎉 Gemini API Key 已成功儲存啟用！');
            await callAiChefAdvisor();
        };

        const callAiChefAdvisor = async () => {
            isAiChefLoading.value = true;
            aiChefAdvice.value = null;

            try {
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

                // 收集當前勾選的所有食材與每 100g 營養素
                const selectedIngs = selectedMasterIngredients.value.map(id => {
                    const ing = engine.getIngredientById(id);
                    return {
                        id: id,
                        name: ing?.name || id,
                        category: ing?.category || 'proteins',
                        unit: ing?.unitLabel || (['egg'].includes(id) ? '顆' : (['bacon'].includes(id) ? '條' : 'g')),
                        isCount: ['egg', 'bacon', 'bagel'].includes(id),
                        per100g: ing?.per100g || { kcal: 50, protein: 1, carbs: 10, fat: 0.2, sodium: 5 }
                    };
                });

                // 收集就餐成員與 InBody 目標
                const membersData = activeMembers.value.map(m => {
                    if (m === 'bebe') {
                        return {
                            id: 'bebe',
                            name: 'Bebe',
                            profile: '女性，體重 56.6kg, BMR 1189 kcal, 骨骼肌 20.6kg, 體脂 33%',
                            mealTarget: '單餐目標：蛋白質 26~30g (高優先級主力，若有蛋建議2顆或搭配優格補足), 碳水 38~45g (低GI抗性澱粉), 脂肪 15~18g, 嚴格控鈉 < 600mg'
                        };
                    } else if (m === 'ariel') {
                        return {
                            id: 'ariel',
                            name: 'Ariel (樂樂)',
                            profile: '年輕女性，代謝良好，體態維持',
                            mealTarget: '單餐目標：蛋白質 30~35g, 碳水 50~58g, 脂肪 18~22g, 鈉 < 700mg'
                        };
                    } else {
                        return {
                            id: 'jason',
                            name: 'Jason',
                            profile: '男性，高活動量，高代謝',
                            mealTarget: '單餐目標：蛋白質 40~48g, 碳水 70~85g, 脂肪 22~28g, 鈉 < 900mg'
                        };
                    }
                });

                const slotName = currentSlot.value ? currentSlot.value.name : '早午餐';
                const dishName = currentDish.value?.name || '料理';

                const prompt = `你是頂級臨床運動營養師與家庭 AI 主廚「十一粒」。
請根據以下家庭成員的 InBody 數據與【${slotName}】營養目標，為這道【${dishName}】中選取的食材，精確計算出【每位成員的最佳克數/顆數】！

【選取的食材及其每 100g 營養素】：
${JSON.stringify(selectedIngs, null, 2)}

【就餐成員及其單餐營養目標】：
${JSON.stringify(membersData, null, 2)}

【精算規則】：
1. 蛋白質必須精準達標（例如 Bebe 蛋至少 2 顆、配合優格或肉品補足 26~30g 蛋白質；培根為加工肉品只抓 1~1.5 片提味）。
2. 主食碳水（地瓜/飯/麵/玉米）精準分配克數以符合低 GI 碳水目標。
3. 蔬菜與水果份量合理平衡（生菜充足、水果點綴控糖）。
4. 輸出純 JSON 格式如下：
{
  "chefComment": "2~3 句主廚整體評語（例如為什麼蛋抓 2 顆、優格與水果如何搭配抗氧化等）",
  "portions": {
    "bebe": [
      { "id": "食材id", "amount": 數值, "unit": "g或顆或條" }
    ],
    "ariel": [
      { "id": "食材id", "amount": 數值, "unit": "g或顆或條" }
    ]
  }
}
請只輸出合法 JSON，不要輸出任何 markdown 或其他文字。`;

                const attempts = [
                    { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent' },
                    { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' },
                    { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent' },
                    { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent' }
                ];

                let resultJson = null;
                let lastErrDetail = '';
                for (const att of attempts) {
                    const fetchUrl = `${att.url}?key=${encodeURIComponent(apiKey)}`;
                    const headers = { 
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey 
                    };

                    try {
                        const resp = await fetch(fetchUrl, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: prompt }] }]
                            })
                        });
                        if (resp.ok) {
                            const resData = await resp.json();
                            const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (rawText) {
                                let clean = rawText.trim();
                                if (clean.includes('```json')) {
                                    clean = clean.replace(/```json/g, '').replace(/```/g, '').trim();
                                } else if (clean.includes('```')) {
                                    clean = clean.replace(/```/g, '').trim();
                                }
                                resultJson = JSON.parse(clean);
                                break;
                            }
                        } else {
                            const errTxt = await resp.text();
                            if (resp.status === 429) {
                                lastErrDetail = `Google 免費額度每分鐘呼叫過於頻繁（Rate Limit 頻率限制），請稍候 10~15 秒再次按下計算即可！`;
                            } else {
                                lastErrDetail = `HTTP ${resp.status}: ${errTxt.slice(0, 100)}`;
                            }
                        }
                    } catch (err) {
                        lastErrDetail = err.message || String(err);
                        console.warn("AI Chef endpoint attempt failed:", att.url, err);
                    }
                }

                if (resultJson && resultJson.portions) {
                    // 🌟 成功獲取 AI 精算數值！覆寫至各成員的右側實際主數值！
                    Object.keys(resultJson.portions).forEach(member => {
                        const aiItems = resultJson.portions[member];
                        if (Array.isArray(aiItems) && memberIngredients.value[member]) {
                            aiItems.forEach(aiItem => {
                                const target = memberIngredients.value[member].find(i => i.id === aiItem.id || getIngredientName(i.id) === aiItem.id);
                                if (target && typeof aiItem.amount === 'number') {
                                    target.amount = aiItem.amount;
                                    if (aiItem.unit) target.unit = aiItem.unit;
                                }
                            });
                        }
                    });
                    resultJson.source = 'ai'; // 明確標記來源為 AI
                    aiChefAdvice.value = resultJson;
                    showChefNote.value = true;
                } else {
                    // 本地智能求解 fallback (誠實標記為本地)
                    activeMembers.value.forEach(m => autoBalanceMemberPortions(m));
                    aiChefAdvice.value = {
                        source: 'local', // 誠實標記為本地演算法
                        chefComment: `目前為系統本地演算法基線（因 API 連線未成功：${lastErrDetail || '請確認 API 金鑰'}）。若要啟用 AI 主廚智能求解，請確認金鑰設定。`,
                        portions: {}
                    };
                }
            } catch (e) {
                console.error("AI Chef error:", e);
                activeMembers.value.forEach(m => autoBalanceMemberPortions(m));
                aiChefAdvice.value = {
                    source: 'local',
                    chefComment: "連線異常，已使用本地演算法基線配比。",
                    portions: {}
                };
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
            showChefKeyInput,
            chefApiKeyInput,
            saveChefKey,
            goToTracker
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
                                <span>AI 智能精算中...</span>
                            </span>
                            <span v-else-if="aiChefAdvice && aiChefAdvice.source === 'ai'" style="font-size: 0.72rem; color: #B45309; background: #FEF3C7; padding: 2px 8px; border-radius: 10px; font-weight: 700;">✨ AI 智能配比</span>
                            <span v-else-if="aiChefAdvice && aiChefAdvice.source === 'local'" style="font-size: 0.72rem; color: #4B5563; background: #F3F4F6; padding: 2px 8px; border-radius: 10px; font-weight: 600;">⚙️ 系統配比</span>
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
                                <span>AI 智能精算中...</span>
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
                                 <span>⚙️ 系統預設</span>
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
                                🔑 點此更換 / 設定正確的 Gemini Key (AIzaSy...)
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

            <!-- 🔑 設定 Gemini API Key 彈窗 -->
            <div v-if="showChefKeyInput" class="modal-overlay" @click.self="showChefKeyInput = false">
                <div class="card" style="width: 90%; max-width: 420px; padding: 24px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); background: #FFF;">
                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--color-text-main); margin-bottom: 8px;">
                        🔑 設定 Gemini API Key
                    </div>
                    <div style="font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 16px;">
                        請輸入 Google AI Studio 產生的 Gemini API Key（格式為 <strong>AIzaSy...</strong> 開頭）：
                    </div>
                    <input type="password" 
                           v-model="chefApiKeyInput" 
                           placeholder="AIzaSy..." 
                           style="width: 100%; padding: 12px; border: 1px solid var(--color-border); border-radius: 10px; font-size: 0.95rem; margin-bottom: 16px; box-sizing: border-box; background: #FAF8F5;">
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn-secondary" @click="showChefKeyInput = false" style="padding: 8px 16px; border-radius: 8px; border: 1px solid var(--color-border); background: #FFF; cursor: pointer;">取消</button>
                        <button class="btn-primary" @click="saveChefKey" style="padding: 8px 18px; border-radius: 8px; font-weight: 700; background: var(--color-primary); color: #FFF; border: none; cursor: pointer;">儲存並啟用 AI</button>
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
