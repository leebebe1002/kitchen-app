const { ref, reactive, computed, watch, onMounted } = Vue;

const IngredientDetailModal = {
    name: 'IngredientDetailModal',
    props: {
        isOpen: {
            type: Boolean,
            default: false
        },
        mode: {
            type: String,
            default: 'edit' // 'create' | 'edit'
        },
        initialIngredient: {
            type: Object,
            default: () => null
        },
        initialName: {
            type: String,
            default: ''
        },
        context: {
            type: String,
            default: 'pantry' // 'calculator' | 'pantry' | 'calculator_create'
        },
        engine: {
            type: Object,
            required: true
        }
    },
    emits: ['close', 'saved', 'deleted', 'removeFromDish'],
    setup(props, { emit }) {
        const form = reactive({
            id: '',
            name: '',
            brand: '',
            category: 'proteins',
            displayBasis: '100g', // '100g' | 'serving'
            servingSize: 10,
            servingUnit: 'g',
            stock: true,
            storageZones: ['fridge'],
            preferredStores: ['全聯'],
            price: 0,
            priceUnit: '包',
            per100g: {
                kcal: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
                sodium: 0
            },
            perServing: {
                kcal: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
                sodium: 0
            }
        });

        const photo = reactive({
            url: null,
            isAnalyzing: false,
            status: 'idle', // 'idle' | 'analyzing' | 'success' | 'error'
            message: ''
        });

        const showApiKeyInput = ref(false);
        const apiKeyInput = ref('');
        const cameraInputRef = ref(null);
        const albumInputRef = ref(null);

        const initForm = () => {
            if (props.mode === 'create') {
                form.id = 'ing_' + Date.now();
                form.name = props.initialName || '';
                form.brand = '';
                form.category = 'proteins';
                form.displayBasis = '100g';
                form.servingSize = 100;
                form.servingUnit = 'g';
                form.stock = true;
                form.storageZones = ['fridge'];
                form.preferredStores = ['全聯'];
                form.price = 0;
                form.priceUnit = '包';
                form.per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
                form.perServing = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
            } else if (props.initialIngredient) {
                const ing = props.initialIngredient;
                form.id = ing.id;
                form.name = ing.name || (ing.id === 'whey_protein' ? '乳清蛋白粉 (舊版標籤)' : ing.id);
                form.brand = ing.brand || '';
                form.category = ing.category || 'proteins';
                const isSauceOrOil = ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category);
                form.servingSize = Number(ing.servingSize) || (isSauceOrOil ? 10 : 100);
                form.servingUnit = ing.servingUnit || 'g';
                form.stock = props.engine.checkStock(ing.id);
                form.storageZones = Array.isArray(ing.storageZones) ? [...ing.storageZones] : ['fridge'];
                form.preferredStores = Array.isArray(ing.preferredStores) ? [...ing.preferredStores] : ['全聯'];
                form.price = ing.price || 0;
                form.priceUnit = ing.priceUnit || '包';

                // 營養數值回填
                if (ing.per100g) {
                    form.per100g = {
                        kcal: Number(ing.per100g.kcal) || 0,
                        protein: Number(ing.per100g.protein) || 0,
                        carbs: Number(ing.per100g.carbs) || 0,
                        fat: Number(ing.per100g.fat) || 0,
                        sodium: Number(ing.per100g.sodium) || 0
                    };
                } else if (ing.perUnit) {
                    form.per100g = {
                        kcal: Math.round((ing.perUnit.kcal || 0) * 1.8),
                        protein: Math.round((ing.perUnit.protein || 0) * 1.8 * 10) / 10,
                        carbs: Math.round((ing.perUnit.carbs || 0) * 1.8 * 10) / 10,
                        fat: Math.round((ing.perUnit.fat || 0) * 1.8 * 10) / 10,
                        sodium: Math.round((ing.perUnit.sodium || 0) * 1.8)
                    };
                } else {
                    form.per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
                }

                if (ing.perServing) {
                    form.perServing = {
                        kcal: Number(ing.perServing.kcal) || 0,
                        protein: Number(ing.perServing.protein) || 0,
                        carbs: Number(ing.perServing.carbs) || 0,
                        fat: Number(ing.perServing.fat) || 0,
                        sodium: Number(ing.perServing.sodium) || 0
                    };
                } else {
                    calcServingFrom100g();
                }

                form.displayBasis = isSauceOrOil ? 'serving' : '100g';
            }
            photo.url = null;
            photo.isAnalyzing = false;
            photo.status = 'idle';
            photo.message = '';
        };

        watch(() => props.isOpen, (newVal) => {
            if (newVal) initForm();
        }, { immediate: true });

        watch(() => props.initialIngredient, () => {
            if (props.isOpen) initForm();
        });

        // 雙軌換算邏輯
        const calcServingFrom100g = () => {
            const isSauceOrOil = ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category);
            const size = Number(form.servingSize) || (isSauceOrOil ? 10 : 100);
            const ratio = size / 100;
            form.perServing.kcal = Math.round((form.per100g.kcal || 0) * ratio);
            form.perServing.protein = Math.round((form.per100g.protein || 0) * ratio * 10) / 10;
            form.perServing.carbs = Math.round((form.per100g.carbs || 0) * ratio * 10) / 10;
            form.perServing.fat = Math.round((form.per100g.fat || 0) * ratio * 10) / 10;
            form.perServing.sodium = Math.round((form.per100g.sodium || 0) * ratio * 10) / 10;
        };

        const calc100gFromServing = () => {
            const isSauceOrOil = ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category);
            const size = Number(form.servingSize) || (isSauceOrOil ? 10 : 100);
            if (size <= 0) return;
            const ratio = 100 / size;
            form.per100g.kcal = Math.round((form.perServing.kcal || 0) * ratio);
            form.per100g.protein = Math.round((form.perServing.protein || 0) * ratio * 10) / 10;
            form.per100g.carbs = Math.round((form.perServing.carbs || 0) * ratio * 10) / 10;
            form.per100g.fat = Math.round((form.perServing.fat || 0) * ratio * 10) / 10;
            form.per100g.sodium = Math.round((form.perServing.sodium || 0) * ratio * 10) / 10;
        };

        const on100gInput = () => {
            calcServingFrom100g();
        };

        const onServingInput = () => {
            calc100gFromServing();
        };

        const onServingSizeChange = () => {
            if (form.displayBasis === 'serving') {
                calc100gFromServing();
            } else {
                calcServingFrom100g();
            }
        };

        // 存放分區與通路開關
        const toggleStorageZone = (zoneKey) => {
            const idx = form.storageZones.indexOf(zoneKey);
            if (idx > -1) {
                if (form.storageZones.length > 1) form.storageZones.splice(idx, 1);
            } else {
                form.storageZones.push(zoneKey);
            }
        };

        const isStorageZoneSelected = (zoneKey) => form.storageZones.includes(zoneKey);

        const togglePreferredStore = (store) => {
            const idx = form.preferredStores.indexOf(store);
            if (idx > -1) {
                if (form.preferredStores.length > 1) form.preferredStores.splice(idx, 1);
            } else {
                form.preferredStores.push(store);
            }
        };

        const isStoreSelected = (store) => form.preferredStores.includes(store);

        const isInCart = computed(() => {
            if (!form.id) return false;
            return props.engine.isInShoppingList(form.id);
        });

        const toggleCart = () => {
            if (!form.id) return;
            props.engine.toggleShoppingList(form.id);
        };

        // API Key 管理
        const refreshSavedApiKey = () => {
            const saved = localStorage.getItem('gemini_api_key') || localStorage.getItem('GEMINI_API_KEY') || '';
            apiKeyInput.value = saved;
            return saved;
        };

        const saveCustomApiKey = () => {
            const k = (apiKeyInput.value || '').trim();
            if (!k) {
                alert('請輸入有效的 Gemini API Key');
                return;
            }
            localStorage.setItem('gemini_api_key', k);
            localStorage.setItem('GEMINI_API_KEY', k);
            showApiKeyInput.value = false;
            alert('✨ Gemini API Key 已成功儲存！');
        };

        onMounted(() => {
            refreshSavedApiKey();
        });

        // 圖片壓縮輔助
        const compressImage = (dataUrl, maxWidth = 800, maxHeight = 800, quality = 0.8) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
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
                img.src = dataUrl;
            });
        };

        // Gemini Vision OCR 核心
        const callClientGeminiNutritionOCR = async (compressedDataUrl, apiKey) => {
            const b64Data = compressedDataUrl.split(',')[1];
            const mimeType = compressedDataUrl.split(',')[0].split(':')[1].split(';')[0] || 'image/jpeg';
            const cleanB64 = b64Data.replace(/[\n\r\s]/g, '');

            const prompt = `你是一個專業的食品營養標示 OCR 與食材萃取專家。
請仔細辨識這張食品外包裝或營養標示照片，萃取以下資訊並輸出純 JSON 格式（不要有 markdown 標記或其他文字）：
{
  "name": "食材或商品名稱 (繁體中文)",
  "brand": "品牌名稱 (若無可留空)",
  "servingSize": 每一份量數值 (純數字，例如 10 或 30),
  "servingUnit": "g" 或 "mL",
  "perServing": {
    "kcal": 每一份量熱量(大卡，數字),
    "protein": 每一份量蛋白質(g，數字),
    "carbs": 每一份量碳水化合物(g，數字),
    "fat": 每一份量脂肪(g，數字),
    "sodium": 每一份量鈉(mg，數字)
  },
  "per100g": {
    "kcal": 每100g熱量(大卡，數字),
    "protein": 每100g蛋白質(g，數字),
    "carbs": 每100g碳水化合物(g，數字),
    "fat": 每100g脂肪(g，數字),
    "sodium": 每100g鈉(mg，數字)
  }
}`;

            const payload = {
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: cleanB64 } }] }]
            // 🌟 使用 Google 官方最穩定高配額端點 gemini-1.5-flash，杜絕 0.1 秒連環連發觸發 429 封鎖
            const endpoints = [
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
            ];

            let lastError = '';

            for (let i = 0; i < endpoints.length; i++) {
                const endpoint = endpoints[i];
                try {
                    const fetchUrl = `${endpoint}?key=${encodeURIComponent(apiKey)}`;
                    const resp = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                        body: JSON.stringify(payload)
                    });

                    const rawResponseText = await resp.text();
                    let resData = null;
                    try { resData = JSON.parse(rawResponseText); } catch (e) {}

                    if (resp.ok && resData) {
                        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            return { status: 'success', result: parsed };
                        }
                    } else {
                        const errMsg = resData?.error?.message || resp.statusText || rawResponseText.slice(0, 150);
                        if (resp.status === 429) {
                            return { status: 'rate_limited', message: `Google API 額度限制 (429)：若剛剛已等待仍出現此訊息，代表此金鑰今日免費總配額已用盡，請更換金鑰。` };
                        } else if (resp.status === 400 || resp.status === 403) {
                            if (errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('permission')) {
                                return { status: 'invalid_key', message: `Gemini API Key 驗證未通過 (${errMsg})` };
                            }
                        } else if (resp.status === 503 && i === 0) {
                            console.warn("503 Overloaded, waiting 800ms for fallback...");
                            await new Promise(r => setTimeout(r, 800));
                            continue;
                        }
                        lastError = `HTTP ${resp.status}: ${errMsg}`;
                        break;
                    }
                } catch (e) {
                    lastError = e.message || String(e);
                    break;
                }
            }

            return { status: 'error', message: `Gemini API 連線未完成 (${lastError})` };
        };

        const analyzePhotoDirectly = async (compressedDataUrl, apiKey, fileName = '') => {
            photo.isAnalyzing = true;
            photo.status = 'analyzing';
            photo.message = '正在辨識營養標示與自動換算數據，請稍候 3~5 秒...';

            let data = null;
            if (!apiKey) {
                data = {
                    status: 'need_api_key',
                    message: '未設定 Gemini API Key，請點擊下方設定金鑰，或直接手動填寫。'
                };
            } else {
                data = await callClientGeminiNutritionOCR(compressedDataUrl, apiKey);
            }

            photo.isAnalyzing = false;

            if (data && data.status === 'success' && data.result) {
                const resData = data.result;
                if (props.mode === 'create' || !form.name) {
                    if (resData.name) form.name = resData.name;
                }
                if (resData.brand && !form.brand) form.brand = resData.brand;
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
                    calcServingFrom100g();
                }

                // 自動分類判定
                const autoCategory = props.engine.detectNutrientCategory(
                    resData.name || form.name,
                    form.per100g || form.perServing
                );
                form.category = autoCategory || resData.category || 'sauces';
                form.displayBasis = ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category) ? 'serving' : '100g';

                photo.status = 'success';
                photo.message = `✨ 已成功帶入【${resData.name || form.name || '食材'}】的熱量與營養成份！`;
            } else {
                photo.status = 'error';
                photo.message = `${data?.message || 'AI 辨識未完成'}，請在下方直接手動填寫。`;
                if (data?.status === 'need_api_key' || data?.status === 'invalid_key') {
                    showApiKeyInput.value = true;
                }
                if (fileName && !['image', 'photo', 'camera', 'IMG', 'DCIM'].some(k => fileName.includes(k))) {
                    if (!form.name) form.name = fileName;
                }
            }
        };

        const triggerCamera = () => {
            if (cameraInputRef.value) cameraInputRef.value.click();
        };

        const triggerAlbum = () => {
            if (albumInputRef.value) albumInputRef.value.click();
        };

        const onFilePicked = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawDataUrl = e.target.result;
                    const compressedDataUrl = await compressImage(rawDataUrl, 800, 800, 0.8);
                    photo.url = compressedDataUrl;
                    const apiKey = refreshSavedApiKey();
                    const fileName = file.name ? file.name.split('.')[0].replace(/[-_]/g, ' ') : '';
                    await analyzePhotoDirectly(compressedDataUrl, apiKey, fileName);
                };
                reader.readAsDataURL(file);
                event.target.value = '';
            }
        };

        // 提交處理
        const handleSave = async () => {
            const cleanName = (form.name || '').trim();
            if (!cleanName) {
                alert('請輸入食材名稱');
                return;
            }

            const targetId = form.id || 'ing_' + Date.now();
            const ingData = {
                id: targetId,
                name: cleanName,
                brand: form.brand || '',
                category: form.category,
                servingSize: Number(form.servingSize) || 10,
                servingUnit: form.servingUnit || 'g',
                storageZones: [...form.storageZones],
                preferredStores: [...form.preferredStores],
                price: Number(form.price) || 0,
                priceUnit: form.priceUnit || '包',
                per100g: {
                    kcal: Number(form.per100g.kcal) || 0,
                    protein: Number(form.per100g.protein) || 0,
                    carbs: Number(form.per100g.carbs) || 0,
                    fat: Number(form.per100g.fat) || 0,
                    sodium: Number(form.per100g.sodium) || 0
                },
                perServing: {
                    kcal: Number(form.perServing.kcal) || 0,
                    protein: Number(form.perServing.protein) || 0,
                    carbs: Number(form.perServing.carbs) || 0,
                    fat: Number(form.perServing.fat) || 0,
                    sodium: Number(form.perServing.sodium) || 0
                }
            };

            // 儲存至總庫
            if (props.engine?.saveIngredient) {
                await props.engine.saveIngredient(ingData);
            }

            // 更新庫存狀態
            if (props.engine?.toggleStock) {
                await props.engine.toggleStock(targetId, form.stock);
            } else if (props.engine?.updateStock) {
                await props.engine.updateStock(targetId, form.stock);
            }

            const autoAddToDish = (props.context === 'calculator_create' || props.context === 'calculator');
            emit('saved', ingData, autoAddToDish);
            emit('close');
        };

        const handleDelete = async () => {
            if (confirm(`確定要從智慧冰箱總庫【永久刪除】「${form.name}」嗎？\n（此操作將無法復原）`)) {
                await props.engine.deleteIngredient(form.id);
                emit('deleted', form.id);
                emit('close');
            }
        };

        const handleRemoveFromDish = () => {
            emit('removeFromDish', form.id);
            emit('close');
        };

        return {
            form,
            photo,
            showApiKeyInput,
            apiKeyInput,
            saveCustomApiKey,
            cameraInputRef,
            albumInputRef,
            triggerCamera,
            triggerAlbum,
            onFilePicked,
            on100gInput,
            onServingInput,
            onServingSizeChange,
            toggleStorageZone,
            isStorageZoneSelected,
            togglePreferredStore,
            isStoreSelected,
            isInCart,
            toggleCart,
            handleSave,
            handleDelete,
            handleRemoveFromDish
        };
    },
    template: `
        <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
            <div class="drawer-content" style="max-height: 90vh; padding: 20px 20px 28px 20px; position: relative; overflow-y: auto; display: flex; flex-direction: column;">
                
                <!-- 隱藏的拍照 / 相簿 input -->
                <input type="file" ref="cameraInputRef" accept="image/*" capture="environment" style="display: none;" @change="onFilePicked">
                <input type="file" ref="albumInputRef" accept="image/*" style="display: none;" @change="onFilePicked">

                <!-- 🤖 AI 辨識中遮罩 -->
                <div v-if="photo.isAnalyzing" 
                     style="position: absolute; inset: 0; background: rgba(255, 255, 255, 0.85); z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(4px); border-radius: inherit;">
                    <div style="width: 48px; height: 48px; border: 4px solid #E5E7EB; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 14px;"></div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--color-text-main);">AI 正在辨識營養標示...</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 4px;">讀取熱量、蛋白質、碳水與脂肪中</div>
                </div>

                <!-- 1. 頂部標題列：品名輸入 + 庫存切換開關 + ✕ 關閉按鈕 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 12px; gap: 8px;">
                    <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">🥗</span>
                        <input type="text" 
                               v-model="form.name" 
                               :placeholder="mode === 'create' ? '輸入食材名稱 (如：鮮乳、番茄)' : '食材名稱'" 
                               style="font-size: 1.1rem; font-weight: 700; border: none; border-bottom: 1.5px solid var(--color-border); outline: none; background: transparent; padding: 2px 4px; width: 100%; color: var(--color-text-main);">
                    </div>
                    
                    <button class="capsule" 
                            :class="form.stock ? 'selected' : 'disabled'" 
                            style="font-size: 0.8rem; font-weight: 600; padding: 5px 10px; cursor: pointer; flex-shrink: 0;"
                            @click="form.stock = !form.stock">
                        {{ form.stock ? '❄️ 有庫存' : '🛒 無庫存' }}
                    </button>
                    
                    <button class="btn-icon" @click="$emit('close')" style="border: none; font-size: 1.1rem; padding: 4px 8px; color: var(--color-text-muted);">✕</button>
                </div>

                <!-- 2. AI 圖片辨識狀態與預覽卡片 -->
                <div v-if="photo.url" style="margin-bottom: 16px; background: #FFFFFF; border: 1.5px solid var(--color-mint-active); border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 52px; height: 52px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #F3F4F6;">
                        <img :src="photo.url" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                    </div>
                    <div style="flex: 1;">
                        <div v-if="photo.status === 'success'" style="font-size: 0.85rem; color: #065F46; font-weight: 700;">
                            {{ photo.message || '✨ 已自動帶入營養數據！' }}
                        </div>
                        <div v-else-if="photo.status === 'error'" style="font-size: 0.85rem; color: #DC2626; font-weight: 600;">
                            {{ photo.message }}
                        </div>
                    </div>
                </div>

                <!-- API Key 輸入列 (折疊) -->
                <div v-if="showApiKeyInput" style="margin-bottom: 16px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 12px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #B45309; margin-bottom: 6px;">🔑 設定 Google Gemini API Key：</div>
                    <div style="display: flex; gap: 6px;">
                        <input type="password" v-model="apiKeyInput" placeholder="貼上 AI Studio 金鑰..." style="flex: 1; padding: 6px 10px; border: 1px solid #FDE68A; border-radius: 6px; font-size: 0.85rem;">
                        <button class="btn-primary" @click="saveCustomApiKey" style="padding: 6px 12px; font-size: 0.8rem;">儲存</button>
                    </div>
                </div>

                <!-- 3. 營養成份規格：純文字俐落排版 + 雙軌自動換算 -->
                <div style="background: #FAF8F5; border: 1px solid var(--color-border); border-radius: 14px; padding: 14px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight: 700; font-size: 0.9rem; color: var(--color-text-main);">營養成份規格：</span>
                        <div style="display: flex; background: #E5E7EB; padding: 2px; border-radius: 8px; gap: 2px;">
                            <button @click="form.displayBasis = '100g'" 
                                    :style="{ background: form.displayBasis === '100g' ? 'var(--color-primary)' : 'transparent', color: form.displayBasis === '100g' ? '#FFF' : '#4B5563', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', border: 'none', cursor: 'pointer' }">
                                每 100g/mL
                            </button>
                            <button @click="form.displayBasis = 'serving'" 
                                    :style="{ background: form.displayBasis === 'serving' ? 'var(--color-primary)' : 'transparent', color: form.displayBasis === 'serving' ? '#FFF' : '#4B5563', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', border: 'none', cursor: 'pointer' }">
                                按單份
                            </button>
                        </div>
                    </div>

                    <!-- 份量基準輸入 (僅在「按單份」模式下展示) -->
                    <div v-if="form.displayBasis === 'serving'" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.85rem; background: #FFFFFF; padding: 8px 12px; border-radius: 8px; border: 1px dashed var(--color-primary);">
                        <span style="font-weight: 700; color: var(--color-text-main);">單份份量：</span>
                        <input type="number" v-model.number="form.servingSize" @input="onServingSizeChange" style="width: 54px; padding: 3px 6px; border: 1px solid var(--color-border); border-radius: 6px; font-weight: 700; text-align: right; background: #FAF8F5;">
                        <span style="font-weight: 600; color: var(--color-text-muted);">{{ form.servingUnit || 'g' }}</span>
                    </div>

                    <!-- 營養素數值輸入格 (純文字，無表情圖示) -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.85rem;">
                        <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-weight: 600;">熱量</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" 
                                       v-if="form.displayBasis === '100g'"
                                       v-model.number="form.per100g.kcal" 
                                       @input="on100gInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <input type="number" 
                                       v-else
                                       v-model.number="form.perServing.kcal" 
                                       @input="onServingInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <span style="font-size: 0.75rem; color: var(--color-text-muted);">kcal</span>
                            </div>
                        </div>

                        <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-weight: 600;">蛋白質</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" 
                                       v-if="form.displayBasis === '100g'"
                                       v-model.number="form.per100g.protein" 
                                       @input="on100gInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <input type="number" 
                                       v-else
                                       v-model.number="form.perServing.protein" 
                                       @input="onServingInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                            </div>
                        </div>

                        <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-weight: 600;">碳水</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" 
                                       v-if="form.displayBasis === '100g'"
                                       v-model.number="form.per100g.carbs" 
                                       @input="on100gInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <input type="number" 
                                       v-else
                                       v-model.number="form.perServing.carbs" 
                                       @input="onServingInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                            </div>
                        </div>

                        <div style="background: #FFF; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-weight: 600;">脂肪</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" 
                                       v-if="form.displayBasis === '100g'"
                                       v-model.number="form.per100g.fat" 
                                       @input="on100gInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <input type="number" 
                                       v-else
                                       v-model.number="form.perServing.fat" 
                                       @input="onServingInput" 
                                       style="width: 54px; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; font-weight: 700; text-align: right;">
                                <span style="font-size: 0.75rem; color: var(--color-text-muted);">g</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. 食材分類下拉選單 -->
                <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 14px;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 6px;">
                        食材分類：
                    </div>
                    <select v-model="form.category" class="select-box" style="width: 100%; padding: 8px 12px; font-size: 0.9rem;">
                        <option value="proteins">🥩 蛋白質</option>
                        <option value="veggies">🥦 蔬菜水果</option>
                        <option value="carbs">🍚 碳水主食</option>
                        <option value="sauces">🧂 油脂/調味/其他</option>
                    </select>
                </div>

                <!-- 5. 存放分區 (冷藏/冷凍/常溫) -->
                <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 14px;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">
                        存放分區：
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button v-for="z in [{key:'fridge', label:'冷藏區'}, {key:'freezer', label:'冷凍區'}, {key:'pantry', label:'常溫區'}]" 
                                :key="z.key"
                                class="capsule"
                                :class="isStorageZoneSelected(z.key) ? 'selected' : 'in-stock'"
                                style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                @click="toggleStorageZone(z.key)">
                            {{ z.label }}
                        </button>
                    </div>
                </div>

                <!-- 6. 常用採買通路 + 🛒 一鍵採買按鈕 -->
                <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">常用採買通路：</span>
                        <button class="btn-icon" 
                                @click="toggleCart" 
                                style="padding: 6px 10px; border-radius: var(--radius-full); border: 1.5px solid var(--color-border); cursor: pointer; transition: all 0.15s ease;"
                                :style="{ background: isInCart ? 'var(--color-mint-active)' : '#FFFFFF', color: isInCart ? '#FFFFFF' : 'var(--color-cart-gray)', borderColor: isInCart ? 'var(--color-mint-active)' : 'var(--color-border)' }"
                                :title="isInCart ? '已在採買清單 (點擊移除)' : '加入採買清單'">
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
                                :class="isStoreSelected(store) ? 'selected' : 'in-stock'"
                                style="padding: 4px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                                @click="togglePreferredStore(store)">
                            {{ store }}
                        </button>
                    </div>
                </div>

                <!-- 🟠 第 1 頁專屬：右下角系統黃浮動正圓鈕【從料理移除】(FAB: 碗 ✕ 往右弧度箭頭 款式 1，純平無光暈) -->
                <div v-if="context === 'calculator' && mode === 'edit'"
                     @click="handleRemoveFromDish"
                     title="從此料理移除"
                     style="position: absolute; right: 18px; bottom: 68px; width: 52px; height: 52px; border-radius: 50%; background: #FFCA60; display: flex; align-items: center; justify-content: center; z-index: 40; cursor: pointer; border: none; box-shadow: none; transition: transform 0.15s ease;">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                        <!-- 溫潤料理碗 -->
                        <path d="M4 12c0 4.5 3.5 7.5 8 7.5s8-3 8-7.5H4z"></path>
                        <line x1="8.5" y1="19.5" x2="15.5" y2="19.5"></line>
                        <!-- 向右上方拋出的流暢弧線箭頭 (精確右移 2px) -->
                        <path d="M9 8c2.5-3.5 6.5-4 12-2"></path>
                        <polyline points="18 3 21 6 17.5 8.5"></polyline>
                    </svg>
                </div>

                <!-- 7. 底部固定無縫單排 4 等分操作列 (iOS Tab Bar 樣式) -->
                <div style="display: flex; justify-content: space-around; align-items: center; margin-top: auto; padding: 10px 0 6px 0; border-top: 1px solid #E5E7EB; background: #FFFFFF; width: 100%;">
                    <div @click="triggerCamera" style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; color: #4B5563; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                            <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                        <span>AI 拍</span>
                    </div>

                    <div @click="triggerAlbum" style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; color: #4B5563; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span>相簿</span>
                    </div>

                    <div v-if="mode === 'edit'" @click="handleDelete" style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; color: #EF4444; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>刪除</span>
                    </div>
                    <div v-else @click="$emit('close')" style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; color: #6B7280; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        <span>取消</span>
                    </div>

                    <div @click="handleSave" style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; color: #19585C; font-size: 0.72rem; font-weight: 700; cursor: pointer; padding: 4px 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        <span>{{ (context === 'calculator_create') ? '加入料理' : '儲存' }}</span>
                    </div>
                </div>
            </div>
        </div>
    `
};

export default IngredientDetailModal;
