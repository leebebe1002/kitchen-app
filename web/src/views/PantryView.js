const { ref, computed, watch } = Vue;
import IngredientDetailModal from '../components/IngredientDetailModal.js';

export default {
    components: {
        IngredientDetailModal
    },
    props: ['engine'],
    setup(props) {
        const engine = props.engine;

        // Modal States
        const showShoppingModal = ref(false); // 畫面 B: 滿版採買視窗
        const showSupplyModal = ref(false);   // 畫面 C: 生活雜項詳細資料 Modal
        const selectedFood = ref(null);
        const selectedSupply = ref(null);
        const shoppingStoreFilter = ref('all'); // 'all' | '全聯' | 'Costco'

        // 📱 【萬能食材編輯器 (Unified Ingredient Modal) 狀態機】
        const ingredientModal = ref({
            isOpen: false,
            mode: 'create', // 'create' | 'edit'
            ingredient: null
        });
        
        // Modal 背景鎖定機制 (Body Scroll Lock)
        watch([() => ingredientModal.value.isOpen, showSupplyModal, showShoppingModal], (newVals) => {
            const isAnyOpen = newVals.some(v => v === true || v?.isOpen === true);
            if (isAnyOpen) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        });

        // 🔍 食材關鍵字即時搜尋 (Option A)
        const showSearchInput = ref(false);
        const searchKeyword = ref('');

        const toggleSearch = () => {
            showSearchInput.value = !showSearchInput.value;
            if (showSearchInput.value) {
                Vue.nextTick(() => {
                    const el = document.getElementById('pantry-search-input');
                    if (el) el.focus();
                });
            } else {
                searchKeyword.value = '';
            }
        };

        const clearSearch = () => {
            searchKeyword.value = '';
            showSearchInput.value = false;
        };

        // 4 Storage Zones mapped to ingredients
        const zoneNames = {
            fridge: '【冷藏區】 (Fridge Zone)',
            freezer: '【冷凍區】 (Freezer Zone)',
            pantry: '【常溫區】 (Pantry Zone)'
        };

        const getZoneIngredients = (zone) => {
            const all = engine.data.ingredients || [];
            const kw = (searchKeyword.value || '').trim().toLowerCase();
            return all.filter(ing => {
                const zones = ing.storageZones || (ing.storageZone ? [ing.storageZone] : ['fridge']);
                if (!zones.includes(zone)) return false;
                if (!kw) return true;
                const nameMatch = (ing.name || '').toLowerCase().includes(kw);
                const brandMatch = (ing.brand || '').toLowerCase().includes(kw);
                const storeMatch = (ing.preferredStores || (ing.preferredStore ? ing.preferredStore.split('/') : [])).some(s => s.toLowerCase().includes(kw));
                return nameMatch || brandMatch || storeMatch;
            });
        };

        const getCategoryInZone = (zone, cat) => {
            return getZoneIngredients(zone).filter(ing => ing.category === cat);
        };

        // Household Supplies
        const supplies = computed(() => {
            const list = engine.data.householdSupplies?.supplies || [];
            const kw = (searchKeyword.value || '').trim().toLowerCase();
            if (!kw) return list;
            return list.filter(s => {
                const nameMatch = (s.name || '').toLowerCase().includes(kw);
                const brandMatch = (s.brand || '').toLowerCase().includes(kw);
                const storeMatch = (s.store || '').toLowerCase().includes(kw);
                return nameMatch || brandMatch || storeMatch;
            });
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
                if (item.preferredStores && item.preferredStores.length > 0) return item.preferredStores;
                const sup = engine.data.householdSupplies?.supplies?.find(s => s.id === item.targetId);
                if (sup?.preferredStores && sup.preferredStores.length > 0) return sup.preferredStores;
                if (sup?.store) return [sup.store];
                if (item.store) return [item.store];
                return ['Costco'];
            }
            if (item.preferredStores && item.preferredStores.length > 0) return item.preferredStores;
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
            const filtered = (shoppingStoreFilter.value === 'all') 
                ? list 
                : list.filter(item => getItemStores(item).includes(shoppingStoreFilter.value));
            // 🌟 排序：未打勾 (isPurchased === false) 在上方，已打勾 (isPurchased === true) 在下方
            return [...filtered].sort((a, b) => {
                const aPurchased = !!a.isPurchased;
                const bPurchased = !!b.isPurchased;
                if (aPurchased !== bPurchased) {
                    return aPurchased ? 1 : -1;
                }
                return 0;
            });
        });

        const filteredSupplyShopping = computed(() => {
            const list = shoppingList.value.filter(s => s.type === 'supply');
            const filtered = (shoppingStoreFilter.value === 'all') 
                ? list 
                : list.filter(item => getItemStores(item).includes(shoppingStoreFilter.value));
            // 🌟 排序：未打勾 (isPurchased === false) 在上方，已打勾 (isPurchased === true) 在下方
            return [...filtered].sort((a, b) => {
                const aPurchased = !!a.isPurchased;
                const bPurchased = !!b.isPurchased;
                if (aPurchased !== bPurchased) {
                    return aPurchased ? 1 : -1;
                }
                return 0;
            });
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

            // 同步保存至 item 本身
            item.preferredStores = currentStores;
            item.store = currentStores[0];

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
                        ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
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
                        ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
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

        const openAddModalDirectly = () => {
            ingredientModal.value = {
                isOpen: true,
                mode: 'create',
                ingredient: null
            };
        };

        const openFoodDetail = (ing) => {
            if (!ing) return;
            selectedFood.value = ing;
            ingredientModal.value = {
                isOpen: true,
                mode: 'edit',
                ingredient: ing
            };
        };

        const closeIngredientModal = () => {
            ingredientModal.value.isOpen = false;
        };

        const onIngredientSaved = async (savedIng) => {
            pantryUpdateTrigger.value++;
        };

        const onIngredientDeleted = async (deletedId) => {
            pantryUpdateTrigger.value++;
        };

        // Camera & AI Vision state & Config API Key
        const cameraInputRef = ref(null);
        const albumInputRef = ref(null);
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

        // 初始化讀取本地與全域 API Key
        const refreshSavedApiKey = () => {
            let key = '';
            try {
                key = localStorage.getItem('family_kitchen_gemini_key') || 
                      localStorage.getItem('kitchen_v2_gemini_api_key') || 
                      localStorage.getItem('gemini_api_key') || '';
            } catch (e) {}
            if (!key && engine.data.config) {
                key = engine.data.config.geminiApiKey || engine.data.config.gemini_api_key || '';
            }
            savedApiKey.value = key || '';
            return savedApiKey.value;
        };

        // 立即執行一次初始化檢查
        refreshSavedApiKey();

        const hasValidKey = computed(() => {
            const key = savedApiKey.value || '';
            return key.trim().length >= 20;
        });

        const saveApiKey = async () => {
            const key = geminiApiKeyInput.value.trim();
            if (!key) {
                alert('請輸入有效的 Gemini API Key');
                return;
            }
            try {
                localStorage.setItem('family_kitchen_gemini_key', key);
                localStorage.setItem('kitchen_v2_gemini_api_key', key);
                localStorage.setItem('gemini_api_key', key);
            } catch (e) {}
            savedApiKey.value = key;
            if (!engine.data.config) engine.data.config = {};
            engine.data.config.geminiApiKey = key;
            engine.data.config.gemini_api_key = key;
            await engine.saveJson('config.json', engine.data.config);
            showApiKeyInput.value = false;
            geminiApiKeyInput.value = '';
            alert('🎉 Gemini API Key 已成功儲存啟用！');

            if (ingredientModal.value.photo.url) {
                await analyzePhotoDirectly(ingredientModal.value.photo.url, key);
            }
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

        // 🤖 純前端直連 Google Gemini Vision API
        const callClientGeminiNutritionOCR = async (base64DataUrl, apiKey) => {
            let mimeType = 'image/jpeg';
            let cleanB64 = base64DataUrl;
            if (base64DataUrl.includes(';base64,')) {
                const parts = base64DataUrl.split(';base64,');
                mimeType = parts[0].replace('data:', '') || 'image/jpeg';
                cleanB64 = parts[1];
            }

            const prompt = `你是一位專業的食品營養標示 OCR 與分析專家。請仔細讀取這張食品營養標籤照片，並精準提取出以下資訊：
1. 食品名稱 (name)
2. 如果照片上有『每份 (Per Serving)』數值，請直接讀取填入 perServing。
3. 如果照片上有『每 100g / 100mL』數值，請直接讀取填入 per100g。
4. 如果照片上『只有每份』或『只有每 100g』，請自動按比例換算補齊另一欄的數據！
5. category 請依據屬性選填：proteins (蛋白質), carbs (澱粉/主食), veggies (蔬菜水果), sauces (油脂/調味/其他) 之一。
6. 請嚴格只輸出純 JSON，不可包含 markdown codeblock 標籤：
{
  "name": "精準品名",
  "category": "sauces",
  "servingSize": 10,
  "servingUnit": "mL",
  "perServing": {
    "kcal": 12.4,
    "protein": 0.2,
    "carbs": 2.9,
    "fat": 0,
    "sodium": 18
  },
  "per100g": {
    "kcal": 124,
    "protein": 2,
    "carbs": 29,
    "fat": 0,
    "sodium": 180
  }
}`;

            const payload = {
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: cleanB64 } }] }]
            };

            const attempts = [
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', useHeader: true, useQuery: true },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', useHeader: true, useQuery: true },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', useHeader: true, useQuery: true },
                { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent', useHeader: true, useQuery: true }
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
            ingredientModal.value.photo.isAnalyzing = true;
            ingredientModal.value.photo.status = 'analyzing';
            ingredientModal.value.photo.message = '正在讀取標籤與換算 100g 數據，請稍候 3~5 秒...';

            let data = null;

            if (!apiKey) {
                data = {
                    status: 'need_api_key',
                    message: '未設定 Gemini API Key，請點擊「設定 Key」輸入金鑰，或直接手動填寫。'
                };
            } else {
                data = await callClientGeminiNutritionOCR(compressedDataUrl, apiKey);
            }

            ingredientModal.value.photo.isAnalyzing = false;

            if (data && data.status === 'success' && data.result) {
                const resData = data.result;
                const form = ingredientModal.value.form;
                if (ingredientModal.value.mode === 'create' || !form.name) {
                    if (resData.name) form.name = resData.name;
                }
                if (resData.servingSize) form.servingSize = Number(resData.servingSize) || 10;
                if (resData.servingUnit) form.servingUnit = resData.servingUnit || 'g';

                if (resData.per100g) {
                    form.per100g = {
                        kcal: Number(resData.per100g.kcal) || 0,
                        protein: Number(resData.per100g.protein) || 0,
                        carbs: Number(resData.per100g.carbs) || 0,
                        fat: Number(resData.per100g.fat) || 0,
                        sodium: Number(resData.per100g.sodium) || 0
                    };
                }

                if (resData.perServing) {
                    form.perServing = {
                        kcal: Number(resData.perServing.kcal) || 0,
                        protein: Number(resData.perServing.protein) || 0,
                        carbs: Number(resData.perServing.carbs) || 0,
                        fat: Number(resData.perServing.fat) || 0,
                        sodium: Number(resData.perServing.sodium) || 0
                    };
                } else {
                    onModal100gInput();
                }

                // 🧠 使用 3 層巨量營養素主導自動分類法則 (Macro Dominance Auto Categorization)
                const autoCategory = engine.detectNutrientCategory(
                    resData.name || form.name, 
                    form.per100g || form.perServing || resData.per100g || resData.perServing
                );
                form.category = autoCategory || resData.category || 'sauces';

                if (['sauces', 'oils', 'seasonings', 'fats'].includes(form.category)) {
                    form.displayBasis = 'serving';
                } else {
                    form.displayBasis = '100g';
                }

                ingredientModal.value.photo.status = 'success';
                ingredientModal.value.photo.message = `✨ 已為您自動填入【${resData.name || form.name || '食材'}】的熱量與營養成份！`;
            } else {
                ingredientModal.value.photo.status = 'error';
                const errMsg = data?.message || 'AI 辨識未完成';
                ingredientModal.value.photo.message = `${errMsg}，請直接在下方手動填寫品名與成分。`;

                if (data?.status === 'need_api_key' || data?.status === 'invalid_key') {
                    showApiKeyInput.value = true;
                }

                if (fileName && !['image', 'photo', 'camera', 'IMG', 'DCIM'].some(k => fileName.includes(k))) {
                    if (!ingredientModal.value.form.name) ingredientModal.value.form.name = fileName;
                }
            }
        };

        const handleCameraSnap = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                if (!ingredientModal.value.isOpen) {
                    openAddModalDirectly();
                }
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawDataUrl = e.target.result;
                    const compressedDataUrl = await compressImage(rawDataUrl, 800, 800, 0.8);
                    ingredientModal.value.photo.url = compressedDataUrl;

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

        const handleFoodLeftClick = (ing) => {
            if (foodPressTimer) clearTimeout(foodPressTimer);
            if (!isFoodLongPress) {
                toggleFoodStock(ing.id);
            }
            isFoodLongPress = false;
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
            ingredientModal,
            openAddModalDirectly,
            openFoodDetail,
            closeIngredientModal,
            onIngredientSaved,
            onIngredientDeleted,
            startFoodPress,
            handleFoodTouchMove,
            cancelFoodPress,
            handleFoodLeftClick,
            shoppingStoreFilter,
            selectedSupply,
            shoppingList,
            filteredFoodShopping,
            filteredSupplyShopping,
            cameraInputRef,
            albumInputRef,
            geminiApiKeyInput,
            showApiKeyInput,
            savedApiKey,
            hasValidKey,
            saveApiKey,
            debugHistory,
            copyDebugReport,
            triggerCamera,
            triggerAlbum,
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
            showSearchInput,
            searchKeyword,
            toggleSearch,
            clearSearch
        };
    },
    template: `
        <div class="view-pantry" style="padding-bottom: 90px;">
            <!-- 01 PANTRY STOCK 冰箱食材庫存狀態 (黃金畫面 100% 呈現庫存) -->
            <div class="section-title" style="margin-bottom: 14px;">
                01 PANTRY STOCK 冰箱食材庫存狀態
            </div>

            <!-- 🔍 原地即時搜尋列 (當點擊右側 🔍 浮動按鈕時平滑滑出) -->
            <div v-if="showSearchInput" 
                 style="margin-bottom: 18px; background: #FFFFFF; border: 1.5px solid var(--color-primary); border-radius: 14px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(76, 163, 164, 0.15);">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="var(--color-primary)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input type="text" 
                       id="pantry-search-input"
                       v-model="searchKeyword" 
                       placeholder="搜尋食材名稱、品牌、通路... (如：泡菜、咖啡、全聯)" 
                       class="search-input" 
                       style="flex: 1; border: none; background: transparent; padding: 4px 0; font-size: 0.95rem; font-weight: 600; outline: none; box-shadow: none;">
                <button v-if="searchKeyword" 
                        @click="searchKeyword = ''" 
                        style="border: none; background: #E5E7EB; color: #4B5563; border-radius: 50%; width: 22px; height: 22px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;">
                    ✕
                </button>
                <button @click="clearSearch" 
                        style="border: none; background: #F3F4F6; color: var(--color-text-main); font-size: 0.8rem; font-weight: 700; border-radius: 8px; padding: 4px 8px; cursor: pointer;">
                    收起
                </button>
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
                <div style="height: 1px; background: var(--color-border); margin: 1px 2px;"></div>
                <!-- 🔍 浮動搜尋切換按鈕 (置於最下方更符合單手大拇指人體工學) -->
                <button @click="toggleSearch" 
                        :style="{
                            border: 'none',
                            background: showSearchInput ? 'var(--color-primary)' : 'transparent',
                            color: showSearchInput ? '#FFF' : 'var(--color-text-main)',
                            borderRadius: '10px',
                            padding: '6px 4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                        }"
                        title="搜尋食材">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
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

                <!-- 4. 油脂/調味/其他 -->
                <div v-if="getCategoryInZone('fridge', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 油脂/調味/其他</div>
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

                <!-- 4. 油脂/調味/其他 -->
                <div v-if="getCategoryInZone('freezer', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 油脂/調味/其他</div>
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

                <!-- 4. 油脂/調味/其他 -->
                <div v-if="getCategoryInZone('pantry', 'sauces').length > 0" style="margin-bottom: 14px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 6px;">4. 油脂/調味/其他</div>
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
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>新增食材</span>
                </button>
            </div>

            <!-- 📱 【全域共用食材卡片 (Unified Ingredient Modal)】支援新增 (create) 與長按編輯 (edit) 雙模式 -->
            <ingredient-detail-modal 
                :is-open="ingredientModal.isOpen"
                :mode="ingredientModal.mode"
                :initial-ingredient="ingredientModal.ingredient"
                context="pantry"
                :engine="engine"
                @close="closeIngredientModal"
                @saved="onIngredientSaved"
                @deleted="onIngredientDeleted"
            />

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
        </div>
    `
};
