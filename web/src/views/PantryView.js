const { ref, computed, watch } = Vue;

export default {
    props: ['engine'],
    setup(props) {
        const engine = props.engine;

        // Modal States
        const showShoppingModal = ref(false); // 畫面 B: 滿版採買視窗
        const showSupplyModal = ref(false);   // 畫面 C: 生活雜項詳細資料 Modal
        const showAddModal = ref(false);      // 拍照/新增食材抽屜
        const showFoodDetailModal = ref(false); // 食材詳細資料 Modal
        const selectedFood = ref(null);
        
        // Modal 背景鎖定機制 (Body Scroll Lock)
        watch([showAddModal, showSupplyModal, showShoppingModal, showFoodDetailModal], (newVals) => {
            const isAnyOpen = newVals.some(v => v === true);
            if (isAnyOpen) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        });
        
        const shoppingStoreFilter = ref('all'); // 'all' | '全聯' | 'Costco'
        const selectedSupply = ref(null);

        // Add form state (支援每份/每 100g 雙軌切換)
        const addFormDisplayBasis = ref('serving'); // 'serving' | '100g'
        const addForm = ref({
            name: '',
            type: 'food', // 'food' | 'supply'
            category: 'proteins',
            storageZones: ['fridge'],
            storageZone: 'fridge',
            unitLabel: 'g',
            servingSize: 10,
            servingUnit: 'g',
            brand: '',
            price: '',
            store: '全聯',
            perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 },
            per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }
        });

        const isAddFormZoneSelected = (zoneKey) => {
            if (!addForm.value.storageZones) addForm.value.storageZones = [addForm.value.storageZone || 'fridge'];
            return addForm.value.storageZones.includes(zoneKey);
        };

        const toggleAddFormZone = (zoneKey) => {
            if (!addForm.value.storageZones) addForm.value.storageZones = [addForm.value.storageZone || 'fridge'];
            const idx = addForm.value.storageZones.indexOf(zoneKey);
            if (idx === -1) {
                addForm.value.storageZones.push(zoneKey);
            } else {
                if (addForm.value.storageZones.length > 1) {
                    addForm.value.storageZones.splice(idx, 1);
                }
            }
            addForm.value.storageZone = addForm.value.storageZones[0];
        };

        // 4 Storage Zones mapped to ingredients
        const zoneNames = {
            fridge: '【冷藏區】 (Fridge Zone)',
            freezer: '【冷凍區】 (Freezer Zone)',
            pantry: '【常溫區】 (Pantry Zone)'
        };

        const getZoneIngredients = (zone) => {
            const all = engine.data.ingredients || [];
            return all.filter(ing => {
                const zones = ing.storageZones || (ing.storageZone ? [ing.storageZone] : ['fridge']);
                return zones.includes(zone);
            });
        };

        const getCategoryInZone = (zone, cat) => {
            return getZoneIngredients(zone).filter(ing => ing.category === cat);
        };

        // Household Supplies
        const supplies = computed(() => {
            return engine.data.householdSupplies?.supplies || [];
        });

        // Stock and Cart checks
        const checkFoodStock = (id) => engine.checkStock(id);
        const checkSupplyStock = (id) => engine.checkSupplyStock(id);
        const isInCart = (id) => engine.isInShoppingList(id);

        const toggleFoodStock = async (id) => {
            const current = checkFoodStock(id);
            await engine.toggleStock(id, !current);
        };

        const toggleSupplyStock = async (id) => {
            const current = checkSupplyStock(id);
            await engine.toggleSupplyStock(id, !current);
        };

        const toggleFoodCart = async (ing) => {
            await engine.toggleShoppingList({
                type: 'food',
                targetId: ing.id,
                name: ing.name,
                sourceDish: '常備食材',
                store: ing.preferredStore || '全聯'
            });
        };

        const toggleSupplyCart = async (sup) => {
            await engine.toggleShoppingList({
                type: 'supply',
                targetId: sup.id,
                name: sup.name,
                sourceDish: '常購雜項',
                store: sup.store || 'Costco'
            });
        };

        // Long press handling for supplies (750ms heavy hold + anti-drag touchmove protection)
        let pressTimer = null;
        let supplyTouchStartX = 0;
        let supplyTouchStartY = 0;

        const startPress = (sup, event) => {
            if (event && event.type === 'touchstart' && event.touches && event.touches[0]) {
                supplyTouchStartX = event.touches[0].clientX;
                supplyTouchStartY = event.touches[0].clientY;
            }
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(40);
                openSupplyDetail(sup);
            }, 750);
        };

        const handleSupplyTouchMove = (event) => {
            if (!pressTimer) return;
            if (event.touches && event.touches[0]) {
                const moveX = Math.abs(event.touches[0].clientX - supplyTouchStartX);
                const moveY = Math.abs(event.touches[0].clientY - supplyTouchStartY);
                if (moveX > 6 || moveY > 6) {
                    cancelPress();
                }
            }
        };

        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const openSupplyDetail = (sup) => {
            selectedSupply.value = sup;
            showSupplyModal.value = true;
        };

        // Helper to resolve all preferred stores for any shopping item (支援複選通路)
        const getItemStores = (item) => {
            if (item.type === 'supply') {
                const sup = engine.data.householdSupplies?.supplies?.find(s => s.id === item.targetId);
                if (sup?.preferredStores && sup.preferredStores.length > 0) return sup.preferredStores;
                if (sup?.store) return [sup.store];
                return ['Costco'];
            }
            const ing = engine.getIngredientById(item.targetId);
            if (ing?.preferredStores && ing.preferredStores.length > 0) return ing.preferredStores;
            if (ing?.preferredStore) return [ing.preferredStore];
            if (item.store) return [item.store];
            return ['全聯'];
        };

        const getItemStoreLabel = (item) => {
            return getItemStores(item).join('、');
        };

        const shoppingList = computed(() => {
            return engine.data.pantryInventory?.shoppingList || [];
        });

        const lastStoreAction = ref(null);
        let lastActionTimer = null;

        const getStoreShoppingCount = (storeKey) => {
            const list = shoppingList.value.filter(s => !s.isPurchased);
            if (storeKey === 'all') return list.length;
            return list.filter(s => getItemStores(s).includes(storeKey)).length;
        };

        const filteredFoodShopping = computed(() => {
            const list = shoppingList.value.filter(s => s.type === 'food');
            if (shoppingStoreFilter.value === 'all') return list;
            return list.filter(item => getItemStores(item).includes(shoppingStoreFilter.value));
        });

        const filteredSupplyShopping = computed(() => {
            const list = shoppingList.value.filter(s => s.type === 'supply');
            if (shoppingStoreFilter.value === 'all') return list;
            return list.filter(item => getItemStores(item).includes(shoppingStoreFilter.value));
        });

        const toggleItemPurchased = async (id) => {
            await engine.toggleShoppingItemPurchased(id);
        };

        const deleteShoppingItem = async (id) => {
            await engine.deleteShoppingItem(id);
        };

        const activeStorePickerItemId = ref(null);
        const availableStores = ['全聯', 'Costco', '義美', '傳統市場', 'EC 電商', '其他'];

        const toggleStorePicker = (itemId) => {
            activeStorePickerItemId.value = activeStorePickerItemId.value === itemId ? null : itemId;
        };

        // 複選切換通路 (Multi-select Store)
        const toggleStoreForItem = async (item, targetStore) => {
            const currentStores = [...getItemStores(item)];
            const oldStores = [...currentStores];

            const idx = currentStores.indexOf(targetStore);
            if (idx !== -1) {
                if (currentStores.length > 1) {
                    currentStores.splice(idx, 1);
                }
            } else {
                currentStores.push(targetStore);
            }

            if (item.type === 'supply') {
                if (engine.data.householdSupplies?.supplies) {
                    const sup = engine.data.householdSupplies.supplies.find(s => s.id === item.targetId);
                    if (sup) {
                        sup.preferredStores = currentStores;
                        sup.store = currentStores[0];
                        await engine.saveJson('household_supplies.json', engine.data.householdSupplies);
                    }
                }
            } else {
                const ing = engine.getIngredientById(item.targetId);
                if (ing) {
                    ing.preferredStores = currentStores;
                    ing.preferredStore = currentStores[0];
                    if (engine.data.rawIngredients) {
                        ['proteins', 'veggies', 'carbs', 'sauces', 'drinks'].forEach(cat => {
                            const rawIng = engine.data.rawIngredients[cat]?.find(i => i.id === item.targetId);
                            if (rawIng) {
                                rawIng.preferredStores = currentStores;
                                rawIng.preferredStore = currentStores[0];
                            }
                        });
                        await engine.saveJson('ingredients.json', engine.data.rawIngredients);
                    }
                }
            }
            item.store = currentStores[0];
            await engine.saveJson('pantry_inventory.json', engine.data.pantryInventory);

            // 更新全域通知條 (常駐於畫面頂部)
            lastStoreAction.value = {
                item,
                itemId: item.id,
                targetId: item.targetId,
                itemName: item.name,
                type: item.type,
                oldStores,
                newStores: currentStores,
                newStoreLabel: currentStores.join('、')
            };

            if (lastActionTimer) clearTimeout(lastActionTimer);
            lastActionTimer = setTimeout(() => {
                lastStoreAction.value = null;
            }, 10000);
        };

        const undoLastStoreAction = async () => {
            if (!lastStoreAction.value) return;
            const { item, oldStores } = lastStoreAction.value;
            lastStoreAction.value = null;
            if (lastActionTimer) clearTimeout(lastActionTimer);

            if (item.type === 'supply') {
                if (engine.data.householdSupplies?.supplies) {
                    const sup = engine.data.householdSupplies.supplies.find(s => s.id === item.targetId);
                    if (sup) {
                        sup.preferredStores = oldStores;
                        sup.store = oldStores[0];
                        await engine.saveJson('household_supplies.json', engine.data.householdSupplies);
                    }
                }
            } else {
                const ing = engine.getIngredientById(item.targetId);
                if (ing) {
                    ing.preferredStores = oldStores;
                    ing.preferredStore = oldStores[0];
                    if (engine.data.rawIngredients) {
                        ['proteins', 'veggies', 'carbs', 'sauces', 'drinks'].forEach(cat => {
                            const rawIng = engine.data.rawIngredients[cat]?.find(i => i.id === item.targetId);
                            if (rawIng) {
                                rawIng.preferredStores = oldStores;
                                rawIng.preferredStore = oldStores[0];
                            }
                        });
                        await engine.saveJson('ingredients.json', engine.data.rawIngredients);
                    }
                }
            }
            item.store = oldStores[0];
            await engine.saveJson('pantry_inventory.json', engine.data.pantryInventory);
        };

        const getItemStore = (item) => getItemStoreLabel(item);
        const updateItemStore = async (item, store) => toggleStoreForItem(item, store);

        const clearPurchased = async () => {
            await engine.clearPurchasedShoppingList();
            alert('🧹 已清除所有已採買項目，並自動補入冰箱庫存！');
        };

        const copyShoppingListText = () => {
            const list = shoppingList.value;
            if (list.length === 0) {
                alert('目前採買清單為空！');
                return;
            }
            let text = '🛒 【FAMILY KITCHEN 賣場待買清單】\n';
            const unpurchased = list.filter(s => !s.isPurchased);
            unpurchased.forEach(item => {
                text += `▫️ ${item.name} (${getItemStoreLabel(item)})\n`;
            });
            navigator.clipboard.writeText(text);
            alert('📋 已複製待買清單文字至剪貼簿！');
        };

        const copyLineMessage = (sup) => {
            if (!sup) return;
            const text = `【代購提醒】幫我買：${sup.name}\n品牌：${sup.brand || '無'}\n規格價格：${sup.price ? '$' + sup.price : ''} (${sup.priceUnit || ''})\n購買通路：${sup.store || '賣場'}`;
            navigator.clipboard.writeText(text);
            alert('📤 已複製代購規格文字，可直接貼至 LINE 給家人！');
        };

        const deleteSupplyItem = async (id) => {
            if (confirm('確定要永久刪除此雜項嗎？')) {
                await engine.deleteSupply(id);
                showSupplyModal.value = false;
            }
        };

        // Add new item logic
        const saveNewItem = async () => {
            const name = (addForm.value.name || '').trim();
            if (!name) {
                alert('請輸入名稱！');
                return;
            }
            if (addForm.value.type === 'food') {
                const newId = 'ing_' + Date.now();
                
                // 智慧根據分類與名稱給予合理的 100g 營養成份初值
                const categoryDefaults = {
                    oils: { kcal: 600, protein: 20, carbs: 15, fat: 50, sodium: 100 },
                    proteins: { kcal: 180, protein: 20, carbs: 2, fat: 10, sodium: 60 },
                    carbs: { kcal: 160, protein: 3, carbs: 35, fat: 1, sodium: 10 },
                    veggies: { kcal: 30, protein: 2, carbs: 5, fat: 0.3, sodium: 20 },
                    seasonings: { kcal: 100, protein: 2, carbs: 15, fat: 2, sodium: 400 }
                };
                // 優先使用 AI Vision 辨識填入的 per100g 數據，否則才使用分類預設值
                let per100g = (addForm.value.per100g && (addForm.value.per100g.kcal > 0 || addForm.value.per100g.fat > 0 || addForm.value.per100g.protein > 0 || addForm.value.per100g.carbs > 0))
                    ? { ...addForm.value.per100g }
                    : (categoryDefaults[addForm.value.category] || { kcal: 150, protein: 10, carbs: 15, fat: 5, sodium: 50 });
                
                // 特定常見食材精準預設 (如花生醬)
                if (name.includes('花生醬') && (!addForm.value.per100g || addForm.value.per100g.kcal === 150)) {
                    per100g = { kcal: 594, protein: 21.9, carbs: 18.8, fat: 50, sodium: 312 };
                }

                const newIng = {
                    id: newId,
                    name: name,
                    category: addForm.value.category,
                    storageZones: [...(addForm.value.storageZones || [addForm.value.storageZone || 'fridge'])],
                    storageZone: addForm.value.storageZone || 'fridge',
                    unitLabel: addForm.value.unitLabel,
                    servingSize: Number(addForm.value.servingSize) || 10,
                    servingUnit: addForm.value.servingUnit || 'g',
                    perServing: { ...(addForm.value.perServing || {}) },
                    per100g: per100g
                };
                if (!engine.data.rawIngredients[addForm.value.category]) {
                    engine.data.rawIngredients[addForm.value.category] = [];
                }
                engine.data.rawIngredients[addForm.value.category].push(newIng);
                engine.data.ingredients.push(newIng);
                try {
                    const customKey = 'kitchen_v2_custom_ingredients';
                    const customList = JSON.parse(localStorage.getItem(customKey) || '[]');
                    if (!customList.some(i => i.id === newId)) {
                        customList.push(newIng);
                        localStorage.setItem(customKey, JSON.stringify(customList));
                    }
                } catch (e) {}
                await engine.saveJson('ingredients.json', engine.data.rawIngredients);
                await engine.toggleStock(newId, true);
                const zoneLabels = newIng.storageZones.map(z => zoneNames[z] || z).join('、');
                alert(`🎉 成功新增食材【${name}】至 ${zoneLabels}！`);
            } else {
                const newId = 'supp_' + Date.now();
                const newSup = {
                    id: newId,
                    name: name,
                    brand: addForm.value.brand || '',
                    price: Number(addForm.value.price) || 0,
                    priceUnit: addForm.value.unitLabel || '1包',
                    store: addForm.value.store || '全聯'
                };
                if (!engine.data.householdSupplies.supplies) engine.data.householdSupplies.supplies = [];
                engine.data.householdSupplies.supplies.push(newSup);
                await engine.saveJson('household_supplies.json', engine.data.householdSupplies);
                await engine.toggleSupplyStock(newId, true);
                alert(`🎉 成功新增雜項【${name}】！`);
            }
            showAddModal.value = false;
        };

        // Camera & AI Vision state & Config API Key
        const cameraInputRef = ref(null);
        const albumInputRef = ref(null);
        const capturedPhotoUrl = ref('');
        const isAiAnalyzing = ref(false);
        const aiScanStatus = ref('idle'); // 'idle' | 'analyzing' | 'success' | 'error'
        const aiStatusMessage = ref('');
        const geminiApiKeyInput = ref('');
        const showApiKeyInput = ref(false);
        const savedApiKey = ref('');
        const debugHistory = ref([]);

        const copyDebugReport = () => {
            const report = {
                timestamp: new Date().toISOString(),
                apiKeyPrefix: (savedApiKey.value || '').slice(0, 8),
                apiKeyLength: (savedApiKey.value || '').length,
                logs: debugHistory.value
            };
            const text = JSON.stringify(report, null, 2);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('📋 已成功複製詳細除錯報告！請直接貼入對話框發送給十一粒。');
                }).catch(() => {
                    prompt('請複製以下除錯日誌：', text);
                });
            } else {
                prompt('請複製以下除錯日誌：', text);
            }
        };

        // 初始化讀取本地 API Key
        const refreshSavedApiKey = () => {
            let key = (
                savedApiKey.value ||
                engine.data?.config?.gemini_api_key ||
                localStorage.getItem('kitchen_v2_gemini_api_key') ||
                localStorage.getItem('gemini_api_key') ||
                ''
            ).trim();
            // 排除舊版無效測試金鑰
            if (key === 'AIzaSyBasMvp1ztbHtoGF1vNamSkhGoVuRxwMZQ') {
                key = '';
                geminiApiKeyInput.value = '';
            }
            savedApiKey.value = key;
            if (key && !geminiApiKeyInput.value) {
                geminiApiKeyInput.value = key;
            }
            return key;
        };

        // 立即執行一次初始化
        refreshSavedApiKey();

        const hasValidKey = computed(() => {
            const k = (savedApiKey.value || '').trim();
            return !!k && k.length >= 15 && k !== 'AIzaSyBasMvp1ztbHtoGF1vNamSkhGoVuRxwMZQ';
        });

        const saveApiKey = async () => {
            const key = (geminiApiKeyInput.value || '').trim();
            if (!key || key.length < 15) {
                alert('請貼上有效的 Gemini API Key！');
                return;
            }
            if (key === 'AIzaSyBasMvp1ztbHtoGF1vNamSkhGoVuRxwMZQ') {
                alert('⚠️ 這是舊版已失效的測試金鑰！\n請貼上您在 Google AI Studio 剛剛建立的全新金鑰 (以 AQ. 或 AIza... 開頭)。');
                return;
            }
            if (!engine.data.config) engine.data.config = {};
            engine.data.config.gemini_api_key = key;
            savedApiKey.value = key;
            localStorage.setItem('kitchen_v2_gemini_api_key', key);
            localStorage.setItem('gemini_api_key', key);
            localStorage.setItem('kitchen_v2_config.json', JSON.stringify(engine.data.config));
            await engine.saveJson('config.json', engine.data.config);
            showApiKeyInput.value = false;

            // 🚀 若畫面上已有照片，立刻自動觸發辨識！
            if (capturedPhotoUrl.value) {
                await analyzePhotoDirectly(capturedPhotoUrl.value, key);
            } else {
                alert(`🎉 成功啟用 API Key (${key.slice(0, 6)}...${key.slice(-4)})！系統 AI 圖片辨識已開啟！`);
            }
        };

        const cancelAiAnalyzing = () => {
            isAiAnalyzing.value = false;
            aiScanStatus.value = 'error';
            aiStatusMessage.value = '已取消 AI 辨識等待，請直接在下方手動填寫名稱與營養數值。';
            if (!addForm.value.per100g) {
                addForm.value.per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
            }
            if (!addForm.value.perServing) {
                addForm.value.perServing = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
            }
        };

        const closeAddModal = () => {
            showAddModal.value = false;
            capturedPhotoUrl.value = '';
            isAiAnalyzing.value = false;
            aiScanStatus.value = 'idle';
            aiStatusMessage.value = '';
        };

        const triggerCamera = () => {
            if (cameraInputRef.value) {
                cameraInputRef.value.click();
            }
        };

        const triggerAlbum = () => {
            if (albumInputRef.value) {
                albumInputRef.value.click();
            }
        };

        const openAddModalDirectly = () => {
            capturedPhotoUrl.value = '';
            isAiAnalyzing.value = false;
            aiScanStatus.value = 'idle';
            aiStatusMessage.value = '';
            showAddModal.value = true;
        };

        const compressImage = (dataUrl, maxWidth = 800, maxHeight = 800, quality = 0.8) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth || height > maxHeight) {
                        if (width / height > maxWidth / maxHeight) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            });
        };

        const onServingInput = () => {
            const size = Number(addForm.value.servingSize) || 10;
            const ratio = 100 / size;
            const ps = addForm.value.perServing || {};
            addForm.value.per100g = {
                kcal: Math.round((ps.kcal || 0) * ratio * 10) / 10,
                protein: Math.round((ps.protein || 0) * ratio * 10) / 10,
                carbs: Math.round((ps.carbs || 0) * ratio * 10) / 10,
                fat: Math.round((ps.fat || 0) * ratio * 10) / 10,
                sodium: Math.round((ps.sodium || 0) * ratio * 10) / 10
            };
        };

        const on100gInput = () => {
            const size = Number(addForm.value.servingSize) || 10;
            const ratio = size / 100;
            const p100 = addForm.value.per100g || {};
            addForm.value.perServing = {
                kcal: Math.round((p100.kcal || 0) * ratio * 10) / 10,
                protein: Math.round((p100.protein || 0) * ratio * 10) / 10,
                carbs: Math.round((p100.carbs || 0) * ratio * 10) / 10,
                fat: Math.round((p100.fat || 0) * ratio * 10) / 10,
                sodium: Math.round((p100.sodium || 0) * ratio * 10) / 10
            };
        };

        // 🤖 純前端直連 Google Gemini Vision API (靜態託管/手機直連保證可用)
        const callClientGeminiNutritionOCR = async (dataUrl, apiKey) => {
            if (!apiKey || apiKey.length < 15) {
                return {
                    status: 'invalid_key',
                    message: '未設定有效 Gemini API Key'
                };
            }

            const cleanB64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            let mimeType = 'image/jpeg';
            if (dataUrl.startsWith('data:image/png')) mimeType = 'image/png';
            else if (dataUrl.startsWith('data:image/webp')) mimeType = 'image/webp';

            const prompt = `你是一位極度嚴謹的專業營養師與食品標籤 OCR 辨識專家。
請仔細閱讀這張食品包裝照片上的營養標示 (Nutrition Facts) 或成分標籤，提取『食品名稱』、『單份克數 (servingSize)』、以及『每份 (perServing)』與『每 100g (per100g)』的雙軌營養數據。

【關鍵提取與換算指令 - 務必嚴格執行】：
1. 請讀取『每一份量 (Serving Size)』為多少克或毫升 (例如 10g, 15mL, 1包)，記為 servingSize 與 servingUnit。
2. 如果照片上有『每份 (Per Serving)』數值，請直接讀取填入 perServing。
3. 如果照片上有『每 100g / 100mL』數值，請直接讀取填入 per100g。
4. 如果照片上『只有每份』或『只有每 100g』，請自動按比例換算補齊另一欄的數據！
5. category 請依據屬性選填：proteins (蛋白質), carbs (澱粉/主食), veggies (蔬菜水果), sauces (醬料/油脂/調味), drinks (咖啡/茶包/沖泡飲品) 之一。
6. 請嚴格只輸出純 JSON，不可包含 markdown codeblock 標籤：
{
  "name": "精準品名",
  "category": "seasonings",
  "servingSize": 16,
  "servingUnit": "ml",
  "perServing": {
    "kcal": 20,
    "protein": 0.3,
    "carbs": 4.6,
    "fat": 0,
    "sodium": 18
  },
  "per100g": {
    "kcal": 124,
    "protein": 1.9,
    "carbs": 28.7,
    "fat": 0,
    "sodium": 110
  }
}`;

            const payload = {
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: cleanB64
                            }
                        }
                    ]
                }]
            };

            const attempts = [
                // 1. Google 2026 最新官方主力模型 (Google 回應指定)：gemini-3.6-flash
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-pro:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', useHeader: true, useQuery: false },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', useHeader: true, useQuery: false }
            ];

            let lastError = '';
            debugHistory.value = [];

            for (const att of attempts) {
                const fetchUrl = att.useQuery ? `${att.url}?key=${encodeURIComponent(apiKey)}` : att.url;
                const headers = { 'Content-Type': 'application/json' };
                if (att.useHeader) {
                    headers['x-goog-api-key'] = apiKey;
                }

                try {
                    const resp = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(payload)
                    });

                    const rawResponseText = await resp.text();
                    let resData = null;
                    try {
                        resData = JSON.parse(rawResponseText);
                    } catch (e) {}

                    debugHistory.value.push({
                        url: att.url,
                        useHeader: att.useHeader,
                        useQuery: att.useQuery,
                        status: resp.status,
                        statusText: resp.statusText,
                        responsePreview: rawResponseText.slice(0, 300)
                    });

                    if (resp.ok && resData) {
                        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        let cleanJson = rawText;
                        if (cleanJson.startsWith('```')) {
                            cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
                        }
                        const parsed = JSON.parse(cleanJson);
                        return { status: 'success', result: parsed };
                    } else {
                        const errMsg = resData?.error?.message || resp.statusText || rawResponseText.slice(0, 150);
                        lastError = `HTTP ${resp.status}: ${errMsg}`;
                        if (resp.status === 400 || resp.status === 403) {
                            if (errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('permission')) {
                                return {
                                    status: 'invalid_key',
                                    message: `Gemini API Key 驗證未通過 (${errMsg})`
                                };
                            }
                        }
                    }
                } catch (e) {
                    lastError = e.message || String(e);
                    debugHistory.value.push({
                        url: att.url,
                        error: lastError
                    });
                }
            }

            if (lastError.includes('429') || lastError.includes('RESOURCE_EXHAUSTED')) {
                return {
                    status: 'rate_limit_429',
                    message: 'Google API 免費額度每分鐘頻率限制，請稍候 10 秒後再次嘗試'
                };
            }

            return {
                status: 'error',
                message: `Gemini API 連線辨識未完成 (${lastError})`
            };
        };

        const analyzePhotoDirectly = async (compressedDataUrl, apiKey, fileName = '') => {
            isAiAnalyzing.value = true;
            aiScanStatus.value = 'analyzing';
            aiStatusMessage.value = '正在讀取標籤與換算 100g 數據，請稍候 3~5 秒...';

            let data = null;

            // 1. 優先嘗試本機後端 (若有 Python server 運行)
            try {
                const res = await fetch('/api/analyze-nutrition-photo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: compressedDataUrl, client_api_key: apiKey })
                });
                if (res.ok) {
                    data = await res.json();
                }
            } catch (err) {
                // 靜態環境無後端，忽略並轉為前端直連
            }

            // 2. 本地後端無回應時，使用前端直連 Gemini Vision API
            if (!data || data.status !== 'success') {
                if (!apiKey) {
                    data = {
                        status: 'need_api_key',
                        message: '未設定 Gemini API Key，請點擊「設定 Key」輸入金鑰，或直接手動填寫。'
                    };
                } else {
                    data = await callClientGeminiNutritionOCR(compressedDataUrl, apiKey);
                }
            }

            isAiAnalyzing.value = false;

            if (data && data.status === 'success' && data.result) {
                const resData = data.result;
                if (resData.name) addForm.value.name = resData.name;
                if (resData.category) addForm.value.category = resData.category;
                
                if (resData.servingSize) addForm.value.servingSize = Number(resData.servingSize) || 10;
                if (resData.servingUnit) addForm.value.servingUnit = resData.servingUnit || 'g';

                if (resData.per100g) {
                    addForm.value.per100g = {
                        kcal: Number(resData.per100g.kcal) || 0,
                        protein: Number(resData.per100g.protein) || 0,
                        carbs: Number(resData.per100g.carbs) || 0,
                        fat: Number(resData.per100g.fat) || 0,
                        sodium: Number(resData.per100g.sodium) || 0
                    };
                }

                if (resData.perServing) {
                    addForm.value.perServing = {
                        kcal: Number(resData.perServing.kcal) || 0,
                        protein: Number(resData.perServing.protein) || 0,
                        carbs: Number(resData.perServing.carbs) || 0,
                        fat: Number(resData.perServing.fat) || 0,
                        sodium: Number(resData.perServing.sodium) || 0
                    };
                } else {
                    on100gInput();
                }

                if (['sauces', 'oils', 'seasonings', 'drinks'].includes(resData.category)) {
                    addFormDisplayBasis.value = 'serving';
                } else {
                    addFormDisplayBasis.value = '100g';
                }

                aiScanStatus.value = 'success';
                aiStatusMessage.value = `已為您自動帶入品名【${resData.name || '食材'}】與營養成份，可手動微調。`;
            } else {
                aiScanStatus.value = 'error';
                const errMsg = data?.message || 'AI 辨識未完成';
                aiStatusMessage.value = `${errMsg}，請直接在下方手動填寫品名與成分。`;

                if (data?.status === 'need_api_key' || data?.status === 'invalid_key') {
                    showApiKeyInput.value = true;
                }

                if (fileName && !['image', 'photo', 'camera', 'IMG', 'DCIM'].some(k => fileName.includes(k))) {
                    if (!addForm.value.name) addForm.value.name = fileName;
                }
            }
        };

        const handleCameraSnap = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                showAddModal.value = true;
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawDataUrl = e.target.result;
                    const compressedDataUrl = await compressImage(rawDataUrl, 800, 800, 0.8);
                    capturedPhotoUrl.value = compressedDataUrl;

                    const apiKey = refreshSavedApiKey();
                    const fileName = file.name ? file.name.split('.')[0].replace(/[-_]/g, ' ') : '';
                    await analyzePhotoDirectly(compressedDataUrl, apiKey, fileName);
                };
                reader.readAsDataURL(file);
                event.target.value = '';
            }
        };

        // Food Detail Modal State & Long Press Handlers (750ms heavy hold + anti-drag touchmove)
        let foodPressTimer = null;
        let foodTouchStartX = 0;
        let foodTouchStartY = 0;
        let isFoodLongPress = false;

        const startFoodPress = (ing, event) => {
            isFoodLongPress = false;
            if (event && event.type === 'touchstart' && event.touches && event.touches[0]) {
                foodTouchStartX = event.touches[0].clientX;
                foodTouchStartY = event.touches[0].clientY;
            }
            if (foodPressTimer) clearTimeout(foodPressTimer);
            foodPressTimer = setTimeout(() => {
                isFoodLongPress = true;
                if (navigator.vibrate) navigator.vibrate(40);
                openFoodDetail(ing);
            }, 750); // 750ms 需按壓一段時間，製造真實「重力感」長按，防誤觸
        };

        const handleFoodTouchMove = (event) => {
            if (!foodPressTimer) return;
            if (event.touches && event.touches[0]) {
                const moveX = Math.abs(event.touches[0].clientX - foodTouchStartX);
                const moveY = Math.abs(event.touches[0].clientY - foodTouchStartY);
                // 手指滑動超過 6px 即判定為滑動螢幕，立刻取消長按！
                if (moveX > 6 || moveY > 6) {
                    cancelFoodPress();
                }
            }
        };

        const cancelFoodPress = () => {
            if (foodPressTimer) {
                clearTimeout(foodPressTimer);
                foodPressTimer = null;
            }
        };

        const openFoodDetail = (ing) => {
            selectedFood.value = ing;
            showFoodDetailModal.value = true;
        };

        const handleFoodLeftClick = (ing) => {
            if (foodPressTimer) clearTimeout(foodPressTimer);
            if (!isFoodLongPress) {
                toggleFoodStock(ing.id);
            }
            isFoodLongPress = false;
        };

        const saveFoodChanges = async (ing) => {
            if (!ing) return;
            const cat = ing.category || 'proteins';
            if (engine.data.rawIngredients && engine.data.rawIngredients[cat]) {
                const idx = engine.data.rawIngredients[cat].findIndex(item => item.id === ing.id);
                if (idx !== -1) {
                    engine.data.rawIngredients[cat][idx] = { ...engine.data.rawIngredients[cat][idx], ...ing };
                    await engine.saveJson('ingredients.json', engine.data.rawIngredients);
                }
            }
        };

        const saveAndCloseFoodModal = async (ing) => {
            await saveFoodChanges(ing);
            showFoodDetailModal.value = false;
        };

        const toggleStockInFoodModal = async (ingId) => {
            const current = checkFoodStock(ingId);
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
            await saveFoodChanges(ing);
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
            await saveFoodChanges(ing);
        };

        const deleteFoodIngredient = async (ingId) => {
            if (confirm('確定要永久刪除這個食材嗎？')) {
                await engine.deleteIngredient(ingId);
                showFoodDetailModal.value = false;
            }
        };

        const scrollToSection = (sectionId) => {
            const el = document.getElementById(sectionId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        const updateSupplyPhoto = () => {
            triggerCamera();
        };

        return {
            engine,
            supplies,
            scrollToSection,
            showShoppingModal,
            showSupplyModal,
            showAddModal,
            showFoodDetailModal,
            selectedFood,
            saveFoodChanges,
            saveAndCloseFoodModal,
            toggleStockInFoodModal,
            isFoodZoneSelected,
            toggleFoodStorageZone,
            isStoreSelected,
            togglePreferredStore,
            deleteFoodIngredient,
            startFoodPress,
            handleFoodTouchMove,
            cancelFoodPress,
            openFoodDetail,
            handleFoodLeftClick,
            shoppingStoreFilter,
            selectedSupply,
            addForm,
            addFormDisplayBasis,
            onServingInput,
            on100gInput,
            isAddFormZoneSelected,
            toggleAddFormZone,
            shoppingList,
            filteredFoodShopping,
            filteredSupplyShopping,
            cameraInputRef,
            albumInputRef,
            capturedPhotoUrl,
            isAiAnalyzing,
            aiScanStatus,
            aiStatusMessage,
            geminiApiKeyInput,
            showApiKeyInput,
            savedApiKey,
            hasValidKey,
            saveApiKey,
            debugHistory,
            copyDebugReport,
            cancelAiAnalyzing,
            closeAddModal,
            triggerCamera,
            triggerAlbum,
            openAddModalDirectly,
            handleCameraSnap,
            getCategoryInZone,
            checkFoodStock,
            checkSupplyStock,
            isInCart,
            toggleFoodStock,
            toggleSupplyStock,
            toggleFoodCart,
            toggleSupplyCart,
            startPress,
            handleSupplyTouchMove,
            cancelPress,
            openSupplyDetail,
            toggleItemPurchased,
            deleteShoppingItem,
            clearPurchased,
            copyShoppingListText,
            copyLineMessage,
            deleteSupplyItem,
            updateSupplyPhoto,
            getItemStores,
            getItemStoreLabel,
            getItemStore,
            updateItemStore,
            getStoreShoppingCount,
            lastStoreAction,
            undoLastStoreAction,
            toggleStoreForItem,
            activeStorePickerItemId,
            availableStores,
            toggleStorePicker,
            saveNewItem
        };
    },
    template: `
        <div class="view-pantry" style="padding-bottom: 90px;">
            <!-- 01 PANTRY STOCK 冰箱食材庫存狀態 (黃金畫面 100% 呈現庫存) -->
            <div class="section-title" style="margin-bottom: 20px;">
                01 PANTRY STOCK 冰箱食材庫存狀態
            </div>

            <!-- 右側浮動快捷錨點選單 (Floating Right-Side Anchor Quick Nav) -->
            <div class="floating-quick-nav" style="position: fixed; right: 10px; top: 42%; transform: translateY(-50%); z-index: 99; display: flex; flex-direction: column; gap: 6px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); padding: 8px 6px; border-radius: 16px; border: 1.5px solid var(--color-border); box-shadow: 0 4px 14px rgba(0,0,0,0.08);">
                <button @click="scrollToSection('zone-fridge')" style="border: none; background: transparent; padding: 6px 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: var(--color-text-main);">
                    冷藏
                </button>
                <button @click="scrollToSection('zone-freezer')" style="border: none; background: transparent; padding: 6px 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: var(--color-text-main);">
                    冷凍
                </button>
                <button @click="scrollToSection('zone-pantry')" style="border: none; background: transparent; padding: 6px 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: var(--color-text-main);">
                    常溫
                </button>
                <button @click="scrollToSection('zone-supplies')" style="border: none; background: transparent; padding: 6px 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: var(--color-text-main);">
                    雜項
                </button>
            </div>

            <!-- 【冷藏區】 (Fridge Zone) -->
            <div id="zone-fridge" class="card" style="margin-bottom: 20px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 14px; color: var(--color-text-main);">
                    【冷藏區】 (Fridge Zone)
                </h3>

                <!-- 1. 蛋白質類 -->
                <div v-if="getCategoryInZone('fridge', 'proteins').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">1. 蛋白質類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'proteins')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 2. 蔬菜水果 -->
                <div v-if="getCategoryInZone('fridge', 'veggies').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">2. 蔬菜水果</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'veggies')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 3. 碳水類 -->
                <div v-if="getCategoryInZone('fridge', 'carbs').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">3. 碳水類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'carbs')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 4. 醬料調味 -->
                <div v-if="getCategoryInZone('fridge', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 醬料與油脂</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'sauces')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 飲品與沖泡 -->
                <div v-if="getCategoryInZone('fridge', 'drinks').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 飲品與沖泡</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'drinks')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 油脂類 -->
                <div v-if="getCategoryInZone('fridge', 'fats').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 油脂類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('fridge', 'fats')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>

            <!-- 【冷凍區】 (Freezer Zone) -->
            <div id="zone-freezer" class="card" style="margin-bottom: 20px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 14px; color: var(--color-text-main);">
                    【冷凍區】 (Freezer Zone)
                </h3>

                <!-- 1. 蛋白質類 -->
                <div v-if="getCategoryInZone('freezer', 'proteins').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">1. 蛋白質類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'proteins')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 2. 蔬菜水果 -->
                <div v-if="getCategoryInZone('freezer', 'veggies').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">2. 蔬菜水果</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'veggies')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 3. 碳水類 -->
                <div v-if="getCategoryInZone('freezer', 'carbs').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">3. 碳水類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'carbs')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 4. 醬料調味 -->
                <div v-if="getCategoryInZone('freezer', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 醬料與油脂</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'sauces')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 飲品與沖泡 -->
                <div v-if="getCategoryInZone('freezer', 'drinks').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 飲品與冰品</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'drinks')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 油脂類 -->
                <div v-if="getCategoryInZone('freezer', 'fats').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 油脂類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('freezer', 'fats')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>

            <!-- 【常溫區】 (Pantry Zone) -->
            <div id="zone-pantry" class="card" style="margin-bottom: 20px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 14px; color: var(--color-text-main);">
                    【常溫區】 (Pantry Zone)
                </h3>

                <!-- 1. 蛋白質類 -->
                <div v-if="getCategoryInZone('pantry', 'proteins').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">1. 蛋白質類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'proteins')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 2. 蔬菜水果 -->
                <div v-if="getCategoryInZone('pantry', 'veggies').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">2. 蔬菜水果</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'veggies')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 3. 碳水類 -->
                <div v-if="getCategoryInZone('pantry', 'carbs').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">3. 碳水類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'carbs')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 4. 醬料調味 -->
                <div v-if="getCategoryInZone('pantry', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 醬料與油脂</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'sauces')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 飲品與沖泡 -->
                <div v-if="getCategoryInZone('pantry', 'drinks').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 飲品與沖泡</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'drinks')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- 5. 油脂類 -->
                <div v-if="getCategoryInZone('pantry', 'fats').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">5. 油脂類</div>
                    <div class="capsule-group">
                        <template v-for="ing in getCategoryInZone('pantry', 'fats')" :key="ing.id">
                            <div class="split-capsule" :class="checkFoodStock(ing.id) ? 'in-stock-bg' : 'out-stock-bg'">
                                <div class="split-left" :class="checkFoodStock(ing.id) ? 'in-stock' : 'out-stock'" style="cursor: pointer; user-select: none;" @mousedown="startFoodPress(ing, $event)" @mouseup="cancelFoodPress" @mouseleave="cancelFoodPress" @touchstart="startFoodPress(ing, $event)" @touchmove="handleFoodTouchMove($event)" @touchend="cancelFoodPress" @touchcancel="cancelFoodPress" @click="handleFoodLeftClick(ing)">
                                    <span>{{ ing.name }}</span>
                                </div>
                                <div class="split-divider"></div>
                                <div class="split-right" @click="toggleFoodCart(ing)">
                                    <span v-if="!isInCart(ing.id)" class="cart-icon-default" title="加入採買清單">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                    <span v-else class="cart-icon-selected" title="已在採買清單">
                                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="21" r="1"></circle>
                                            <circle cx="20" cy="21" r="1"></circle>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                        </svg>
                                    </span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>

            <!-- 【生活雜項區】 (Household Supplies Zone - 非食品) -->
            <div id="zone-supplies" class="card" style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <h3 style="font-size: 1.1rem; margin: 0; color: var(--color-text-main);">
                        【生活雜項區】 (非食品)
                    </h3>
                </div>

                <div class="capsule-group">
                    <template v-for="sup in supplies" :key="sup.id">
                        <div class="split-capsule" :class="checkSupplyStock(sup.id) ? 'in-stock-bg' : 'out-stock-bg'">
                            <div class="split-left" :class="checkSupplyStock(sup.id) ? 'in-stock' : 'out-stock'"
                                 @mousedown="startPress(sup, $event)" @mouseup="cancelPress" @mouseleave="cancelPress"
                                 @touchstart="startPress(sup, $event)" @touchmove="handleSupplyTouchMove($event)" @touchend="cancelPress" @touchcancel="cancelPress"
                                 @click="toggleSupplyStock(sup.id)">
                                <span>{{ sup.name }}</span>
                            </div>
                            <div class="split-divider"></div>
                            <div class="split-right" @click="toggleSupplyCart(sup)">
                                <span v-if="!isInCart(sup.id)" class="cart-icon-default" title="加入採買清單">
                                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="9" cy="21" r="1"></circle>
                                        <circle cx="20" cy="21" r="1"></circle>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                    </svg>
                                </span>
                                <span v-else class="cart-icon-selected" title="已在採買清單">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="9" cy="21" r="1"></circle>
                                        <circle cx="20" cy="21" r="1"></circle>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                    </svg>
                                </span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <!-- 隱藏原生手機相機與相簿 input (支援 iPhone/Android 實拍) -->
            <input type="file" accept="image/*" capture="environment" ref="cameraInputRef" style="display:none;" @change="handleCameraSnap">
            <input type="file" accept="image/*" ref="albumInputRef" style="display:none;" @change="handleCameraSnap">

            <!-- 手機畫面最底部固定常駐雙控制鈕 -->
            <div class="fab-container">
                <button class="btn-primary" @click="showShoppingModal = true" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <span>採買清單</span>
                </button>
                <button class="btn-primary accent" @click="openAddModalDirectly" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>新增食材</span>
                </button>
            </div>

            <!-- 📱 畫面 B：【滿版獨立全螢幕採買視窗】(點擊 🛒 賣場採買清單 入場) -->
            <div v-if="showShoppingModal" class="modal-overlay" @click.self="showShoppingModal = false">
                <div class="drawer-content" style="max-height: 94vh; padding: 20px 20px 36px 20px;">
                    <!-- Top Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 1.1rem; color: var(--color-text-main);">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            </svg>
                            <span>賣場待採買 CheckList</span>
                        </div>
                        <button class="btn-icon" @click="showShoppingModal = false" style="border: none; font-size: 1.1rem;">✕</button>
                    </div>

                    <!-- 1. 🏬 賣場過濾 Filter 膠囊 (支援品項計數) -->
                    <div style="display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap;">
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'all' }" @click="shoppingStoreFilter = 'all'">
                            All 全部 ({{ getStoreShoppingCount('all') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '全聯' }" @click="shoppingStoreFilter = '全聯'">
                            全聯 ({{ getStoreShoppingCount('全聯') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'Costco' }" @click="shoppingStoreFilter = 'Costco'">
                            Costco ({{ getStoreShoppingCount('Costco') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '義美' }" @click="shoppingStoreFilter = '義美'">
                            義美 ({{ getStoreShoppingCount('義美') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'EC 電商' }" @click="shoppingStoreFilter = 'EC 電商'">
                            EC 電商 ({{ getStoreShoppingCount('EC 電商') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '傳統市場' }" @click="shoppingStoreFilter = '傳統市場'">
                            傳統市場 ({{ getStoreShoppingCount('傳統市場') }})
                        </button>
                        <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '其他' }" @click="shoppingStoreFilter = '其他'">
                            其他 ({{ getStoreShoppingCount('其他') }})
                        </button>
                    </div>

                    <!-- Empty State for All or Filtered Stores -->
                    <div v-if="filteredFoodShopping.length === 0 && filteredSupplyShopping.length === 0" 
                         style="text-align: center; padding: 40px 16px; color: var(--color-text-muted);">
                        🎉 目前在【{{ shoppingStoreFilter === 'all' ? '全部賣場' : shoppingStoreFilter }}】沒有待買項目！<br>
                        <span style="font-size: 0.8rem; color: #9CA3AF; margin-top: 6px; display: inline-block;">
                            在第一頁或第三頁點擊無庫存膠囊 🛒 即可加入待買清單。
                        </span>
                    </div>

                    <div v-else style="max-height: 55vh; overflow-y: auto; margin-bottom: 20px;">
                        <!-- 全域通路變更 ＆ 復原通知條 (無論在哪個分頁、就算卡片移走依然常駐) -->
                        <div v-if="lastStoreAction" 
                             style="display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; margin-bottom: 14px; background: #FEF3C7; border: 1.5px solid #FDE68A; border-radius: 10px; font-size: 0.82rem; color: #92400E; box-shadow: 0 2px 8px rgba(0,0,0,0.04); gap: 8px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                    <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                <span style="line-height: 1.35; overflow: hidden; text-overflow: ellipsis;">
                                    <b>【{{ lastStoreAction.itemName }}】</b>通路已改為【{{ lastStoreAction.newStoreLabel }}】
                                </span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <button class="btn-icon" @click.stop="undoLastStoreAction" 
                                        style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.78rem; font-weight: 700; background: #FFFFFF; border: 1.2px solid #F59E0B; border-radius: 6px; color: #B45309; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="1 4 1 10 7 10"></polyline>
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                                    </svg>
                                    <span>立即復原</span>
                                </button>
                                <button class="btn-icon" @click="lastStoreAction = null" 
                                        title="關閉提示"
                                        style="width: 22px; height: 22px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: #B45309; cursor: pointer; border-radius: 4px;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <!-- 【食材類】 -->
                        <div v-if="filteredFoodShopping.length > 0" style="margin-bottom: 18px;">
                            <div style="font-size: 0.9rem; font-weight: 700; margin-bottom: 8px; color: var(--color-text-main);">
                                【食材類】：
                            </div>
                            <div v-for="item in filteredFoodShopping" :key="item.id" style="margin-bottom: 8px;">
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FAF8F5; border-radius: 10px;">
                                        <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" @click="toggleItemPurchased(item.id)">
                                            <input type="checkbox" :checked="item.isPurchased" style="width: 18px; height: 18px; cursor: pointer;">
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <span :style="{ textDecoration: item.isPurchased ? 'line-through' : 'none', color: item.isPurchased ? '#9CA3AF' : 'var(--color-text-main)', fontWeight: 600 }">
                                                    {{ item.name }}
                                                </span>
                                                <span v-if="shoppingStoreFilter === 'all'" style="font-size: 0.72rem; color: #4B5563; background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                                                    {{ getItemStoreLabel(item) }}
                                                </span>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <!-- 遮陽棚小店通用 SVG 圖示按鈕 (點擊開關通路選擇器) -->
                                            <button class="btn-icon" @click.stop="toggleStorePicker(item.id)" 
                                                    :title="'設定通路：' + getItemStoreLabel(item) + '（支援複選）'" 
                                                    :style="{
                                                        width: '32px',
                                                        height: '32px',
                                                        padding: '0',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: activeStorePickerItemId === item.id ? 'var(--color-primary)' : 'var(--color-text-main)',
                                                        cursor: 'pointer'
                                                    }">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M3 3h18v6H3z"></path>
                                                    <path d="M3 9c1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0"></path>
                                                    <path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"></path>
                                                    <path d="M10 22v-6h4v6"></path>
                                                </svg>
                                            </button>
                                            <button class="btn-icon" @click="deleteShoppingItem(item.id)" title="刪除項目" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #EF4444; cursor: pointer; border-radius: 8px;">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- 點擊展開的複選通路選擇列 -->
                                    <div v-if="activeStorePickerItemId === item.id" style="background: #FFFFFF; border: 1.5px solid var(--color-primary); border-radius: 10px; padding: 10px 12px; margin-top: 4px; margin-bottom: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                                        <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                                            <span>📍 勾選採買通路（支援複選，跨店同步）：</span>
                                            <span style="cursor: pointer; color: #9CA3AF; padding: 0 4px;" @click="activeStorePickerItemId = null">✕ 關閉</span>
                                        </div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                            <button v-for="store in availableStores" :key="store"
                                                    class="btn-icon"
                                                    :style="{
                                                        padding: '5px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        background: getItemStores(item).includes(store) ? 'var(--color-primary)' : '#F3F4F6',
                                                        color: getItemStores(item).includes(store) ? '#FFFFFF' : '#374151',
                                                        border: getItemStores(item).includes(store) ? '1px solid var(--color-primary)' : '1px solid #E5E7EB',
                                                        cursor: 'pointer'
                                                    }"
                                                    @click="toggleStoreForItem(item, store)">
                                                <span v-if="getItemStores(item).includes(store)">✓ </span>{{ store }}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 【生活雜項類】 -->
                        <div v-if="filteredSupplyShopping.length > 0">
                            <div style="font-size: 0.9rem; font-weight: 700; margin-bottom: 8px; color: var(--color-text-main);">
                                【生活雜項類】：
                            </div>
                            <div v-for="item in filteredSupplyShopping" :key="item.id" style="margin-bottom: 8px;">
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FAF8F5; border-radius: 10px;">
                                        <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" @click="toggleItemPurchased(item.id)">
                                            <input type="checkbox" :checked="item.isPurchased" style="width: 18px; height: 18px; cursor: pointer;">
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <span :style="{ textDecoration: item.isPurchased ? 'line-through' : 'none', color: item.isPurchased ? '#9CA3AF' : 'var(--color-text-main)', fontWeight: 600 }">
                                                    {{ item.name }}
                                                </span>
                                                <span v-if="shoppingStoreFilter === 'all'" style="font-size: 0.72rem; color: #4B5563; background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                                                    {{ getItemStoreLabel(item) }}
                                                </span>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <button class="btn-icon" @click.stop="toggleStorePicker(item.id)" 
                                                    :title="'設定通路：' + getItemStoreLabel(item) + '（支援複選）'" 
                                                    :style="{
                                                        width: '32px',
                                                        height: '32px',
                                                        padding: '0',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: activeStorePickerItemId === item.id ? 'var(--color-primary)' : 'var(--color-text-main)',
                                                        cursor: 'pointer'
                                                    }">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M3 3h18v6H3z"></path>
                                                    <path d="M3 9c1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0"></path>
                                                    <path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"></path>
                                                    <path d="M10 22v-6h4v6"></path>
                                                </svg>
                                            </button>
                                            <button class="btn-icon" @click="deleteShoppingItem(item.id)" title="刪除項目" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #EF4444; cursor: pointer; border-radius: 8px;">
                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- 點擊展開的複選通路選擇列 -->
                                    <div v-if="activeStorePickerItemId === item.id" style="background: #FFFFFF; border: 1.5px solid var(--color-primary); border-radius: 10px; padding: 10px 12px; margin-top: 4px; margin-bottom: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                                        <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                                            <span>📍 勾選採買通路（支援複選，跨店同步）：</span>
                                            <span style="cursor: pointer; color: #9CA3AF; padding: 0 4px;" @click="activeStorePickerItemId = null">✕ 關閉</span>
                                        </div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                            <button v-for="store in availableStores" :key="store"
                                                    class="btn-icon"
                                                    :style="{
                                                        padding: '5px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        background: getItemStores(item).includes(store) ? 'var(--color-primary)' : '#F3F4F6',
                                                        color: getItemStores(item).includes(store) ? '#FFFFFF' : '#374151',
                                                        border: getItemStores(item).includes(store) ? '1px solid var(--color-primary)' : '1px solid #E5E7EB',
                                                        cursor: 'pointer'
                                                    }"
                                                    @click="toggleStoreForItem(item, store)">
                                                <span v-if="getItemStores(item).includes(store)">✓ </span>{{ store }}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. 底部快捷按鈕 (清除已買食材 & 複製清單) -->
                    <div style="display: flex; gap: 10px; justify-content: space-between; border-top: 1px solid var(--color-border); padding-top: 16px;">
                        <button class="btn-icon" @click="clearPurchased" style="flex: 1; padding: 12px; font-weight: 700; color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; box-shadow: 0 2px 5px rgba(4, 120, 87, 0.08); cursor: pointer;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 3l-8 8"></path>
                                <path d="M11 11l-3 7a2 2 0 0 0 2 2l7-3-6-6z"></path>
                            </svg>
                            <span>清除已買食材</span>
                        </button>
                        <button class="btn-primary accent" @click="copyShoppingListText" style="flex: 1; justify-content: center; padding: 12px; font-weight: 700; font-size: 0.95rem; border-radius: 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(237, 137, 54, 0.25); cursor: pointer;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>複製清單</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 📱 畫面 C：【生活雜項詳細資料與照片 Modal】 -->
            <div v-if="showSupplyModal && selectedSupply" class="modal-overlay" @click.self="showSupplyModal = false">
                <div class="drawer-content" style="max-width: 480px; padding: 24px;">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
                        <span style="font-weight: 700; font-size: 1.1rem;">生活雜項詳細資料</span>
                        <button class="btn-icon" @click="showSupplyModal = false" style="border: none; font-size: 1.1rem;">✕ 關閉</button>
                    </div>

                    <!-- 實體照片 -->
                    <div style="background: #FAF8F5; border: 1px dashed var(--color-border); border-radius: 16px; height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 16px; text-align: center;">
                        <div style="font-size: 2.2rem; margin-bottom: 6px;">📦</div>
                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">{{ selectedSupply.name }} 實體包裝外觀</span>
                    </div>

                    <!-- 規格資料 -->
                    <div style="background: #FFFFFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; margin-bottom: 18px; font-size: 0.9rem; line-height: 1.8;">
                        <div><strong>項目名稱：</strong>{{ selectedSupply.name }}</div>
                        <div><strong>常用品牌：</strong>{{ selectedSupply.brand || '無' }}</div>
                        <div>
                            <strong>參考價格：</strong>
                            <span style="font-weight: 700; color: var(--color-primary);">NT$ {{ selectedSupply.price }}</span> / {{ selectedSupply.priceUnit }}
                            <span v-if="selectedSupply.packQuantity" style="font-size: 0.8rem; color: #047857; margin-left: 6px; font-weight: 600;">
                                (平均 NT$ {{ (selectedSupply.price / selectedSupply.packQuantity).toFixed(1) }}/{{ selectedSupply.unitName || '單位' }})
                            </span>
                        </div>
                        <div><strong>常用通路：</strong>{{ selectedSupply.store || '賣場' }}</div>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn-icon" @click="updateSupplyPhoto" style="padding: 10px; font-weight: 600; justify-content: center; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                            <span>拍攝/更新商品包裝照片</span>
                        </button>
                        <button class="btn-primary accent" @click="copyLineMessage(selectedSupply)" style="justify-content: center; padding: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>一鍵複製代購訊息 (規格+價格) 至 LINE</span>
                        </button>
                        <button class="btn-icon" @click="deleteSupplyItem(selectedSupply.id)" style="color: #EF4444; border: none; justify-content: center; font-size: 0.85rem; margin-top: 4px; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            <span>永久刪除此雜項 (不再回購)</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 📱 新增食材 / 雜項抽屜 (結合 AI 拍照辨識) -->
            <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
                <div class="drawer-content" style="max-height: 90vh; padding: 20px 20px 28px 20px; position: relative; overflow-y: auto;">
                    
                    <!-- 🤖 AI 辨識中 70% 半透明白色遮罩 + 50x50px 大 Loading 圈圈 + 取消不等待按鈕 -->
                    <div v-if="isAiAnalyzing" 
                         style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 100; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center;">
                        <div class="ai-spinner-lg" style="margin-bottom: 18px;"></div>
                        <div style="font-size: 1.05rem; font-weight: 700; color: #19585C; margin-bottom: 6px;">
                            Gemini AI 正在分析照片中...
                        </div>
                        <div style="font-size: 0.8rem; color: var(--color-text-muted); font-weight: 500; margin-bottom: 24px; max-width: 240px; line-height: 1.5;">
                            正在讀取標籤與換算每 100g 數據，已為您封鎖畫面防止誤觸
                        </div>
                        <button class="btn-icon" 
                                @click="cancelAiAnalyzing" 
                                style="background: #FFFFFF; border: 1.5px solid var(--color-border); padding: 10px 22px; border-radius: var(--radius-full); font-weight: 700; font-size: 0.85rem; color: var(--color-text-main); box-shadow: 0 4px 14px rgba(0,0,0,0.08); cursor: pointer; transition: all 0.2s ease;">
                            ✕ 取消不等待 (改為手動填寫)
                        </button>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                            <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0;">拍攝辨識 / 新增食材與雜項</h3>
                        </div>
                        <button class="btn-icon" @click="closeAddModal" style="border: none; font-size: 1.1rem; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0;">✕</button>
                    </div>

                    <!-- 1. AI 辨識區：API Key 狀態與實拍圖片預覽+雷射動態掃描卡片 -->
                    <div style="background: #EAF6F7; border: 1.5px solid var(--color-mint-active); border-radius: 14px; padding: 12px; margin-bottom: 14px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: #19585C; display: flex; align-items: center; justify-content: space-between;">
                            <span style="display: inline-flex; align-items: center; gap: 6px;">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 1.5 1.5L22 4l-1-2z"></path>
                                </svg>
                                <span>AI 圖片辨識狀態：</span>
                                <span :style="{ color: hasValidKey ? '#059669' : '#D97706', fontWeight: 800 }">
                                    {{ hasValidKey ? '● 已開啟 API 辨識' : '○ 未設定 API Key' }}
                                </span>
                            </span>
                            <button class="btn-icon" @click="showApiKeyInput = !showApiKeyInput" style="padding: 3px 10px; font-size: 0.75rem; font-weight: 600;">
                                {{ showApiKeyInput ? '收起' : '設定 Key' }}
                            </button>
                        </div>
                        <div v-if="showApiKeyInput || !hasValidKey" style="margin-top: 8px;">
                            <div style="font-size: 0.75rem; color: #19585C; margin-bottom: 6px;">
                                貼上免費 Gemini API Key 即可讓手機相機擁有 100% 準確營養標示 OCR 讀取能力：
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <input type="text" 
                                       v-model="geminiApiKeyInput" 
                                       placeholder="貼上 Google API Key (AQ... 或 AIza...)" 
                                       autocomplete="off" 
                                       autocorrect="off" 
                                       autocapitalize="off" 
                                       spellcheck="false" 
                                       class="search-input" 
                                       style="flex: 1; padding: 6px 10px; font-size: 0.8rem; background: #FFF; font-family: monospace;">
                                <button class="btn-primary" @click="saveApiKey" style="padding: 6px 12px; font-size: 0.8rem; font-weight: 700; white-space: nowrap; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px;">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                        <polyline points="7 3 7 8 15 8"></polyline>
                                    </svg>
                                    <span>儲存啟用</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="capturedPhotoUrl" style="margin-bottom: 16px; background: #FFFFFF; border: 1.5px solid var(--color-mint-active); border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 12px; transition: all 0.3s ease;">
                        <div class="ai-scan-box" style="width: 64px; height: 64px; flex-shrink: 0;">
                            <img :src="capturedPhotoUrl" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                            <div v-if="aiScanStatus === 'analyzing'" class="ai-scan-line"></div>
                        </div>
                        <div style="flex: 1;">
                            <div v-if="aiScanStatus === 'analyzing'" style="display: flex; align-items: center; gap: 8px;">
                                <span class="ai-spinner"></span>
                                <div>
                                    <div style="font-size: 0.85rem; color: #19585C; font-weight: 700;">
                                        Gemini AI 辨識中...
                                    </div>
                                    <div style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 500; margin-top: 2px;">
                                        正在讀取標籤與換算 100g 數據，請稍候 3~5 秒
                                    </div>
                                </div>
                            </div>
                            <div v-else-if="aiScanStatus === 'success'" style="font-size: 0.85rem; color: #065F46; font-weight: 700;">
                                ✨ Gemini Vision 辨識成功！
                                <div style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 500; margin-top: 2px;">
                                    {{ aiStatusMessage || '已為您自動帶入品名與每 100g 營養成份，可手動微調。' }}
                                </div>
                            </div>
                            <div v-else style="font-size: 0.85rem; color: #B45309; font-weight: 700;">
                                ⚠️ AI 辨識未完成
                                <div style="font-size: 0.75rem; color: #78350F; font-weight: 500; margin-top: 2px;">
                                    {{ aiStatusMessage || '未能自動提取數據，請在下方直接手動填寫品名與成分。' }}
                                </div>
                                <button class="btn-icon" @click="copyDebugReport" style="padding: 4px 10px; font-size: 0.75rem; margin-top: 8px; display: inline-flex; align-items: center; gap: 4px; background: #FFF; border: 1px solid #D97706; color: #B45309; font-weight: 700; border-radius: 8px; cursor: pointer;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                    <span>📋 複製詳細除錯報告 (貼給十一粒)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. 產品名稱 -->
                    <div style="margin-bottom: 14px;">
                        <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">產品名稱</label>
                        <input type="text" v-model="addForm.name" placeholder="如：牛番茄、鮮乳、橄欖油、洗碗精..." class="search-input" style="width: 100%; padding: 10px;">
                    </div>

                    <!-- 3. 營養成份 (每 100g / 按單份 雙軌營養規格編輯卡片) -->
                    <div v-if="addForm.type === 'food' && addForm.per100g" style="background: #F9FAFB; border: 1.5px solid var(--color-mint-active); border-radius: 14px; padding: 14px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <label style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); display: inline-flex; align-items: center; gap: 6px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="20" x2="18" y2="10"></line>
                                    <line x1="12" y1="20" x2="12" y2="4"></line>
                                    <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                                <span>營養成份：</span>
                            </label>
                            <div style="display: flex; gap: 4px; background: #E5E7EB; padding: 2px; border-radius: 8px; font-size: 0.75rem;">
                                <button class="btn-icon" 
                                        @click="addFormDisplayBasis = 'serving'" 
                                        :style="{ background: addFormDisplayBasis === 'serving' ? '#FFFFFF' : 'transparent', fontWeight: addFormDisplayBasis === 'serving' ? '700' : '500', color: addFormDisplayBasis === 'serving' ? '#19585C' : '#6B7280', padding: '3px 8px', border: 'none', borderRadius: '6px', cursor: 'pointer' }">
                                    按單份 ({{ addForm.servingSize || 10 }}{{ addForm.servingUnit || 'g' }})
                                </button>
                                <button class="btn-icon" 
                                        @click="addFormDisplayBasis = '100g'" 
                                        :style="{ background: addFormDisplayBasis === '100g' ? '#FFFFFF' : 'transparent', fontWeight: addFormDisplayBasis === '100g' ? '700' : '500', color: addFormDisplayBasis === '100g' ? '#19585C' : '#6B7280', padding: '3px 8px', border: 'none', borderRadius: '6px', cursor: 'pointer' }">
                                    按每 100g
                                </button>
                            </div>
                        </div>

                        <!-- 單份基準大小設定區 (僅在按單份模式下顯示) -->
                        <div v-if="addFormDisplayBasis === 'serving'" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.8rem; background: #FFFFFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border);">
                            <span style="color: var(--color-text-muted); font-weight: 600;">單份基準大小：</span>
                            <input type="number" v-model.number="addForm.servingSize" @input="onServingInput" placeholder="10" class="search-input" style="width: 55px; padding: 2px 6px; font-weight: 700; text-align: center;">
                            <select v-model="addForm.servingUnit" class="search-input" style="padding: 2px 6px; width: 55px; font-weight: 600;">
                                <option value="g">g</option>
                                <option value="mL">mL</option>
                                <option value="匙">匙</option>
                                <option value="包">包</option>
                            </select>
                        </div>

                        <!-- 動態雙向綁定欄位 -->
                        <div v-if="addFormDisplayBasis === 'serving'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
                            <div>
                                <span style="color: var(--color-text-muted);">熱量(kcal/單份):</span>
                                <input type="number" v-model.number="addForm.perServing.kcal" @input="onServingInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px; font-weight: 700;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">蛋白質(g/單份):</span>
                                <input type="number" v-model.number="addForm.perServing.protein" @input="onServingInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px; font-weight: 700;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">碳水(g/單份):</span>
                                <input type="number" v-model.number="addForm.perServing.carbs" @input="onServingInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px; font-weight: 700;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">脂肪(g/單份):</span>
                                <input type="number" v-model.number="addForm.perServing.fat" @input="onServingInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px; font-weight: 700;">
                            </div>
                        </div>

                        <div v-else style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
                            <div>
                                <span style="color: var(--color-text-muted);">熱量(kcal/100g):</span>
                                <input type="number" v-model.number="addForm.per100g.kcal" @input="on100gInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">蛋白質(g/100g):</span>
                                <input type="number" v-model.number="addForm.per100g.protein" @input="on100gInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">碳水(g/100g):</span>
                                <input type="number" v-model.number="addForm.per100g.carbs" @input="on100gInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px;">
                            </div>
                            <div>
                                <span style="color: var(--color-text-muted);">脂肪(g/100g):</span>
                                <input type="number" v-model.number="addForm.per100g.fat" @input="on100gInput" class="search-input" style="width: 100%; padding: 4px 8px; margin-top: 2px;">
                            </div>
                        </div>
                    </div>

                    <!-- 4. 大項分類 (飲食食材 | 生活雜項) -->
                    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <button class="capsule" 
                                :class="addForm.type === 'food' ? 'selected' : 'in-stock'" 
                                @click="addForm.type = 'food'"
                                style="cursor: pointer; padding: 6px 14px; font-weight: 700; font-size: 0.85rem;">
                            飲食食材
                        </button>
                        <button class="capsule" 
                                :class="addForm.type === 'supply' ? 'selected' : 'in-stock'" 
                                @click="addForm.type = 'supply'"
                                style="cursor: pointer; padding: 6px 14px; font-weight: 700; font-size: 0.85rem;">
                            生活雜項
                        </button>
                    </div>

                    <!-- 5. 存放分區 & 6. 營養分類 -->
                    <div v-if="addForm.type === 'food'">
                        <div style="margin-bottom: 14px;">
                            <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 6px;">存放分區：</label>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                <button class="capsule" 
                                        :class="isAddFormZoneSelected('fridge') ? 'selected' : 'in-stock'" 
                                        @click="toggleAddFormZone('fridge')"
                                        style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                                    冷藏區
                                </button>
                                <button class="capsule" 
                                        :class="isAddFormZoneSelected('freezer') ? 'selected' : 'in-stock'" 
                                        @click="toggleAddFormZone('freezer')"
                                        style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                                    冷凍區
                                </button>
                                <button class="capsule" 
                                        :class="isAddFormZoneSelected('pantry') ? 'selected' : 'in-stock'" 
                                        @click="toggleAddFormZone('pantry')"
                                        style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                                    常溫區
                                </button>
                            </div>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">營養分類：</label>
                            <select v-model="addForm.category" class="select-box" style="padding: 8px 12px; font-weight: 600; width: 100%;">
                                <option value="proteins">蛋白質</option>
                                <option value="veggies">蔬菜水果</option>
                                <option value="carbs">碳水類</option>
                                <option value="sauces">醬料與油脂</option>
                                <option value="drinks">飲品與沖泡</option>
                            </select>
                        </div>
                    </div>

                    <div v-else style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">常用品牌</label>
                            <input type="text" v-model="addForm.brand" placeholder="如：Kirkland" class="search-input" style="padding: 8px;">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px;">參考價格</label>
                            <input type="number" v-model="addForm.price" placeholder="如：369" class="search-input" style="padding: 8px;">
                        </div>
                    </div>

                    <!-- 1. 精簡底欄並排：相機實拍 AI | 相簿選圖 | 儲存建檔 (無取消按鈕) -->
                    <div style="display: flex; gap: 8px; margin-top: 20px;">
                        <button class="btn-icon" @click="triggerCamera" style="flex: 1; justify-content: center; padding: 10px 4px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                            <span>AI 實拍</span>
                        </button>
                        <button class="btn-icon" @click="triggerAlbum" style="flex: 1; justify-content: center; padding: 10px 4px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <span>相簿選圖</span>
                        </button>
                        <button class="btn-primary accent" @click="saveNewItem" style="flex: 1.4; justify-content: center; padding: 10px 4px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            <span>儲存建檔</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 📱 長按【食材 100g 營養數據與外包裝照片 Modal】 -->
            <div v-if="showFoodDetailModal && selectedFood" class="modal-overlay" @click.self="showFoodDetailModal = false">
                <div class="drawer-content" style="max-width: 440px; padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <!-- 1. 食材名稱：灰色實底線，刪除鉛筆 Icon -->
                        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                            <span style="font-size: 1.2rem;">🥗</span>
                            <input type="text" 
                                   v-model="selectedFood.name" 
                                   @change="saveFoodChanges(selectedFood)" 
                                   placeholder="食材名稱"
                                   style="font-weight: 700; font-size: 1.1rem; border: none; border-bottom: 1.5px solid var(--color-border); background: transparent; padding: 2px 4px; width: 160px; color: var(--color-text-main); outline: none;" />
                        </div>
                        <!-- 2. 「有庫存」跟「沒庫存」可互相切換按鈕 -->
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button class="capsule" 
                                    :class="checkFoodStock(selectedFood.id) ? 'selected' : 'disabled'" 
                                    @click="toggleStockInFoodModal(selectedFood.id)" 
                                    style="cursor: pointer; padding: 4px 10px; font-size: 0.8rem; font-weight: 700; user-select: none;">
                                {{ checkFoodStock(selectedFood.id) ? '❄️ 有庫存' : '🛒 無庫存' }}
                            </button>
                            <button class="btn-icon" @click="showFoodDetailModal = false" style="border: none; font-size: 1.1rem;">✕</button>
                        </div>
                    </div>

                    <!-- 2. 每 100g 營養成份規格 (成份可直接修改，標題簡潔) -->
                    <div style="background: #FAF8F5; border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 10px;">
                            📊 每 100g 營養成份規格：
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>熱量</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedFood.per100g.kcal" @change="saveFoodChanges(selectedFood)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">kcal</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>蛋白質</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedFood.per100g.protein" @change="saveFoodChanges(selectedFood)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>🍚 碳水</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedFood.per100g.carbs" @change="saveFoodChanges(selectedFood)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                            <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                                <span>脂肪</span>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="number" v-model.number="selectedFood.per100g.fat" @change="saveFoodChanges(selectedFood)" style="width: 52px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 存放分區 (可複選/切換：冷藏區、冷凍區、常溫區) -->
                    <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">
                            存放分區：
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button v-for="z in [{key:'fridge', label:'冷藏區'}, {key:'freezer', label:'冷凍區'}, {key:'pantry', label:'常溫區'}]" 
                                    :key="z.key"
                                    class="capsule"
                                    :class="isFoodZoneSelected(selectedFood, z.key) ? 'selected' : 'in-stock'"
                                    style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                    @click="toggleFoodStorageZone(selectedFood, z.key)">
                                {{ z.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 分類切換 -->
                    <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">
                            食材分類：
                        </div>
                        <select v-model="selectedFood.category" @change="saveFoodChanges(selectedFood)" class="select-box" style="width: 100%; padding: 8px 12px; font-weight: 600;">
                            <option value="proteins">蛋白質</option>
                            <option value="veggies">蔬菜水果</option>
                            <option value="carbs">碳水類</option>
                            <option value="sauces">醬料與油脂</option>
                            <option value="drinks">飲品與沖泡</option>
                        </select>
                    </div>

                    <!-- 3. 常用採買通路 (統一系統膠囊UI) & 4. 純 🛒 圖示按鈕 -->
                    <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">常用採買通路：</span>
                            <!-- 4. 加入採買清單：純 🛒 圖示按鈕 -->
                            <button class="btn-icon" 
                                    @click="toggleFoodCart(selectedFood)" 
                                    style="padding: 6px 10px; border-radius: var(--radius-full); border: 1.5px solid var(--color-border); cursor: pointer; transition: all 0.15s ease;"
                                    :style="{ background: isInCart(selectedFood.id) ? 'var(--color-mint-active)' : '#FFFFFF', color: isInCart(selectedFood.id) ? '#FFFFFF' : 'var(--color-cart-gray)', borderColor: isInCart(selectedFood.id) ? 'var(--color-mint-active)' : 'var(--color-border)' }"
                                    :title="isInCart(selectedFood.id) ? '已在採買清單 (點擊移除)' : '加入採買清單'">
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
                                    :class="isStoreSelected(selectedFood, store) ? 'selected' : 'in-stock'"
                                    style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                    @click="togglePreferredStore(selectedFood, store)">
                                {{ store }}
                            </button>
                        </div>
                    </div>

                    <!-- 5. 底部 3 按鈕：更新外包裝照片 | 刪除食材 | 儲存 -->
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" @click="triggerCamera" style="flex: 1.2; justify-content: center; padding: 10px 6px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                            <span>外包裝照片</span>
                        </button>
                        <button class="btn-icon" @click="deleteFoodIngredient(selectedFood.id)" style="flex: 1.2; justify-content: center; padding: 10px 6px; font-size: 0.8rem; font-weight: 600; color: #EF4444; background: #FEF2F2; border-color: #FCA5A5; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            <span>刪除食材</span>
                        </button>
                        <button class="btn-primary" @click="saveAndCloseFoodModal(selectedFood)" style="flex: 1; justify-content: center; padding: 10px 6px; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            <span>儲存</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};
