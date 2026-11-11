import { buildMealContext, validateMealLimits } from '../services/DynamicPortions.js?v=20261109_FK21_ESTIMATE_FALLBACK_V1';
import { planCulinaryMeal } from '../services/CulinaryPortionCoordinator.js?v=20261111_FK21_PARTIAL_V1';
import { planLocalPortions } from '../services/LocalPortionPlanner.js?v=20261111_FK21_SALT_DEFAULT_V1';
const { ref, reactive, computed, watch, onMounted, onUnmounted } = Vue;
import { logChefTiming, CHEF_TOTAL_MS } from '../services/ChefAdvisor.js?v=20261109_FK21_THREE_FOODS_V2';
import WeightBasisBadge, { getWeightBasis, weightBasisText } from '../components/WeightBasisBadge.js?v=20261028_WEIGHT_BASIS_V2';
import IngredientDetailModal from '../components/IngredientDetailModal.js?v=20261110_FK21_SOURCE_STATUS_V1';

export default {
    components: {
        IngredientDetailModal,
        WeightBasisBadge
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
        const calculationNotice = ref('');
        
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
        let activeChefRequest = null;
        const aiChefAdvice = ref(null);
        const showChefNote = ref(false);
        const showChefKeyInput = ref(false);
        const chefApiKeyInput = ref('');
        const isChefKeyVisible = ref(true);

        // 🔒 FK-009: 每位成員的「記住這組份量」按鈕三態 (per-member)
        const portionMemoryButtonState = ref({ bebe: 'unsaved', ariel: 'unsaved', jason: 'unsaved' });

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

        // ----------------------------------------------------
        // FK-002 成員個別份量模式與長按展開狀態
        // ----------------------------------------------------
        const getTodayStr = () => {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        watch(() => engine.personalScope, () => {
            aiChefAdvice.value = null;
            isCalculated.value = false;
        });
        const useHistoricalPortions = member => {
            cancelChefRequest();
            if (!applyPortionMemory(member)) {
                const old = currentDish.value?.memberPortions?.[member];
                if (old) memberIngredients.value[member] = JSON.parse(JSON.stringify(old));
            }
            refreshAllPortionStates();
        };
        const hasHistoricalPortions = member => !!findPortionEntry(member, selectedMasterIngredients.value)
            || !!currentDish.value?.memberPortions?.[member]?.length;

        // 🌟 成員個別配比模式：'standard' (標準份量) vs 'remaining' (吃剩餘額度)
        const memberPortionModes = ref({
            bebe: 'standard',
            ariel: 'standard',
            jason: 'standard'
        });
        const getMealContext = member => buildMealContext(engine, member, getTodayStr(),
            memberPortionModes.value[member], currentSlot.value?.id);

        // 手動選擇優先於自動預判：標記該成員是否已被使用者手動變更過
        const manualOverrides = ref({
            bebe: false,
            ariel: false,
            jason: false
        });

        // 目前展開模式選項的成員（一次只允許一位成員展開，null 為全數收合）
        const expandedMember = ref(null);

        // 初次使用淡提示（長按可調整份量模式）
        const showPortionHint = ref(localStorage.getItem('fk_seen_portion_hint') !== 'true');

        const dismissPortionHint = () => {
            showPortionHint.value = false;
            try {
                localStorage.setItem('fk_seen_portion_hint', 'true');
            } catch (e) {}
        };

        // 自動預判規則：
        // - 早餐：標準
        // - 午餐：標準（即使有前餐紀錄仍為標準）
        // - 晚餐：若該成員今日已有前餐紀錄則剩餘，無紀錄則標準
        // 手動選擇優先於自動預判
        const predictPortionMode = (member, slotId = currentSlot.value?.id) => {
            if (slotId === 'breakfast' || slotId === 'lunch') {
                return 'standard';
            }
            if (slotId === 'dinner') {
                const todayStr = getTodayStr();
                const memberLog = engine.getDailyLog(todayStr, member);
                const hasMealsToday = memberLog && Array.isArray(memberLog.meals) && memberLog.meals.length > 0;
                return hasMealsToday ? 'remaining' : 'standard';
            }
            return 'standard';
        };

        const applyPortionModePredictions = () => {
            ['bebe', 'ariel', 'jason'].forEach(m => {
                if (!manualOverrides.value[m]) {
                    memberPortionModes.value[m] = predictPortionMode(m);
                }
            });
        };

        // 就餐成員切換（未選＝加入、已選＝取消）
        const toggleDiner = (member) => {
            if (!diners.value[member]) {
                diners.value[member] = true;
                // 若該成員尚未手動覆寫過，加入時套用自動預判
                if (!manualOverrides.value[member]) {
                    memberPortionModes.value[member] = predictPortionMode(member);
                }
            } else {
                diners.value[member] = false;
                if (expandedMember.value === member) {
                    expandedMember.value = null;
                }
            }
        };

        // 選擇成員份量模式（收合選項並更新文字狀態註記）
        const selectMemberPortionMode = (member, mode) => {
            memberPortionModes.value[member] = mode;
            manualOverrides.value[member] = true; // 標記為手動選擇，優先於自動預判
            expandedMember.value = null; // 收合展開翼
            dismissPortionHint();
        };

        // 🛡️ 長按手勢與防誤觸點擊邏輯 (Pointer Events + 位移門檻 + 抑制旗標)
        let memberLongPressTimer = null;
        let isMemberLongPressTriggered = false;
        let memberPointerStartX = 0;
        let memberPointerStartY = 0;
        const MEMBER_LONG_PRESS_DURATION = 450;
        const MEMBER_MOVE_THRESHOLD = 8;

        const onMemberPointerDown = (member, e) => {
            // 只有已選取成員才能長按調整模式
            if (!diners.value[member]) {
                isMemberLongPressTriggered = false;
                return;
            }

            isMemberLongPressTriggered = false;
            memberPointerStartX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            memberPointerStartY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);

            if (memberLongPressTimer) clearTimeout(memberLongPressTimer);
            memberLongPressTimer = setTimeout(() => {
                isMemberLongPressTriggered = true;
                expandedMember.value = member;
                try {
                    if (navigator && navigator.vibrate) {
                        navigator.vibrate(40);
                    }
                } catch (_) {}
            }, MEMBER_LONG_PRESS_DURATION);
        };

        const onMemberPointerMove = (member, e) => {
            if (!memberLongPressTimer) return;
            const currentX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            const currentY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
            const dist = Math.hypot(currentX - memberPointerStartX, currentY - memberPointerStartY);
            if (dist > MEMBER_MOVE_THRESHOLD) {
                clearTimeout(memberLongPressTimer);
                memberLongPressTimer = null;
            }
        };

        const onMemberPointerUp = (member, e) => {
            if (memberLongPressTimer) {
                clearTimeout(memberLongPressTimer);
                memberLongPressTimer = null;
            }
        };

        const onMemberPointerCancel = (member, e) => {
            if (memberLongPressTimer) {
                clearTimeout(memberLongPressTimer);
                memberLongPressTimer = null;
            }
        };

        const onMemberClick = (member) => {
            // 若剛剛觸發過長按，阻斷合成點擊，不執行選取/取消切換
            if (isMemberLongPressTriggered) {
                isMemberLongPressTriggered = false;
                return;
            }
            // 若該成員目前處於展開狀態，點擊膠囊本體則收合展開選項
            if (expandedMember.value === member) {
                expandedMember.value = null;
                return;
            }
            // 若其他成員處於展開狀態，先收合它
            if (expandedMember.value !== null) {
                expandedMember.value = null;
            }
            // 短按：未選＝加入、已選＝取消
            toggleDiner(member);
        };

        // 點擊膠囊外部時自動收合展開選項
        const handleGlobalClick = (e) => {
            if (expandedMember.value && !e.target.closest('.member-capsule-wrapper')) {
                expandedMember.value = null;
            }
        };

        let isSwitchingDish = false;

        // 偵測食材、成員或個別份量模式異動：只有在真正初始化完成後的使用者手動異動，才標記為「待重新計算 (Stale)」
        watch([selectedMasterIngredients, diners, memberPortionModes], () => {
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
            // Keep the FK14 canonical identity untouched in Supabase. Reveal
            // the authorized 97g non-fried spec only when evidence is attached.
            if (id === 'shin_ramen' && ing?.nutritionEvidence?.specification)
                return '非油炸辛拉麵（97g）';
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

                // Recipe quantities are shared ratios; old personal seeds remain available only on explicit request.
                ['bebe', 'ariel', 'jason'].forEach(member => {
                    memberIngredients.value[member] = initialMaster.map(id => {
                        const ing = engine.getIngredientById(id);
                        const recipe = dish.defaultIngredients?.find(i => i.id === id);
                        return { id, amount: recipe?.amount ?? (getWeightBasis(ing) === 'count' ? 1 : 0),
                            unit: recipe?.unit || ing?.unitLabel || 'g' };
                    });
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
        const storageKey = () => 'family_kitchen_calc_session_state:' + (engine.personalScope || 'signed-out');
        let isRestoringState = false;

        const saveStateToStorage = () => {
            if (isRestoringState) return;
            try {
                const state = {
                    scopeId: engine.personalScope,
                    selectedDish: selectedDish.value,
                    userHasManuallySelected: userHasManuallySelected.value,
                    diners: diners.value,
                    memberPortionModes: memberPortionModes.value,
                    manualOverrides: manualOverrides.value,
                    selectedMasterIngredients: selectedMasterIngredients.value,
                    memberIngredients: memberIngredients.value,
                    isCalculated: isCalculated.value,
                    isResultStale: isResultStale.value,
                    aiChefAdvice: aiChefAdvice.value,
                    showChefNote: showChefNote.value,
                    timestamp: Date.now()
                };
                sessionStorage.setItem(storageKey(), JSON.stringify(state));
            } catch (e) {}
        };

        const restoreStateFromStorage = () => {
            try {
                const raw = sessionStorage.getItem(storageKey());
                if (!raw) return false;
                const state = JSON.parse(raw);
                if (!state || !state.selectedDish || state.scopeId !== engine.personalScope) return false;

                isRestoringState = true;
                selectedDish.value = state.selectedDish;
                userHasManuallySelected.value = !!state.userHasManuallySelected;
                if (state.diners && typeof state.diners === 'object') {
                    diners.value = state.diners;
                }
                if (state.memberPortionModes && typeof state.memberPortionModes === 'object') {
                    memberPortionModes.value = { ...memberPortionModes.value, ...state.memberPortionModes };
                }
                if (state.manualOverrides && typeof state.manualOverrides === 'object') {
                    manualOverrides.value = { ...manualOverrides.value, ...state.manualOverrides };
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
        watch([selectedMasterIngredients, memberIngredients, diners, memberPortionModes, manualOverrides, isCalculated, isResultStale, aiChefAdvice, showChefNote], () => {
            saveStateToStorage();
        }, { deep: true });

        // 🔒 FK-009: 食材或份量異動時即時更新三態按鈕狀態
        watch([memberIngredients, selectedMasterIngredients, isCalculated], () => {
            if (isCalculated.value) refreshAllPortionStates();
        }, { deep: true });

        // 監聽料理清單與初始化
        let hasInitialized = false;

        const initCalculatorState = () => {
            if (hasInitialized) return;
            if (dishesList.value && dishesList.value.length > 0) {
                const restored = restoreStateFromStorage();
                if (!restored) {
                    applyPortionModePredictions();
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

        watch(currentSlot, () => {
            applyPortionModePredictions();
        });

        onMounted(() => {
            initCalculatorState();
            window.addEventListener('pointerdown', handleGlobalClick);
        });

        onUnmounted(() => {
            cancelChefRequest();
            window.removeEventListener('pointerdown', handleGlobalClick);
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
            item = dish.defaultIngredients?.find(i => i.id === ingId);
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
                        const totalKey = `${ingId}:${item.unit}`;
                        if (!totals[totalKey]) {
                            totals[totalKey] = {
                                id: ingId,
                                name: getIngredientName(ingId),
                                amount: 0,
                                unit: item.unit,
                                breakdown: []
                            };
                        }
                        const total = totals[totalKey];
                        total.amount += Number(item.amount);
                        if (Number(item.amount) > 0) {
                            total.breakdown.push({
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

        function autoBalanceMemberPortions(member) {
            if (!memberIngredients.value[member]) memberIngredients.value[member] = [];
            const list = memberIngredients.value[member];
            selectedMasterIngredients.value.filter(checkStock).forEach(id => {
                if (list.some(item => item.id === id)) return;
                const ing = engine.getIngredientById(id);
                const recipe = currentDish.value?.defaultIngredients?.find(i => i.id === id);
                list.push({ id, amount: recipe?.amount ?? (getWeightBasis(ing) === 'count' ? 1 : 0),
                    unit: recipe?.unit || ing?.unitLabel || 'g' });
            });
        }

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
                            const defaultAmount = getWeightBasis(ingData) === 'count' ? 1 : 0;
                            list.push({
                                id,
                                amount: defaultAmount,
                                unit: ingData.unitLabel || 'g'
                            });
                        }
                    }
                });
            }
        };

        // 🔢 統一按鈕加 1、減 1，最小為 0
        const adjustMemberAmount = (member, ing, delta) => {
            const current = Number(ing.amount) || 0;
            const newAmount = Math.max(0, current + (delta > 0 ? 1 : -1));
            ing.amount = Math.round(newAmount * 10) / 10;
        };

        // 🔢 中間數字直接修改時的失焦防呆與格式化校驗
        const onAmountBlur = (ing) => {
            if (ing.amount === '' || isNaN(ing.amount) || ing.amount < 0) {
                ing.amount = 0;
            } else {
                ing.amount = Math.round(Number(ing.amount) * 10) / 10;
            }
        };

        // ==========================================
        // 🔒 FK-009: Portion Memory（記住這組份量）
        // ==========================================
        const FK009_KEY = 'kitchen_v2_portion_memory';

        const readPortionStore = () => {
            try {
                const raw = localStorage.getItem(FK009_KEY);
                const store = raw ? JSON.parse(raw) : { version: 1, sets: [] };
                if (!Array.isArray(store.sets)) store.sets = [];
                return store;
            } catch (e) {
                return { version: 1, sets: [] };
            }
        };

        const writePortionStore = (store) => {
            try { localStorage.setItem(FK009_KEY, JSON.stringify(store)); } catch (e) {}
        };

        // 食材 ID 集合排序後 join — 完全匹配識別鍵
        const buildIngSetKey = (ingredientIds) =>
            [...ingredientIds].filter(id => checkStock(id)).sort().join('|');

        const findPortionEntry = (member, ingredientIds) => {
            const key = buildIngSetKey(ingredientIds);
            if (!key) return null;
            return readPortionStore().sets.find(
                s => s.member === member && s.ingredientSetKey === key
            ) || null;
        };

        // 將記憶份量套用至 memberIngredients（最高優先覆寫），回傳是否有套用
        const applyPortionMemory = (member) => {
            const entry = findPortionEntry(member, selectedMasterIngredients.value);
            if (!entry) return false;
            const list = memberIngredients.value[member] || [];
            entry.portions.forEach(saved => {
                const target = list.find(i => i.id === saved.id);
                if (target) {
                    target.amount = saved.amount;
                    target.unit = saved.unit;
                }
            });
            return true;
        };

        // 比較目前份量與記憶是否完全一致
        const portionsMatchEntry = (member, entry) => {
            if (!entry) return false;
            const activeList = getMemberActiveIngredients(member);
            if (activeList.length !== entry.portions.length) return false;
            return entry.portions.every(saved => {
                const cur = activeList.find(c => c.id === saved.id);
                return cur &&
                    Math.round(Number(cur.amount) * 10) === Math.round(Number(saved.amount) * 10) &&
                    cur.unit === saved.unit;
            });
        };

        // 重新計算某位成員的按鈕狀態
        const refreshPortionState = (member) => {
            const entry = findPortionEntry(member, selectedMasterIngredients.value);
            if (!entry) {
                portionMemoryButtonState.value[member] = 'unsaved';
            } else if (portionsMatchEntry(member, entry)) {
                portionMemoryButtonState.value[member] = 'saved';
            } else {
                portionMemoryButtonState.value[member] = 'modified';
            }
        };

        const refreshAllPortionStates = () => {
            ['bebe', 'ariel', 'jason'].forEach(m => refreshPortionState(m));
        };

        // 儲存目前份量至 localStorage
        const savePortionMemory = (member) => {
            cancelChefRequest();
            const activeList = getMemberActiveIngredients(member);
            if (activeList.length === 0) return;
            const key = buildIngSetKey(selectedMasterIngredients.value);
            if (!key) return;
            const store = readPortionStore();
            const idx = store.sets.findIndex(s => s.member === member && s.ingredientSetKey === key);
            const entry = {
                id: idx >= 0 ? store.sets[idx].id : ('pm_' + Date.now()),
                member,
                ingredientSetKey: key,
                portions: activeList.map(i => ({ id: i.id, amount: i.amount, unit: i.unit })),
                savedAt: new Date().toISOString(),
                dishContext: null
            };
            if (idx >= 0) { store.sets[idx] = entry; } else { store.sets.push(entry); }
            writePortionStore(store);
            portionMemoryButtonState.value[member] = 'saved';
        };

        // 取消記住：刪除該 member + ingredientSetKey 的記憶
        const deletePortionMemory = (member) => {
            cancelChefRequest();
            const key = buildIngSetKey(selectedMasterIngredients.value);
            if (!key) return;
            const store = readPortionStore();
            store.sets = store.sets.filter(
                s => !(s.member === member && s.ingredientSetKey === key)
            );
            writePortionStore(store);
            portionMemoryButtonState.value[member] = 'unsaved';
        };

        // 剩餘額度超額提示（只在 remaining 模式 + saved 狀態 + 超額時顯示）
        const getPortionMemoryWarning = (member) => {
            if (memberPortionModes.value[member] !== 'remaining') return null;
            if (portionMemoryButtonState.value[member] !== 'saved') return null;
            const todayStr = getTodayStr();
            const profile = engine.profiles[member];
            const log = engine.getDailyLog(todayStr, member);
            const consumed = Math.round(log?.totals?.kcal || 0);
            const remaining = Math.max(0, (profile?.targetKcal ?? engine.profiles.bebe.targetKcal) - consumed);
            const current = Math.round(getMemberNutrition(member).kcal || 0);
            if (current <= remaining) return null;
            return { currentKcal: current, remainingKcal: remaining };
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

            const defaultUnit = ing.unitLabel || (ing.isCount ? '顆' : 'g');
            const isCount = getWeightBasis(ing, defaultUnit) === 'count';
            const safeAmount = isCount ? 1 : 0;

            // 1. 寫入料理的 defaultIngredients (預設打勾食材名單)
            if (!dish.defaultIngredients) dish.defaultIngredients = [];
            if (!dish.defaultIngredients.some(i => i.id === ing.id)) {
                dish.defaultIngredients.push({
                    id: ing.id,
                    amount: safeAmount,
                    unit: defaultUnit
                });
            }

            // 3. 立即在當前 02 區塊打勾選取
            if (!selectedMasterIngredients.value.includes(ing.id)) {
                selectedMasterIngredients.value.push(ing.id);
            }
            
            // 4. 即時更新當前成員視圖中的食材清單
            ['bebe', 'ariel', 'jason'].forEach(m => {
                if (!memberIngredients.value[m]) memberIngredients.value[m] = [];
                const list = memberIngredients.value[m];
                if (!list.some(i => i.id === ing.id)) {
                    const memberAmount = safeAmount;
                    list.push({
                        id: ing.id,
                        amount: memberAmount,
                        unit: defaultUnit
                    });
                }
            });

            dishUpdateTrigger.value++;

            // 5. 永久存檔至 dishes.json 與 localStorage
            await engine.saveJson('dishes.json', engine.data.rawDishes || { dishes: engine.data.dishes });
            
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

        // A selected 0 g ingredient still needs a verified nutrition basis before
        // FK can label the whole meal as calculated.
        const needsNutritionReview = item => {
            const amount = Number(item.amount);
            return engine.getNutritionIssues([{
                ...item, amount: Number.isFinite(amount) ? Math.max(1, amount) : 1
            }]).length > 0;
        };
        const getSelectedNutritionIssues = member => getMemberActiveIngredients(member)
            .filter(needsNutritionReview);
        const recordPendingItems = computed(() => [...new Map(
            activeMembers.value.flatMap(member => getSelectedNutritionIssues(member))
                .map(item => [item.id, { id: item.id, name: getIngredientName(item.id) }])
        ).values()]);

        const getMemberNutrition = (member) => {
            return engine.calculateNutritionForMember(getMemberActiveIngredients(member), member);
        };

        const getMemberStatus = (member) => {
            return engine.getMemberStatusColor(member, getMemberNutrition(member));
        };

        const revealPortions = () => {
            // Vue needs one render tick to mount the result after isCalculated becomes true.
            // Without scrolling, the result appears below the current iPhone viewport and
            // the calculation button seems unresponsive.
            Vue.nextTick(() => {
                document.getElementById?.('portions-section')?.scrollIntoView?.({
                    behavior: 'smooth', block: 'start'
                });
            });
        };

        const calculate = async () => {
            if (isAiChefLoading.value) return;
            if (activeMembers.value.length === 0) {
                calculationNotice.value = '請先選擇用餐成員。';
                return;
            }
            if (!selectedMasterIngredients.value.some(id => checkStock(id))) {
                calculationNotice.value = '請先勾選有庫存的食材，再按計算。';
                return;
            }
            calculationNotice.value = '';
            const started = performance.now();
            activeMembers.value.forEach(m => {
                autoBalanceMemberPortions(m);

            });
            refreshAllPortionStates();
            isResultStale.value = false;
            isCalculated.value = true;
            revealPortions();
            logChefTiming({ phase: 'local', durationMs: Math.round(performance.now() - started) });
            // Preserve unknown nutrition as unknown: even a currently zero-quantity
            // selected ingredient must be checked before recommending its portion.
            const pending = new Map();
            for (const member of activeMembers.value) {
                for (const item of getMemberActiveIngredients(member)) {
                    const amount = Number(item.amount);
                    const check = { ...item, amount: Number.isFinite(amount) ? Math.max(1, amount) : 1 };
                    const issues = engine.getNutritionIssues([check]);
                    if (issues.length && !pending.has(item.id)) {
                        pending.set(item.id, { id: item.id, name: getIngredientName(item.id), reason: issues.join('；') });
                    }
                }
            }
            if (pending.size) {
                // Fail closed for the WHOLE meal, but estimate the verified subset
                // so valid foods do not misleadingly appear to have missing data.
                // Unknown foods are NOT sent to Gemini, not counted as zero, and
                // their existing/manual amounts are never overwritten.
                const known = Object.fromEntries(activeMembers.value.map(member => [
                    member, getMemberActiveIngredients(member)
                        .filter(item => !pending.has(item.id)).map(item => ({ ...item }))
                ]));
                let partial = null;
                let estimateReason = '';
                if (activeMembers.value.every(member => known[member].length)) {
                    try {
                        const contexts = activeMembers.value.map(member => getMealContext(member));
                        partial = planLocalPortions(engine, known, contexts);
                        if (!partial) estimateReason = '當餐營養額度不足，無法為其餘食材安全估算份量。';
                    } catch (error) {
                        estimateReason = '個人目標或當日紀錄無法建立份量額度，請核對設定。';
                    }
                } else {
                    estimateReason = '目前沒有可單獨計算的已確認食材。';
                }
                aiChefAdvice.value = null; // Do not invalidate our own reactive edits.
                if (partial) applyPortionValues(partial.portions);
                aiChefAdvice.value = {
                    source: partial ? 'partial' : 'blocked',
                    portions: partial?.portions || {},
                    nutritionIssues: [...pending.values()],
                    chefComment: partial
                        ? `已為有可靠營養資料的食材估算份量；另有 ${pending.size} 項需核對，原始／手動份量保留。這是部分備料參考，不是整餐營養精算或 AI 料理審查；未知食材未計入額度，請勿把本結果當成完整飲食建議。`
                        : `有 ${pending.size} 項食材待核對；${estimateReason} 已保留原始／手動份量，整餐尚未完成計算。`
                };
                showChefNote.value = true;
                return;
            }
            try {
                activeMembers.value.forEach(member => getMealContext(member));
            } catch (error) {
                aiChefAdvice.value = { source: 'local', portions: {}, chefComment: error.message + ' 目前顯示配方／手動份量，尚未產生動態建議。' };
                showChefNote.value = true;
                return;
            }
            if (getMemberActiveIngredients(activeMembers.value[0]).length) await callAiChefAdvisor(started);
        };

        const cancelChefRequest = () => {
            if (!activeChefRequest) {
                if (['ai', 'estimate', 'partial'].includes(aiChefAdvice.value?.source)) {
                    aiChefAdvice.value = {source:'local',portions:{},chefComment:'資料或份量已調整，請重新計算以取得新的 AI 建議；手動份量仍保留。'};
                    showChefNote.value = true;
                }
                return;
            }
            activeChefRequest.controller.abort();
            activeChefRequest = null;
            isAiChefLoading.value = false;
            aiChefAdvice.value = { source: 'local', portions: {},
                chefComment: '已保留目前份量；操作有變更，這次 AI 精算已取消。' };
            showChefNote.value = true;
        };

        // Synchronous invalidation also catches edit-and-revert before a response arrives.
        watch([selectedDish, selectedMasterIngredients, memberIngredients, diners, memberPortionModes,
            currentSlot, () => engine.personalScope, () => engine.data.pantryInventory.foodStockStatus,
            () => engine.data.ingredients, () => engine.data.dailyLogs, () => engine.profiles],
            cancelChefRequest, { deep: true, flush: 'sync' });

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
            if (key) await calculate();
        };

        const applyPortionValues = (portions) => {
            for (const [member, items] of Object.entries(portions)) {
                const current = memberIngredients.value[member];
                if (!Array.isArray(current)) continue;
                for (const item of items) {
                    const target = current.find(i => i.id === item.id);
                    if (!target) continue;
                    target.amount = item.amount;
                    target.unit = item.unit;
                }
            }
            refreshAllPortionStates();
        };

        const applyLocalEstimate = (expected, contexts, reason) => {
            const estimate = planLocalPortions(engine, expected, contexts);
            if (!estimate) return false;
            activeChefRequest = null; // Do not cancel our own reactive writes.
            applyPortionValues(estimate.portions);
            aiChefAdvice.value = {
                source: 'estimate', portions: estimate.portions, errReason: reason,
                chefComment: reason + '。FK 已依食材營養與當日剩餘額度產生本機估算份量（非 Gemini 建議）。請核對實際食用份量與調味料；蛋白質不保證達標。'
            };
            showChefNote.value = true;
            return true;
        };

        const callAiChefAdvisor = async (started = performance.now()) => {
            if (isAiChefLoading.value || activeMembers.value.length === 0) return false;
            const request = { controller: new AbortController(), scope: engine.personalScope };
            activeChefRequest = request;
            const expected = Object.fromEntries(activeMembers.value.map(m =>
                [m, getMemberActiveIngredients(m).map(i => ({ ...i }))]));
            isAiChefLoading.value = true;
            aiChefAdvice.value = null;
            let contexts = null;

            try {
                const prepareStarted = performance.now();
                const memoryBefore = localStorage.getItem(FK009_KEY);
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
                
                contexts = activeMembers.value.map(member => getMealContext(member));
                if (!apiKey || apiKey.length < 15) {
                    showChefKeyInput.value = true;
                    if (applyLocalEstimate(expected, contexts, 'Gemini API Key 尚未設定')) return true;
                    aiChefAdvice.value = {
                        isKeyMissing: true,
                        chefComment: '請輸入 Gemini API Key。今日剩餘額度亦不足以安排全部選用食材的本機估算，請核對份量。',
                        portions: {}
                    };
                    return false;
                }

                apiKey = (apiKey || '').trim();
                logChefTiming({ phase: 'prepare', durationMs: Math.round(performance.now() - prepareStarted) });
                const resultJson = await planCulinaryMeal({ engine,
                    dish: { id: currentDish.value?.id, name: dishName, slot: slotName },
                    expected, contexts, apiKey, signal: request.controller.signal,
                    deadline: started + CHEF_TOTAL_MS });
                if (activeChefRequest !== request || request.controller.signal.aborted) return false;
                if (engine.personalScope !== request.scope || localStorage.getItem(FK009_KEY) !== memoryBefore) {
                    cancelChefRequest();
                    return false;
                }
                const validationStarted = performance.now();
                validateMealLimits(engine, resultJson.portions, contexts);
                // Release before synchronous writes, so our own application isn't an edit.
                activeChefRequest = null;
                if (resultJson && resultJson.portions) {
                    // 🌟 成功獲取 AI 精算數值！覆寫至各成員的右側實際主數值！

                    applyPortionValues(resultJson.portions);
                    logChefTiming({ phase: 'validateApply', durationMs: Math.round(performance.now() - validationStarted) });
                    aiChefAdvice.value = resultJson;
                    showChefNote.value = resultJson.source !== 'ai';
                    return true;
                }
            } catch (error) {
                if (activeChefRequest !== request || request.controller.signal.aborted) return false;
                const reasons = {
                    '404': '模型或 API 路徑無法使用 (404)',
                    '429': 'AI 暫時限流，請稍後再試 (429)',
                    '503': 'AI 服務暫時忙碌 (503)',
                    '400': 'AI 請求設定不相容 (400)',
                    '401': 'API Key 無效或權限不足 (401)',
                    '403': 'API Key 無效或權限不足 (403)',
                    timeout: 'AI 等待時間已達上限',
                    invalid: 'AI 回傳資料不完整或不合理',
                    network: '網路連線未完成',
                    'culinary-invalid': 'Gemini 料理角色或審查資料未通過驗證',
                    'culinary-no-solution': '料理比例與本餐營養額度無法同時滿足'
                };
                const nutrientNames = { kcal: '熱量', carbs: '碳水', fat: '脂肪', sodium: '鈉' };
                if (error.code === 'limits') {
                    reasons.limits = 'Gemini 建議的' + (nutrientNames[error.nutrient] || '營養') + '超過本餐額度';
                }
                const reason = reasons[error.code] || (error.message?.includes('每日目標')
                    ? '每日目標資料不完整' : 'Gemini 建議未通過份量驗證');
                if (error.code === 'culinary-no-solution') {
                    aiChefAdvice.value = { source: 'local', portions: {}, errReason: reason,
                        chefComment: error.message + '。沒有刪除食材或硬湊份量；請考慮減少選用品項、改變料理或檢查餐次分配。' };
                    showChefNote.value = true;
                    return false;
                }
                if (contexts && applyLocalEstimate(expected, contexts, reason + '（料理審查未完成）')) return true;
                aiChefAdvice.value = { source: 'local', errReason: reason,
                    chefComment: reason + '。今日剩餘額度不足以對全部選用食材安排有效份量，未產生估算。請核對今日紀錄、改用「剩餘」模式或取消食材；已保留原始／手動份量。', portions: {} };
                showChefNote.value = true;
                return false;
            } finally {
                if (activeChefRequest === request) activeChefRequest = null;
                // A cancelled older call must not clear a newer call's loading state.
                if (!activeChefRequest) isAiChefLoading.value = false;
                logChefTiming({ phase: 'total', durationMs: Math.round(performance.now() - started) });
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
            alert('✨ 已重置為料理配方比例（尚未產生動態建議）！');
        };

        const copySOP = async () => {
            if (!currentDish.value) return;

            const ingredients = totalIngredientsList.value.map(item => {
                const breakdown = activeMembers.value.length > 1 && item.breakdown.length
                    ? `（${item.breakdown.map(b => `${b.memberName} ${b.amount}${b.unit}`).join('、')}）`
                    : '';
                const pending = needsNutritionReview(item);
                const amountText = pending && !(Number(item.amount) > 0)
                    ? '待確認' : `${item.amount}${item.unit}`;
                return `${weightBasisText(engine.getIngredientById(item.id), item.unit)}${item.name}：${amountText}${breakdown}${pending ? '（營養資料待確認，非已核算份量）' : ''}`;
            });
            const lines = [
                `${currentDish.value.name}｜全家總備料（${totalPortions.value} 人份）`,
                '',
                '【食材與份量】',
                ...ingredients,
                '',
                '【料理 SOP】',
                ...(currentSopSteps.value.length ? currentSopSteps.value : ['此料理尚無 SOP 步驟。'])
            ];
            const text = lines.join('\n');

            // HTTPS／iOS PWA 優先使用 Clipboard API，只有真正成功才顯示成功。
            if (window.isSecureContext && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                    alert('食譜、全家備料與 SOP 已複製！');
                    return;
                } catch (error) {
                    console.warn('Clipboard API 複製失敗，改試備援方式：', error);
                }
            }

            // 本機 HTTP 或不支援 Clipboard API 的瀏覽器，使用傳統文字選取備援。
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.readOnly = true;
            textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
            document.body.appendChild(textarea);

            let copied = false;
            try {
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, text.length);
                copied = document.execCommand('copy');
            } catch (error) {
                console.warn('備援複製失敗：', error);
            } finally {
                textarea.remove();
            }

            if (copied) {
                alert('食譜、全家備料與 SOP 已複製！');
            } else {
                prompt('無法自動複製，請長按以下文字手動複製：', text);
            }
        };

        const goToTracker = () => {
            showRecordSuccessModal.value = false;
            if (props.onNavigate) {
                props.onNavigate('tracker');
            }
        };

        let savingMeals = false;
        const recordMeal = async () => {
            if (savingMeals) return;
            savingMeals = true;
            try {
                if (!currentDish.value) return;
                // Do not trap the iPhone in a native alert when only a partial
                // portion estimate exists. Point to the already-visible review
                // list, while still refusing to store incomplete nutrition.
                if (recordPendingItems.value.length) {
                    Vue.nextTick(() => (document.getElementById?.('meal-record-review')
                        || document.getElementById?.('portions-section'))?.scrollIntoView?.({
                        behavior: 'smooth', block: 'start'
                    }));
                    return;
                }
                cancelChefRequest();
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0];
                const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            
                const permitted = activeMembers.value.filter(member => engine.canAccessMeal(member));
                if (!permitted.length) { alert('請登入並確認餐點權限後再記錄。'); return; }
                let allSynced = true;
                for (const member of permitted) {
                    const ingredients = getMemberActiveIngredients(member).map(i => ({
                        id: i.id,
                        name: getIngredientName(i.id),
                        amount: i.amount,
                        unit: i.unit
                    }));
                    const nutrition = getMemberNutrition(member);
                
                    const mealEntry = {
                        id: 'meal_' + crypto.randomUUID(),
                        dishId: currentDish.value.id,
                        dishName: currentDish.value.name,
                        time: timeStr,
                        nutrients: nutrition,
                        ingredientsSummary: ingredients.map(i => `${i.name} ${i.amount}${i.unit}`)
                    };
                
                    try { if (await engine.recordMeal(dateStr, member, mealEntry) === false) allSynced = false; }
                    catch (error) { alert(error.message); return; }
                }
            
                if (!allSynced) { alert('餐點已保留於此裝置，部分尚未同步。請連線並確認登入後重試。'); return; }
                recordSuccessDishName.value = currentDish.value.name;
                recordSuccessDate.value = dateStr;
                showRecordSuccessModal.value = true;
                if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
            } finally { savingMeals = false; }
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
            useHistoricalPortions, hasHistoricalPortions, selectedMasterIngredients,
            calculationNotice,
            engine,
            selectedDish,
            memberIngredients,
            diners,
            memberPortionModes,
            expandedMember,
            showPortionHint,
            dismissPortionHint,
            selectMemberPortionMode,
            onMemberPointerDown,
            onMemberPointerMove,
            onMemberPointerUp,
            onMemberPointerCancel,
            onMemberClick,
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
            needsNutritionReview,
            getSelectedNutritionIssues,
            recordPendingItems,
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
            onAmountBlur,
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
            saveChefKey,
            portionMemoryButtonState,
            savePortionMemory,
            deletePortionMemory,
            getPortionMemoryWarning
        };
    },
    template: `
        <div class="view-calculator">
            <!-- 01 DISH -->
            <div class="section-title">
                <span>01 DISH 選擇料理</span>
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

                <!-- DINERS 就餐成員 (獨立橫列) -->
                <div class="section-title">03 就餐成員</div>

                <!-- 初次使用淡提示 -->
                <div v-if="showPortionHint" class="portion-mode-hint-banner">
                    <span>💡 長按已選成員可切換「標準份量」或「剩餘額度」</span>
                    <button type="button" class="hint-close-btn" @click.stop="dismissPortionHint" aria-label="關閉提示">✕</button>
                </div>

                <div class="capsule-group member-capsules-container" style="margin-bottom: 18px;">
                    <!-- Bebe -->
                    <div class="member-capsule-wrapper" :class="{ 'is-expanded': expandedMember === 'bebe' }">
                        <button 
                            v-if="expandedMember === 'bebe'" 
                            type="button" 
                            class="mode-wing-btn wing-left"
                            :class="{ 'active': memberPortionModes.bebe === 'standard' }"
                            @click.stop="selectMemberPortionMode('bebe', 'standard')">
                            標準
                        </button>
                        <div 
                            class="capsule member-capsule" 
                            :class="{ 'selected': diners.bebe, 'expanded': expandedMember === 'bebe' }"
                            @pointerdown="onMemberPointerDown('bebe', $event)"
                            @pointermove="onMemberPointerMove('bebe', $event)"
                            @pointerup="onMemberPointerUp('bebe', $event)"
                            @pointercancel="onMemberPointerCancel('bebe', $event)"
                            @click.prevent.stop="onMemberClick('bebe')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                <line x1="15" y1="9" x2="15.01" y2="9"></line>
                            </svg>
                            <span>Bebe</span>
                        </div>
                        <span 
                            v-if="diners.bebe && expandedMember !== 'bebe'" 
                            class="member-mode-note"
                            :class="memberPortionModes.bebe">
                            {{ memberPortionModes.bebe === 'remaining' ? '剩餘' : '標準' }}
                        </span>
                        <button 
                            v-if="expandedMember === 'bebe'" 
                            type="button" 
                            class="mode-wing-btn wing-right"
                            :class="{ 'active': memberPortionModes.bebe === 'remaining' }"
                            @click.stop="selectMemberPortionMode('bebe', 'remaining')">
                            剩餘
                        </button>
                    </div>

                    <!-- 樂樂 (Ariel) -->
                    <div class="member-capsule-wrapper" :class="{ 'is-expanded': expandedMember === 'ariel' }">
                        <button 
                            v-if="expandedMember === 'ariel'" 
                            type="button" 
                            class="mode-wing-btn wing-left"
                            :class="{ 'active': memberPortionModes.ariel === 'standard' }"
                            @click.stop="selectMemberPortionMode('ariel', 'standard')">
                            標準
                        </button>
                        <div 
                            class="capsule member-capsule" 
                            :class="{ 'selected': diners.ariel, 'expanded': expandedMember === 'ariel' }"
                            @pointerdown="onMemberPointerDown('ariel', $event)"
                            @pointermove="onMemberPointerMove('ariel', $event)"
                            @pointerup="onMemberPointerUp('ariel', $event)"
                            @pointercancel="onMemberPointerCancel('ariel', $event)"
                            @click.prevent.stop="onMemberClick('ariel')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            <span>樂樂</span>
                        </div>
                        <span 
                            v-if="diners.ariel && expandedMember !== 'ariel'" 
                            class="member-mode-note"
                            :class="memberPortionModes.ariel">
                            {{ memberPortionModes.ariel === 'remaining' ? '剩餘' : '標準' }}
                        </span>
                        <button 
                            v-if="expandedMember === 'ariel'" 
                            type="button" 
                            class="mode-wing-btn wing-right"
                            :class="{ 'active': memberPortionModes.ariel === 'remaining' }"
                            @click.stop="selectMemberPortionMode('ariel', 'remaining')">
                            剩餘
                        </button>
                    </div>

                    <!-- Jason -->
                    <div class="member-capsule-wrapper" :class="{ 'is-expanded': expandedMember === 'jason' }">
                        <button 
                            v-if="expandedMember === 'jason'" 
                            type="button" 
                            class="mode-wing-btn wing-left"
                            :class="{ 'active': memberPortionModes.jason === 'standard' }"
                            @click.stop="selectMemberPortionMode('jason', 'standard')">
                            標準
                        </button>
                        <div 
                            class="capsule member-capsule" 
                            :class="{ 'selected': diners.jason, 'expanded': expandedMember === 'jason' }"
                            @pointerdown="onMemberPointerDown('jason', $event)"
                            @pointermove="onMemberPointerMove('jason', $event)"
                            @pointerup="onMemberPointerUp('jason', $event)"
                            @pointercancel="onMemberPointerCancel('jason', $event)"
                            @click.prevent.stop="onMemberClick('jason')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 18L3 11L9 4L17 5L21 11L19 19L11 21L5 18Z"></path>
                                <line x1="9" y1="4" x2="11" y2="12"></line>
                                <line x1="11" y1="12" x2="19" y2="19"></line>
                                <line x1="11" y1="12" x2="3" y2="11"></line>
                            </svg>
                            <span>Jason</span>
                        </div>
                        <span 
                            v-if="diners.jason && expandedMember !== 'jason'" 
                            class="member-mode-note"
                            :class="memberPortionModes.jason">
                            {{ memberPortionModes.jason === 'remaining' ? '剩餘' : '標準' }}
                        </span>
                        <button 
                            v-if="expandedMember === 'jason'" 
                            type="button" 
                            class="mode-wing-btn wing-right"
                            :class="{ 'active': memberPortionModes.jason === 'remaining' }"
                            @click.stop="selectMemberPortionMode('jason', 'remaining')">
                            剩餘
                        </button>
                    </div>
                </div>

                <!-- 計算操作橫列 (右側正圓計算按鈕，原全域雙切已融入成員膠囊) -->
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-bottom: 24px;">
                    <span v-if="calculationNotice" role="status" style="font-size:0.8rem;color:#92400E;">{{ calculationNotice }}</span>
                    <span v-else-if="isAiChefLoading" role="status" style="font-size:0.8rem;color:var(--color-text-muted);">AI 建議計算中…</span>
                    <button class="btn-icon" @click="calculate" :disabled="isAiChefLoading" aria-label="進行備料計算" style="width: 42px; height: 42px; min-width: 42px; border-radius: 50%; background: var(--color-primary); color: white; border: none; padding: 0; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(245, 166, 35, 0.4); cursor: pointer;" title="進行備料計算">
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

            <div v-if="selectedDish && isCalculated" style="position: relative; padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">
                <!-- 03 PORTIONS -->
                <div id="portions-section" class="section-title" style="scroll-margin-top: 84px;">03 PORTIONS 全家備料大白板</div>
                <div class="card" style="margin-bottom: 24px; background: #fffdf8; border: 1px solid var(--color-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 700; color: var(--color-text-main);">全家總備料 ({{ totalPortions }} 人份)</span>
                            <span v-if="isAiChefLoading" style="font-size: 0.74rem; color: #92400E; background: #FEF3C7; padding: 2px 9px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #FDE68A;">
                                <span class="apple-spinner"></span>
                                <span>AI 優化中...</span>
                            </span>
                            <span v-else-if="aiChefAdvice && aiChefAdvice.source === 'ai'" style="font-size: 0.72rem; color: #B45309; background: #FEF3C7; padding: 2px 8px; border-radius: 10px; font-weight: 700;">✨ AI 料理審查＋FK 配比</span>
                            <span v-else-if="aiChefAdvice?.source === 'estimate'" style="font-size: 0.72rem; color: #B45309; background: #FEF3C7; padding: 2px 8px; border-radius: 10px; font-weight: 700;">{{ aiChefAdvice.reviewed === false ? '⚖️ FK 重算・待料理複核' : '⚖️ 本機估算配比' }}</span>
                            <span v-else style="font-size: 0.72rem; color: #4B5563; background: #F3F4F6; padding: 2px 8px; border-radius: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #E5E7EB;">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                <span>{{ aiChefAdvice?.source === 'partial' ? '部分份量已估算' : aiChefAdvice?.source === 'blocked' ? '份量尚未計算' : '原始／手動份量' }}</span>
                            </span>
                        </div>
                        <!-- 📋 精簡正圓形複製食譜按鈕 -->
                        <button class="btn-icon" 
                                @click="copySOP" 
                                style="width: 32px; height: 32px; border-radius: 50%; background: #FAF8F5; border: 1px solid var(--color-border); color: #4B5563; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.04);" 
                                title="複製食譜、全家備料與 SOP" aria-label="複製食譜、全家備料與 SOP">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    
                    <p v-if="isAiChefLoading" role="status" style="font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.5;">
                        顯示目前的料理／手動份量；AI 最多等待 20 秒。調整份量會取消這次 AI 精算。
                    </p>
                    <div v-if="!isAiChefLoading && (recordPendingItems.length || (aiChefAdvice && aiChefAdvice.source !== 'ai'))"
                         :id="recordPendingItems.length ? 'meal-record-review' : null"
                         role="status" style="scroll-margin-top:84px;font-size:0.83rem;line-height:1.55;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin-bottom:14px;">
                        <strong>{{ recordPendingItems.length ? '部分食材已估算・整餐待確認' : aiChefAdvice?.source === 'estimate' ? (aiChefAdvice.reviewed === false ? 'FK 已重算份量（AI 尚未二次審查）' : '已產生本機估算份量（非 AI）') : '尚未取得 AI 份量建議' }}</strong>
                        <div v-if="recordPendingItems.length">有 {{ recordPendingItems.length }} 項食材的營養來源或重量換算待核對；其他已確認食材僅供部分備料參考，尚不能記錄完整營養。</div>
                        <div v-else>{{ aiChefAdvice?.chefComment }}</div>
                        <div v-if="recordPendingItems.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                            <button v-for="problem in recordPendingItems" :key="problem.id" class="btn-icon"
                                    type="button" @click="openIngredientDetail(problem.id)"
                                    style="font-size:0.79rem;padding:5px 9px;">
                                {{ problem.name }} · 核對資料
                            </button>
                        </div>
                    </div>
                    <p v-if="!['ai','estimate','partial','blocked'].includes(aiChefAdvice?.source)" style="font-size:0.8rem;color:var(--color-text-muted);margin:0 0 10px;">
                        非 AI 計算結果；原始份量不代表適合目前營養目標。尚未分配的食材需核對或手動調整。
                    </p>
                    <p class="weight-basis-legend">生＝生重・熟＝熟重・乾＝乾重・即＝即食／販售狀態・？＝重量基準待確認・空心圓＝計數</p>
                    <p v-if="selectedMasterIngredients.includes('shin_ramen')"
                       class="prep-ingredient-warning" role="note" style="margin:0 0 12px;line-height:1.5;">
                        非油炸辛拉麵目前以整包 97 g（含全部調味料）估算。只秤麵體或少放調味包時，營養與鈉不能精確拆算。
                    </p>
                    <ul style="list-style: none; padding-left: 0; margin-bottom: 16px;">
                        <li v-for="item in totalIngredientsList" :key="item.id + ':' + item.unit" class="prep-ingredient-row">
                            <weight-basis-badge :ingredient="engine.getIngredientById(item.id)" :unit="item.unit" />
                            <span class="prep-ingredient-name">{{ item.name }}</span>
                            <span class="prep-ingredient-amount">{{ needsNutritionReview(item) ? (Number(item.amount) > 0 ? item.amount + item.unit + '・待確認' : '待確認') : Number(item.amount) === 0 && aiChefAdvice?.source !== 'ai' ? '尚未分配' : item.amount + item.unit }}</span>
                            <span v-if="activeMembers.length > 1 && item.breakdown.length > 0" class="prep-ingredient-breakdown">
                                (<span v-for="(b, bIdx) in item.breakdown" :key="bIdx">{{ b.memberName }} {{ b.amount }}{{ b.unit }}<span v-if="bIdx < item.breakdown.length - 1">, </span></span>)
                            </span>
                            <span v-if="needsNutritionReview(item)" class="prep-ingredient-warning">營養來源或單位待核對</span>
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
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px;">
                        <h3 style="margin-bottom: 0; font-size: 1.02rem; white-space: nowrap; flex-shrink: 0;">{{ engine.profiles[member].name }} 的專屬份量</h3>
                        
                        <!-- ✨ AI vs Local Status Indicator -->
                        <div>
                            <!-- AI Success / Advisor State -->
                            <button v-if="!recordPendingItems.length && aiChefAdvice && aiChefAdvice.source === 'ai'"
                                     @click="showChefNote = !showChefNote"
                                     style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 700; color: #B45309; background: #FEF3C7; padding: 3px 10px; border-radius: 12px; border: 1px solid #FDE68A; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;">
                                 <span>✨ 料理審查通過・FK 營養已核算</span>
                                 <span style="font-size: 0.7rem;">{{ showChefNote ? '∧' : '∨' }}</span>
                            </button>
                            <!-- Local Solver State (Clickable to view takeover reason) -->
                            <button v-else-if="!recordPendingItems.length && !['partial', 'blocked'].includes(aiChefAdvice?.source)"
                                    @click="showChefNote = !showChefNote"
                                    style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; font-weight: 600; color: #92400E; background: #FEF3C7; padding: 3px 10px; border-radius: 12px; border: 1px solid #FDE68A; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                <span>{{ aiChefAdvice?.source === 'estimate' ? (aiChefAdvice.reviewed === false ? 'FK 重算・待料理複核' : '本機估算・請核對') : aiChefAdvice?.source === 'partial' ? '部分份量估算・整餐待確認' : aiChefAdvice?.source === 'blocked' ? '營養資料待核對' : '尚無 AI 建議' }}</span>
                                <span style="font-size: 0.7rem;">{{ showChefNote ? '∧' : '∨' }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Expandable Chef Note Box (Collapsible) -->
                    <div v-if="member === activeMembers[0] && showChefNote && aiChefAdvice && aiChefAdvice.chefComment && !['partial', 'blocked'].includes(aiChefAdvice.source)"
                         :style="{
                             marginBottom: '14px',
                             background: aiChefAdvice.source === 'ai' ? '#FFFDF8' : '#FFFBEB',
                             borderLeft: aiChefAdvice.source === 'ai' ? '3px solid var(--color-primary)' : '3px solid #F59E0B',
                             borderRadius: '8px',
                             padding: '10px 12px',
                             fontSize: '0.85rem',
                             color: '#4B5563',
                             lineHeight: '1.6',
                             boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                         }">
                        <div style="font-weight: 700; color: #B45309; margin-bottom: 4px; font-size: 0.78rem; display: flex; align-items: center; justify-content: space-between;">
                            <span>{{ aiChefAdvice.source === 'ai' ? '💬 十一粒 AI 主廚點評：' : aiChefAdvice.source === 'estimate' ? '⚖️ 本機估算說明：' : aiChefAdvice.source === 'partial' ? '⚖️ 部分備料參考：' : '⚙️ 份量未完成說明：' }}</span>
                            <span v-if="aiChefAdvice.source !== 'ai'" style="font-size: 0.7rem; color: #D97706; background: #FEF3C7; padding: 1px 6px; border-radius: 4px; font-weight: 600;">{{ aiChefAdvice.source === 'partial' ? '部分估算・未做 AI 料理審查' : aiChefAdvice.reviewed === false ? '待料理複核' : '未通過 AI 料理審查' }}</span>
                        </div>
                        <div>{{ aiChefAdvice.chefComment }}</div>
                        <div v-if="aiChefAdvice.reviewReason">料理審查：{{ aiChefAdvice.reviewReason }}</div>
                    </div>
                    
                    <!-- Full nutrition status tags appear only when every selected food is verified. -->
                    <div v-if="!getSelectedNutritionIssues(member).length" style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; font-size: 0.75rem;">
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
                          class="member-ingredient-row">
                        <div class="member-ingredient-label">
                            <weight-basis-badge :ingredient="engine.getIngredientById(ing.id)" :unit="ing.unit" />
                            <div class="member-ingredient-name"><span style="font-weight: 500;">{{ getIngredientName(ing.id) }}</span>
                            <span v-if="getDefaultAmount(member, ing.id)" 
                                  style="font-size: 0.75rem; color: #9CA3AF; font-weight: 400; margin-left: 6px;">
                                ({{ getDefaultAmount(member, ing.id) }})
                            </span></div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button class="btn-icon stepper-btn" 
                                    @click="adjustMemberAmount(member, ing, -1)" 
                                    title="減 1"
                                    style="width: 32px; height: 32px; padding: 0; font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--color-border); background: #FFFFFF; cursor: pointer; color: var(--color-text-main); user-select: none; transition: all 0.15s ease;">
                                -
                            </button>
                            
                            <!-- 可直接修改的中間數字輸入框 -->
                            <div style="display: flex; align-items: center; justify-content: center; background: #F9FAFB; border: 1px solid var(--color-border); border-radius: 8px; padding: 2px 6px; min-width: 68px; height: 32px; box-sizing: border-box;">
                                <input type="number" 
                                       v-model.number="ing.amount" 
                                       @focus="$event.target.select()" 
                                       @blur="onAmountBlur(ing)"
                                       @keyup.enter="$event.target.blur()"
                                       class="no-spin"
                                       min="0" 
                                       max="9999" 
                                       step="1"
                                       style="width: 44px; text-align: right; border: none; background: transparent; font-weight: 700; font-size: 0.95rem; color: #111827; outline: none; padding: 0; font-family: inherit;">
                                <span style="font-size: 0.75rem; color: #6B7280; margin-left: 2px; font-weight: 500; white-space: nowrap; user-select: none;">{{ ing.unit }}</span>
                            </div>

                            <button class="btn-icon stepper-btn" 
                                    @click="adjustMemberAmount(member, ing, 1)" 
                                    title="加 1"
                                    style="width: 32px; height: 32px; padding: 0; font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--color-border); background: #FFFFFF; cursor: pointer; color: var(--color-text-main); user-select: none; transition: all 0.15s ease;">
                                +
                            </button>
                        </div>
                    </div>

                    <!-- 🔒 FK-009: 記住這組份量 -->
                    <div style="margin-top: 14px; margin-bottom: 2px;">
                        <!-- ⚠️ 剩餘額度超額提示（僅在 remaining 模式 + 超額時顯示）-->
                        <div v-if="getPortionMemoryWarning(member)"
                             style="margin-bottom: 8px; padding: 5px 10px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; font-size: 0.76rem; color: #92400E; display: flex; align-items: center; gap: 5px;">
                            <span>⚠️</span>
                            <span>常用份量約 {{ getPortionMemoryWarning(member).currentKcal }} kcal，超過今日剩餘額度 {{ getPortionMemoryWarning(member).remainingKcal }} kcal</span>
                        </div>
                        <!-- 按鈕區塊（居中，低視覺權重）-->
                        <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; min-height: 28px;">
                            <button v-if="hasHistoricalPortions(member)" @click="useHistoricalPortions(member)"
                                    type="button" class="btn-icon"
                                    style="background:none;border:none;padding:3px 8px;color:#9CA3AF;font-size:0.8rem;cursor:pointer;">
                                取用舊份量
                            </button>
                            <!-- unsaved / modified -->
                            <button v-if="portionMemoryButtonState[member] !== 'saved'"
                                    @click="savePortionMemory(member)"
                                    style="background: none; border: none; cursor: pointer; font-size: 0.8rem; color: #C4B5A0; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; transition: color 0.18s ease; user-select: none;"
                                    @mouseover="$event.target.style.color='#9CA3AF'" @mouseout="$event.target.style.color='#C4B5A0'">
                                {{ portionMemoryButtonState[member] === 'modified' ? '♡ 更新這組份量' : '♡ 記住這組份量' }}
                            </button>
                            <!-- saved -->
                            <template v-else>
                                <span style="font-size: 0.8rem; color: #F97316; display: inline-flex; align-items: center; gap: 3px; user-select: none;">♥ 已記住這組份量</span>
                                <span style="color: #E5E7EB; font-size: 0.78rem; user-select: none;">·</span>
                                <button @click="deletePortionMemory(member)"
                                        style="background: none; border: none; cursor: pointer; font-size: 0.74rem; color: #D1D5DB; padding: 0; transition: color 0.18s ease; user-select: none;"
                                        @mouseover="$event.target.style.color='#9CA3AF'" @mouseout="$event.target.style.color='#D1D5DB'">取消</button>
                            </template>
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
                <button class="btn-primary" :class="{accent: !recordPendingItems.length}" @click="recordMeal"
                        :aria-label="recordPendingItems.length ? ('查看 ' + recordPendingItems.length + ' 項待核對食材') : '記錄餐點'"
                        :style="{
                            display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',
                            ...(recordPendingItems.length ? {background:'#FFFBEB',color:'#92400E',border:'1px solid #FDE68A'} : {})
                        }">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    <span>{{ recordPendingItems.length ? ('待核對 ' + recordPendingItems.length + ' 項') : '紀錄' }}</span>
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
                        已成功記錄<strong>【{{ recordSuccessDishName }}】</strong>至今日飲食追蹤庫存！
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
