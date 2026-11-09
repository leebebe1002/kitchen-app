import { labelConsistencyIssue, withNutritionEvidence, evidenceSnapshot, nutrientNumber, nutrientKeys, completeNutrients, nutritionEvidenceText } from '../utils/NutritionEvidence.js?v=20261109_FK21_THREE_FOODS_V1';
import { reviewNutritionLabelOCR } from '../utils/NutritionLabelOCR.js?v=20261109_FK21_THREE_FOODS_V1';
const { ref, reactive, computed, watch, onMounted, nextTick } = Vue;
import { findSimilarIngredients } from '../utils/IngredientMatcher.js?v=20260918_FIX_STATE_V2';
import { CANONICAL_STORES, normalizeStoreName, normalizeStoreList } from '../utils/StoreNormalizer.js?v=20260926_FK004_STORE_SYNC';

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
        const modalMode = ref(props.mode);
        const previewIngredient = ref(null);
        const selectedTargetId = ref('');
        const isSaving = ref(false);
        const previewNutritionText = computed(() => nutritionEvidenceText(withNutritionEvidence(previewIngredient.value)));
        let draftScrollTop = 0;
        const nutritionChanged = ref(false);
        const evidenceConfirmed = ref(false);
        const showLabelReview = ref(false);
        const evidenceSpec = ref('');
        const evidenceBasis = ref('unknown');
        const evidenceUnit = ref('g');
        const evidenceSource = ref('');
        const gramsPerUnit = ref(null);
        const sourceEvidence = computed(() => withNutritionEvidence(props.initialIngredient)?.nutritionEvidence);
        const sourceText = computed(() => nutritionEvidenceText(withNutritionEvidence(props.initialIngredient)));
        const photoUnitChanged = computed(() => photo.status === 'success'
            && ['g', 'ml'].includes(props.initialIngredient?.unitLabel)
            && ['g', 'ml'].includes(evidenceUnit.value)
            && props.initialIngredient.unitLabel !== evidenceUnit.value);
        const hasUnitNutrition = computed(() => !!props.engine.getIngredientById(form.id)?.perUnit);
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
                kcal: null,
                protein: null,
                carbs: null,
                fat: null,
                sodium: null
            },
            perServing: {
                kcal: null,
                protein: null,
                carbs: null,
                fat: null,
                sodium: null
            }
        });

        const photo = reactive({
            url: null,
            isAnalyzing: false,
            status: 'idle', // 'idle' | 'analyzing' | 'success' | 'error'
            message: '',
            notices: []
        });

        let photoRevision = 0;
        const showApiKeyInput = ref(false);
        const apiKeyInput = ref('');
        const cameraInputRef = ref(null);
        const albumInputRef = ref(null);
        const drawerContentRef = ref(null);

        // The drawer, not the page, owns scrolling on iPhone/PWA.
        // Wait for Vue to render photo/OCR results before resetting its position.
        const scrollReviewToTop = async (revision) => {
            await nextTick();
            if (revision !== photoRevision || !props.isOpen) return;
            if (!previewIngredient.value && drawerContentRef.value) drawerContentRef.value.scrollTop = 0;
        };

        const initForm = () => {
            photoRevision++;
            previewIngredient.value = null;
            selectedTargetId.value = '';
            modalMode.value = props.mode;
            photo.url = null;
            nutritionChanged.value = false;
            evidenceConfirmed.value = false;
            showLabelReview.value = false;
            evidenceSpec.value = props.initialIngredient?.nutritionEvidence?.specification || '';
            evidenceBasis.value = props.initialIngredient?.weightBasis || 'unknown';
            evidenceUnit.value = props.initialIngredient?.unitLabel || 'g';
            evidenceSource.value = props.initialIngredient?.nutritionEvidence?.note || '';
            gramsPerUnit.value = props.initialIngredient?.gramsPerUnit || null;
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
                form.priorityTier = 1;
                form.per100g = { kcal: null, protein: null, carbs: null, fat: null, sodium: null };
                form.perServing = { kcal: null, protein: null, carbs: null, fat: null, sodium: null };
            } else if (props.initialIngredient) {
                const ing = props.initialIngredient;
                form.id = ing.id;
                form.name = ing.name || (ing.id === 'whey_protein' ? '乳清蛋白粉 (舊版標籤)' : ing.id);
                form.brand = ing.brand || '';
                form.category = ing.category || 'proteins';
                form.priorityTier = ing.priorityTier || 1;
                const isSauceOrOil = ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category);
                form.servingSize = Number(ing.servingSize) || (isSauceOrOil ? 10 : 100);
                form.servingUnit = ing.servingUnit || 'g';
                form.stock = props.engine.checkStock(ing.id);
                form.storageZones = Array.isArray(ing.storageZones) ? [...ing.storageZones] : ['fridge'];
                const rawStores = Array.isArray(ing.preferredStores) 
                    ? ing.preferredStores 
                    : (ing.preferredStore ? [ing.preferredStore] : ['全聯']);
                form.preferredStores = normalizeStoreList(rawStores);
                if (form.preferredStores.length === 0) form.preferredStores = ['全聯'];
                form.price = ing.price || 0;
                form.priceUnit = ing.priceUnit || '包';

                // 營養數值回填
                if (ing.per100g) {
                    form.per100g = {
                        kcal: nutrientNumber(ing.per100g.kcal),
                        protein: nutrientNumber(ing.per100g.protein),
                        carbs: nutrientNumber(ing.per100g.carbs),
                        fat: nutrientNumber(ing.per100g.fat),
                        sodium: nutrientNumber(ing.per100g.sodium)
                    };
                } else {
                    form.per100g = { kcal: null, protein: null, carbs: null, fat: null, sodium: null };
                }

                if (ing.perServing) {
                    form.perServing = {
                        kcal: nutrientNumber(ing.perServing.kcal),
                        protein: nutrientNumber(ing.perServing.protein),
                        carbs: nutrientNumber(ing.perServing.carbs),
                        fat: nutrientNumber(ing.perServing.fat),
                        sodium: nutrientNumber(ing.perServing.sodium)
                    };
                } else {
                    calcServingFrom100g();
                }

                form.displayBasis = isSauceOrOil ? 'serving' : '100g';
                if (ing.perUnit) {
                    form.perServing = { ...ing.perUnit };
                    form.servingSize = 1;
                    form.servingUnit = ing.unitLabel;
                    form.displayBasis = 'serving';
                }
                photo.url = ing.photoUrl || ing.photo || null;
            } else {
                photo.url = null;
            }
            photo.isAnalyzing = false;
            photo.status = 'idle';
            photo.message = '';
            photo.notices = [];
        };

        watch(() => props.isOpen, (newVal) => {
            if (newVal) initForm();
            else { photoRevision++; previewIngredient.value = null; photo.url = null; photo.isAnalyzing = false; }
        }, { immediate: true });

        watch(() => props.initialIngredient, () => {
            if (props.isOpen) initForm();
        });

        // 雙軌換算邏輯
        function scaleNutrients(values, ratio) {
            return Object.fromEntries(nutrientKeys.map(key => [key, nutrientNumber(values?.[key]) === null
                || !Number.isFinite(ratio) || ratio <= 0 ? null : Math.round(Number(values[key]) * ratio * 10) / 10]));
        }
        function calcServingFrom100g() {
            const sameUnit = form.servingUnit?.toLowerCase() === (evidenceUnit.value === 'ml' ? 'ml' : 'g');
            form.perServing = scaleNutrients(form.per100g, sameUnit ? Number(form.servingSize) / 100 : NaN);
        }
        function calc100gFromServing() {
            const sameUnit = form.servingUnit?.toLowerCase() === (evidenceUnit.value === 'ml' ? 'ml' : 'g');
            form.per100g = scaleNutrients(form.perServing, sameUnit ? 100 / Number(form.servingSize) : NaN);
        }
        watch(() => JSON.stringify([form.name, form.brand, form.per100g, form.perServing, form.servingSize,
            form.servingUnit, evidenceSpec.value, evidenceBasis.value, evidenceUnit.value, gramsPerUnit.value, evidenceSource.value]),
            () => { evidenceConfirmed.value = false; }, {flush:'sync'});

        const on100gInput = () => {
            nutritionChanged.value = true;
            calcServingFrom100g();
        };

        const onServingInput = () => {
            nutritionChanged.value = true;
            if (!hasUnitNutrition.value) calc100gFromServing();
        };

        const onServingSizeChange = () => {
            nutritionChanged.value = true;
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
            const canonicalStore = normalizeStoreName(store);
            form.preferredStores = normalizeStoreList(form.preferredStores);
            const idx = form.preferredStores.indexOf(canonicalStore);
            if (idx > -1) {
                if (form.preferredStores.length > 1) form.preferredStores.splice(idx, 1);
            } else {
                form.preferredStores.push(canonicalStore);
            }
            form.preferredStores = normalizeStoreList(form.preferredStores);
        };

        const isStoreSelected = (store) => {
            const canonicalStore = normalizeStoreName(store);
            return form.preferredStores.includes(canonicalStore);
        };

        const isInCart = computed(() => {
            if (!form.id || !props.engine) return false;
            return props.engine.isInShoppingList(form.id);
        });

        const toggleCart = async () => {
            if (!form.id || !props.engine) return;
            await props.engine.toggleShoppingList({
                targetId: form.id,
                name: form.name,
                type: 'food',
                preferredStores: form.preferredStores,
                store: form.preferredStores?.[0] || '全聯'
            });
        };

        // API Key 管理
        const refreshSavedApiKey = () => {
            const saved = localStorage.getItem('gemini_api_key') || localStorage.getItem('GEMINI_API_KEY') || '';
            apiKeyInput.value = saved;
            return saved;
        };

        watch(() => props.mode, (newVal) => {
            modalMode.value = newVal;
        });

        // 🔍 即時名稱去重與模糊比對
        const matchingResults = computed(() => {
            if (modalMode.value !== 'create') return { exactMatch: null, similarMatches: [] };
            const clean = (form.name || '').trim();
            if (!clean || clean.length < 1) return { exactMatch: null, similarMatches: [] };
            const allIngs = props.engine?.data?.ingredients || [];
            return findSimilarIngredients(clean, allIngs, form.id || null);
        });

        const duplicateMatch = computed(() => matchingResults.value.exactMatch);
        const similarMatches = computed(() => matchingResults.value.similarMatches);

        const matchCandidates = computed(() => duplicateMatch.value ? [duplicateMatch.value]
            : similarMatches.value.map(match => match.ingredient));
        const replacementTarget = computed(() => matchCandidates.value.find(item => item.id === selectedTargetId.value)
            || (matchCandidates.value.length === 1 ? matchCandidates.value[0] : null));
        watch(() => form.name, () => { selectedTargetId.value = ''; });

        // Preview never mutates the draft; even in-flight OCR belongs to that same draft.
        const switchToExisting = async (existingIng) => {
            if (!existingIng || isSaving.value) return;
            draftScrollTop = drawerContentRef.value?.scrollTop || 0;
            previewIngredient.value = existingIng;
            await nextTick();
            if (drawerContentRef.value) drawerContentRef.value.scrollTop = 0;
        };
        const returnToDraft = async () => {
            previewIngredient.value = null;
            await nextTick();
            if (drawerContentRef.value) drawerContentRef.value.scrollTop = draftScrollTop;
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
缺漏或無法辨識欄位必須輸出 null，禁止猜測或補 0。請另回傳 specification（商品規格）及 weightBasis（raw/cooked/dry/as_sold/unknown）。每100g 不得混用每100mL，servingUnit 必須如實辨識。僅轉錄照片清楚印出的數字，不自行換算或補 0；若圖片只標每份，per100g 五項必須全為 null。
請仔細辨識這張食品外包裝或營養標示照片，萃取以下資訊並輸出純 JSON 格式（不要有 markdown 標記或其他文字）：
{
  "name": "食材或商品名稱 (繁體中文)",
  "brand": "品牌名稱 (若無可留空)",
  "specification": "實際商品的淨容量、口味或版本；每包裝份數、每份容量、茶匙等營養標示資訊不可填入商品規格；照片沒有則空字串",
  "weightBasis": "as_sold",
  "servingSize": 每一份量數值 (純數字，例如 10 或 30),
  "servingUnit": "g" 或 "mL"（沒有印出每份則為 null）,
  "per100Unit": "g" 或 "mL"（只有照片清楚印出每100g或每100mL時才填，否則 null）,
  "perServing": {
    "kcal": 每一份量熱量(大卡，數字),
    "protein": 每一份量蛋白質(g，數字),
    "carbs": 每一份量碳水化合物(g，數字),
    "fat": 每一份量脂肪(g，數字),
    "sodium": 每一份量鈉(mg，數字)
  },
  "per100g": {
    "kcal": 包裝上每100g或100mL的熱量(大卡，無印刷則 null),
    "protein": 包裝上每100g或100mL的蛋白質(g，無印刷則 null),
    "carbs": 包裝上每100g或100mL的碳水(g，無印刷則 null),
    "fat": 包裝上每100g或100mL的脂肪(g，無印刷則 null),
    "sodium": 包裝上每100g或100mL的鈉(mg，無印刷則 null)
  }
}`;

            const payload = {
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: cleanB64 } }] }]
            };
            // 🌟 Google 官方高可用模型階梯 (Lite 首選極速低負載，徹底避免 503 伺服器尖峰壅塞)
            const endpoints = [
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent'
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

        const analyzePhotoDirectly = async (compressedDataUrl, apiKey, fileName = '', revision = photoRevision) => {
            if (revision !== photoRevision || !props.isOpen) return;
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

            if (revision !== photoRevision || !props.isOpen) return;
            photo.isAnalyzing = false;

            if (data && data.status === 'success' && data.result) {
                if (hasUnitNutrition.value) {
                    photo.status = 'error';
                    photo.message = '此食材按顆／包計算，請依每單位標示手動填寫；不能從每百克推算。';
                    return;
                }
                const resData = data.result;
                const reviewed = reviewNutritionLabelOCR(resData, props.initialIngredient);
                nutritionChanged.value = true;
                evidenceConfirmed.value = false;
                showLabelReview.value = true;
                evidenceSpec.value = reviewed.specification;
                evidenceBasis.value = ['raw','cooked','dry','as_sold'].includes(resData.weightBasis) ? resData.weightBasis : 'unknown';
                evidenceUnit.value = reviewed.unit || evidenceUnit.value;
                if (props.mode === 'create' || !form.name) {
                    if (resData.name) form.name = resData.name;
                }
                if (resData.brand && !form.brand) form.brand = resData.brand;
                form.servingSize = reviewed.servingSize;
                if (reviewed.servingUnit) form.servingUnit = reviewed.servingUnit;
                form.per100g = reviewed.per100g;
                form.perServing = reviewed.perServing;
                photo.notices = reviewed.notices;

                // 自動分類判定
                const autoCategory = props.engine.detectNutrientCategory(
                    resData.name || form.name,
                    form.per100g || form.perServing
                );
                form.category = autoCategory || resData.category || 'sauces';
                form.displayBasis = completeNutrients(form.perServing) && ['sauces', 'oils', 'seasonings', 'fats'].includes(form.category) ? 'serving' : '100g';

                photo.status = 'success';
                photo.message = 'AI 已填入照片的候選營養值；尚未核實或儲存，請對照照片確認。';
                await scrollReviewToTop(revision);
            } else {
                photo.status = 'error';
                photo.notices = [];
                photo.message = `${data?.message || 'AI 辨識未完成'}，請在下方直接手動填寫。`;
                if (data?.status === 'need_api_key' || data?.status === 'invalid_key') {
                    showApiKeyInput.value = true;
                }
                if (fileName && !['image', 'photo', 'camera', 'IMG', 'DCIM'].some(k => fileName.includes(k))) {
                    if (!form.name) form.name = fileName;
                }
            }
        };

        // Re-analysis is explicit: never automatically send stored photos to Gemini.
        const analyzeSavedPhoto = async () => {
            if (!photo.url || photo.isAnalyzing) return;
            const revision = ++photoRevision;
            photo.isAnalyzing = true;
            photo.status = 'analyzing';
            photo.message = '正在讀取並核對這張照片…';
            try {
                let dataUrl = photo.url;
                if (!dataUrl.startsWith('data:image/')) {
                    // FK hydrates IndexedDB photo backups into same-origin blob: URLs.
                    // Browser object URLs are readable while the app is open, but
                    // never persist them or permit cross-origin blobs/HTTP URLs.
                    const photoAddress = new URL(dataUrl);
                    const localBlob = photoAddress.protocol === 'blob:'
                        && photoAddress.origin === window.location.origin;
                    if (!localBlob && photoAddress.protocol !== 'https:') {
                        throw Error('照片來源不是安全的 HTTPS 或本機備份');
                    }
                    const response = await fetch(dataUrl, {
                        credentials: 'omit', mode: localBlob ? 'same-origin' : 'cors', cache: 'no-store'
                    });
                    if (!response.ok) throw Error('無法取得原照片');
                    const blob = await response.blob();
                    if (!blob.type.startsWith('image/') || blob.size > 10 * 1024 * 1024) throw Error('照片格式或大小不支援');
                    dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(Error('無法讀取照片'));
                        reader.readAsDataURL(blob);
                    });
                }
                const compressed = await compressImage(dataUrl, 800, 800, 0.8);
                if (revision !== photoRevision || !props.isOpen) return;
                await analyzePhotoDirectly(compressed, refreshSavedApiKey(), '', revision);
            } catch (error) {
                if (revision !== photoRevision || !props.isOpen) return;
                photo.isAnalyzing = false;
                photo.status = 'error';
                photo.notices = [];
                photo.message = '無法重新讀取舊照片（' + (error.message || '來源無法存取')
                    + '）；請從相簿重新選取照片辨識。';
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
            if (!file) return;
            const revision = ++photoRevision;
            photo.isAnalyzing = true;
            photo.status = 'analyzing';
            photo.message = '正在讀取新照片…';
            const fail = error => {
                if (revision !== photoRevision || !props.isOpen) return;
                photo.isAnalyzing = false;
                photo.status = 'error';
                photo.message = '無法讀取照片（' + (error?.message || '格式錯誤') + '），請重新選取。';
            };
            const reader = new FileReader();
            reader.onload = async event => {
                try {
                    const compressedDataUrl = await compressImage(event.target.result, 800, 800, 0.8);
                    if (revision !== photoRevision || !props.isOpen) return;
                    photo.url = compressedDataUrl;
                    await scrollReviewToTop(revision);
                    const apiKey = refreshSavedApiKey();
                    const fileName = file.name ? file.name.split('.')[0].replace(/[-_]/g, ' ') : '';
                    await analyzePhotoDirectly(compressedDataUrl, apiKey, fileName, revision);
                } catch (error) { fail(error); }
            };
            reader.onerror = fail;
            reader.readAsDataURL(file);
            event.target.value = '';
        };

        const removePhoto = () => {
            photoRevision++;
            photo.url = null;
            photo.status = 'idle';
            photo.message = '';
            photo.notices = [];
        };

        // 提交處理
        const handleSave = async (replaceTarget = null) => {
            if (isSaving.value || photo.isAnalyzing || previewIngredient.value) return;
            // Click handlers pass DOM events; replacement must be an explicit candidate ID.
            const replaceId = typeof replaceTarget === 'string' ? replaceTarget : null;
            if (replaceId && !matchCandidates.value.some(item => item.id === replaceId)) return;
            const saveRevision = photoRevision;
            const saveScope = props.engine.personalScope;
            const saveContext = props.engine.personalContext;
            const cleanName = (form.name || '').trim();
            if (!cleanName) {
                alert('請輸入食材名稱');
                return;
            }

            // 🚨 守門員 1：防呆重複與模糊比對檢查 (僅在建立模式守門)
            if (modalMode.value === 'create' && !replaceId) {
                const allIngs = props.engine?.data?.ingredients || [];
                const { exactMatch, similarMatches: topSimilar } = findSimilarIngredients(cleanName, allIngs, form.id || null);

                if (exactMatch) {
                    alert(`🚫 總庫中已有完全同名的食材【${exactMatch.name}】！\n已為您切換至該食材進行檢視，返回後可選擇取代，避免重複建立雙胞胎。`);
                    switchToExisting(exactMatch);
                    return;
                }

                if (topSimilar.length > 0) {
                    const sim = topSimilar[0];
                    const simStore = sim.ingredient.preferredStore || sim.ingredient.preferredStores?.[0] || '全聯';
                    const confirmMsg = `💡 總庫中已有相似食材【${sim.ingredient.name}】（常用通路：${simStore}，${sim.reason}）。\n\n您確定這是不同規格的私房食材，仍要獨立建立【${cleanName}】嗎？`;
                    if (!confirm(confirmMsg)) {
                        return;
                    }
                }
            }

            const targetId = replaceId || form.id || 'ing_' + Date.now();
            const ingData = {
                id: targetId,
                name: cleanName,
                brand: form.brand || '',
                category: form.category,
                servingSize: nutrientNumber(form.servingSize),
                servingUnit: (form.servingUnit || 'g').toLowerCase(),
                storageZones: [...form.storageZones],
                preferredStores: normalizeStoreList(form.preferredStores),
                preferredStore: normalizeStoreList(form.preferredStores)?.[0] || '全聯',
                price: Number(form.price) || 0,
                priceUnit: form.priceUnit || '包',
                priorityTier: Number(form.priorityTier) || 1,
                photoUrl: photo.url || null,
                per100g: {
                    kcal: nutrientNumber(form.per100g.kcal),
                    protein: nutrientNumber(form.per100g.protein),
                    carbs: nutrientNumber(form.per100g.carbs),
                    fat: nutrientNumber(form.per100g.fat),
                    sodium: nutrientNumber(form.per100g.sodium)
                },
                perServing: {
                    kcal: nutrientNumber(form.perServing.kcal),
                    protein: nutrientNumber(form.perServing.protein),
                    carbs: nutrientNumber(form.perServing.carbs),
                    fat: nutrientNumber(form.perServing.fat),
                    sodium: nutrientNumber(form.perServing.sodium)
                }
            };

            const previous = props.engine.getIngredientById(targetId);
            if (previous && !replaceId) {
                for (const key of ['unitLabel', 'isCount', 'perUnit', 'gramsPerPack', 'weightBasis', 'weightBasisSource', 'nutritionCache', 'nutritionReviewRequired']) {
                    if (previous[key] !== undefined) ingData[key] = previous[key];
                }
                if (!nutritionChanged.value && photo.status !== 'success') {
                    for (const key of ['per100g', 'perServing', 'servingSize', 'servingUnit']) {
                        delete ingData[key];
                        if (previous[key] !== undefined) ingData[key] = previous[key];
                    }
                } else if (hasUnitNutrition.value) {
                    // Editing one strip/egg must never invent a 100 g conversion.
                    ingData.perUnit = { ...form.perServing };
                    for (const key of ['per100g', 'perServing', 'servingSize', 'servingUnit']) {
                        delete ingData[key];
                        if (previous[key] !== undefined) ingData[key] = previous[key];
                    }
                }
            }

            const nutritionEdited = !!replaceId || nutritionChanged.value || photo.status === 'success' || !previous;
            if (nutritionEdited || evidenceConfirmed.value) {
                const perCount = !replaceId && hasUnitNutrition.value;
                ingData.unitLabel = perCount ? previous.unitLabel : evidenceUnit.value;
                ingData.weightBasis = evidenceBasis.value;
                if (perCount) ingData.perUnit = Object.fromEntries(nutrientKeys.map(key => [key, nutrientNumber(form.perServing[key])]));
                if (!perCount && !['g','ml'].includes(ingData.unitLabel)) {
                    if (Number(gramsPerUnit.value) > 0 && completeNutrients(ingData.per100g)) {
                        ingData.gramsPerUnit = Number(gramsPerUnit.value);
                        ingData.perUnit = scaleNutrients(ingData.per100g, ingData.gramsPerUnit / 100);
                    }
                }
                const values = ingData.perUnit || ingData.per100g;
                const consistencyIssue = labelConsistencyIssue(ingData);
                if (evidenceConfirmed.value && consistencyIssue) { alert(consistencyIssue); return; }
                // Saving a successful OCR result accepts the visible nutrition values.
                // Package specification is optional: it is not a nutrient or weight unit.
                // Incomplete or inconsistent values may be saved, but stay pending.
                const valid = (photo.status === 'success' || evidenceConfirmed.value)
                    && completeNutrients(values) && !consistencyIssue
                    && evidenceBasis.value !== 'unknown'
                    && (perCount || ['g', 'ml'].includes(ingData.unitLabel)
                        || (Number(ingData.gramsPerUnit) > 0 && completeNutrients(ingData.perUnit)));
                ingData.nutritionEvidence = {kind:'product_label', status: valid ? 'verified' : 'pending',
                    checkedAt:valid ? new Date().toISOString().slice(0,10) : null,
                    identity:{name:cleanName, brand:form.brand || ''}, specification:evidenceSpec.value.trim(),
                    weightBasis:evidenceBasis.value, note:evidenceSource.value.trim() || (photo.status === 'success'
                        ? (valid ? '使用者於儲存時採用照片辨識數值' : '照片數值或重量單位待補齊')
                        : (valid ? '使用者人工核對營養數值' : '營養資料仍待核對')), sources:[]};
                ingData.nutritionEvidence.snapshot = evidenceSnapshot(ingData);
                ingData.nutritionReviewRequired = !valid;
            }

            if (replaceId) {
                for (const key of ['perUnit', 'isCount', 'gramsPerUnit', 'gramsPerPack']) {
                    if (ingData[key] === undefined) ingData[key] = null;
                }
                ingData.photo = null;
                ingData.localPhotoRefs = {};
            }

            const uploadingPhoto = ingData.photoUrl?.startsWith('data:');
            isSaving.value = true;
            try {
                // 儲存至食材快取
                if (props.engine?.saveIngredient) {
                    try {
                        const saved = await props.engine.saveIngredient(ingData, replaceId ? { replaceId } : undefined);
                        if (saved) Object.assign(ingData, saved);
                    }
                    catch (error) { alert(error.message || '尚未儲存，請保留畫面後重試。'); return; }
                }

                if (!props.isOpen || photoRevision !== saveRevision || props.engine.personalScope !== saveScope || props.engine.personalContext !== saveContext) return;
                // 同步更新採買清單中已存在的該品項通路
                if (props.engine?.data?.pantryInventory?.shoppingList) {
                    let shoppingUpdated = false;
                    props.engine.data.pantryInventory.shoppingList.forEach(item => {
                        if (item.targetId === ingData.id) {
                            item.preferredStores = normalizeStoreList(form.preferredStores);
                            item.store = item.preferredStores?.[0] || '全聯';
                            shoppingUpdated = true;
                        }
                    });
                    if (shoppingUpdated && props.engine.saveJson) {
                        await props.engine.saveJson('pantry_inventory.json', props.engine.data.pantryInventory);
                    }
                }

                if (photoRevision !== saveRevision || props.engine.personalScope !== saveScope || props.engine.personalContext !== saveContext) return;
                // 更新庫存狀態
                if (props.engine?.toggleStock) {
                    await props.engine.toggleStock(ingData.id, form.stock);
                } else if (props.engine?.updateStock) {
                    await props.engine.updateStock(ingData.id, form.stock);
                }

                const autoAddToDish = (props.context === 'calculator_create');
                const photoNotice = uploadingPhoto && !ingData.photoUrl ? '食材已儲存，但照片上傳失敗。' : '';
                const replaceNotice = replaceId ? '已取代既有食材，原食材 ID 與引用保留。原資料已保留在此裝置的最近一次營養編輯備份；如需回復，請先勿再次編輯並聯絡協助。' : '';
                if (photoNotice || replaceNotice) alert([replaceNotice, photoNotice].filter(Boolean).join('\n'));
                emit('saved', ingData, autoAddToDish);
                emit('close');
            } catch (error) { alert(error.message || '食材已儲存，庫存更新未完成，請確認後重試。'); }
            finally { isSaving.value = false; }
        };

        const replaceExisting = async () => {
            const target = replacementTarget.value;
            if (!target || isSaving.value || photo.isAnalyzing) return;
            if (!confirm(`取代「${target.name}」${target.brand ? '（' + target.brand + '）' : ''} [${target.id}]？\n將以目前照片、營養值與商品資料更新此食材，保留原 ID 與引用。庫存只更新目前資料空間；其他資料空間不變。若重量單位改變，原有料理份量需重新核對。\n原資料會保留於此裝置的最近一次營養編輯備份。取消不會變更資料。`)) return;
            await handleSave(target.id);
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
            evidenceConfirmed, showLabelReview, evidenceSpec, evidenceBasis, evidenceUnit, evidenceSource, gramsPerUnit, sourceText, sourceEvidence,
            hasUnitNutrition, photoUnitChanged, completeNutrients,
            modalMode, previewNutritionText, previewIngredient, returnToDraft, matchCandidates, selectedTargetId, replacementTarget, replaceExisting, isSaving,
            duplicateMatch,
            similarMatches,
            switchToExisting,
            form,
            photo,
            showApiKeyInput,
            apiKeyInput,
            saveCustomApiKey,
            cameraInputRef,
            albumInputRef,
            drawerContentRef,
            triggerCamera,
            triggerAlbum,
            analyzeSavedPhoto,
            onFilePicked,
            removePhoto,
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
        <div v-if="isOpen" class="modal-overlay" @click.self="!isSaving && $emit('close')">
            <div ref="drawerContentRef" class="drawer-content" style="max-height: 90vh; padding: 20px 20px 28px 20px; position: relative; overflow-y: auto; display: flex; flex-direction: column;">
                
                <section v-if="previewIngredient" aria-label="既有食材檢視">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                        <button class="btn-icon" aria-label="返回新增食材" @click="returnToDraft" style="min-width:44px; min-height:44px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 12H5m7-7-7 7 7 7"/></svg>
                        </button>
                        <h2 style="flex:1; font-size:1.1rem;">{{ previewIngredient.name }}</h2>
                        <button class="btn-icon" aria-label="關閉" @click="$emit('close')">✕</button>
                    </div>
                    <img v-if="previewIngredient.photoUrl || previewIngredient.photo" :src="previewIngredient.photoUrl || previewIngredient.photo" alt="既有食材照片" style="width:100%; max-height:220px; object-fit:contain; border-radius:12px;">
                    <p>品牌：{{ previewIngredient.brand || '未填寫' }}</p>
                    <p>分類：{{ ({proteins:'蛋白質',veggies:'蔬菜水果',carbs:'碳水主食',sauces:'油脂／調味／其他'})[previewIngredient.category] || '其他' }} · {{ engine.checkStock(previewIngredient.id) ? '有庫存' : '無庫存' }}</p>
                    <p>通路：{{ (previewIngredient.preferredStores || [previewIngredient.preferredStore || '全聯']).join('、') }}</p>
                    <p>{{ previewIngredient.perUnit ? '每 ' + (previewIngredient.unitLabel || '單位') : '每 100 ' + (previewIngredient.unitLabel || 'g') }}</p>
                    <dl v-for="(value, key) in (previewIngredient.perUnit || previewIngredient.per100g || {})" :key="key" style="display:flex; justify-content:space-between;">
                        <dt>{{ ({kcal:'熱量 (kcal)',protein:'蛋白質 (g)',carbs:'碳水 (g)',fat:'脂肪 (g)',sodium:'鈉 (mg)'})[key] || key }}</dt><dd>{{ value ?? '待確認' }}</dd>
                    </dl>
                    <p>{{ previewNutritionText }}</p>
                    <p style="color:var(--color-text-muted);">僅供檢視；返回箭頭可回到原照片與新增內容。</p>
                </section>
                <div v-show="!previewIngredient" :inert="isSaving" style="display:contents;">
                <!-- 隱藏的拍照 / 相簿 input -->
                <input type="file" ref="cameraInputRef" accept="image/*" capture="environment" style="display: none;" @change="onFilePicked">
                <input type="file" ref="albumInputRef" accept="image/*" style="display: none;" @change="onFilePicked">

                <!-- 🤖 AI 辨識中遮罩 -->
                <div v-if="photo.isAnalyzing && !previewIngredient"
                     style="position: absolute; inset: 0; background: rgba(255, 255, 255, 0.85); z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(4px); border-radius: inherit;">
                    <div style="width: 48px; height: 48px; border: 4px solid #E5E7EB; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 14px;"></div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--color-text-main);">AI 正在辨識營養標示...</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 4px;">讀取熱量、蛋白質、碳水與脂肪中</div>
                </div>

                <!-- 1. 頂部標題列：品名輸入 + 庫存切換開關 + ✕ 關閉按鈕 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--color-border); padding-bottom: 12px; gap: 8px;">
                    <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">🥗</span>
                        <input type="text" 
                               v-model="form.name" 
                               :placeholder="modalMode === 'create' ? '輸入食材名稱 (如：鮮乳、番茄)' : '食材名稱'" 
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

                <div v-if="modalMode === 'create' && matchCandidates.length" style="margin-bottom:14px; padding:12px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; font-size:0.8rem;">
                    <strong>{{ duplicateMatch ? '已有同名食材' : '發現相似食材' }}</strong>
                    <label v-if="matchCandidates.length > 1" style="display:block; margin-top:8px;">選擇查看／取代目標
                        <select v-model="selectedTargetId" style="width:100%; margin-top:6px; padding:8px;">
                            <option disabled value="">請選擇既有食材</option>
                            <option v-for="item in matchCandidates" :key="item.id" :value="item.id">{{ item.name }} · {{ item.brand || '未填品牌' }} [{{ item.id }}]</option>
                        </select>
                    </label>
                    <p v-if="replacementTarget">目標：<b>{{ replacementTarget.name }}</b> · {{ replacementTarget.brand || '未填品牌' }} [{{ replacementTarget.id }}]</p>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
                        <button class="capsule" :disabled="!replacementTarget || isSaving" @click="switchToExisting(replacementTarget)">切換查看既有食材</button>
                        <button class="capsule" :disabled="!replacementTarget || photo.isAnalyzing || isSaving" @click="replaceExisting">取代原有食材</button>
                    </div>
                    <p style="margin-bottom:0; color:var(--color-text-muted);">查看後可返回，照片與填寫內容會保留。不同規格可按下方儲存。</p>
                </div>

                <!-- 2. 食材實拍照片滿版卡片 (加入 flex-shrink: 0 嚴禁 flex 壓縮，保持 240px 壯觀高視野) -->
                <div v-if="photo.url" style="margin-bottom: 16px; position: relative; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--color-border); box-shadow: 0 2px 8px rgba(0,0,0,0.08); background: #111827; height: 240px; min-height: 240px; width: 100%; flex-shrink: 0;">
                    <img :src="photo.url" alt="食材照片" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                    
                    <!-- 頂部右上角：刪除/移除照片按鈕 (38px 圓形，系統標準 20px 垃圾桶 SVG) -->
                    <button class="btn-icon" @click="removePhoto"
                            style="position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.68); color: #FFFFFF; border: 1.5px solid rgba(255, 255, 255, 0.45); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: 0 3px 10px rgba(0,0,0,0.35); padding: 0;" 
                            title="移除此照片">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>

                <button v-if="photo.url && !photo.isAnalyzing" type="button" class="btn-icon"
                        style="margin-bottom:10px;border:1px solid var(--color-border);border-radius:10px;padding:9px 12px;width:100%;"
                        @click="analyzeSavedPhoto">用 AI 辨識／重新核對這張照片</button>
                <div v-if="photo.message" role="status" style="margin-bottom:10px;font-size:0.84rem;line-height:1.5;padding:10px 12px;border:1px solid var(--color-border);border-radius:10px;">
                    {{ photo.status === 'success' ? '辨識完成，請核對下方營養數字。按儲存即採用這些數字。' : photo.message }}
                    <p v-if="photoUnitChanged" style="margin:6px 0 0;color:#92400E;font-weight:600;">
                        ⚠️ 舊資料使用 {{ initialIngredient.unitLabel }}，照片使用 {{ evidenceUnit }}；不能直接換算，原有料理份量需重新核對。
                    </p>
                    <details v-if="photo.notices.length" style="margin-top:6px;">
                        <summary style="cursor:pointer;color:var(--color-text-muted);">查看 {{ photo.notices.length }} 項辨識提醒</summary>
                        <p v-for="notice in photo.notices" :key="notice" style="margin:6px 0 0;color:#92400E;">{{ notice }}</p>
                    </details>
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
                        <span style="font-weight: 700; font-size: 0.9rem; color: var(--color-text-main);">營養成分</span>
                        <div style="display: flex; background: #E5E7EB; padding: 2px; border-radius: 8px; gap: 2px;">
                            <button v-if="!hasUnitNutrition" @click="form.displayBasis = '100g'"
                                    :style="{ background: form.displayBasis === '100g' ? 'var(--color-primary)' : 'transparent', color: form.displayBasis === '100g' ? '#FFF' : '#4B5563', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', border: 'none', cursor: 'pointer' }">
                                {{ evidenceUnit === 'ml' ? '每 100 mL' : '每 100 g' }}
                            </button>
                            <button @click="form.displayBasis = 'serving'" 
                                    :style="{ background: form.displayBasis === 'serving' ? 'var(--color-primary)' : 'transparent', color: form.displayBasis === 'serving' ? '#FFF' : '#4B5563', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', border: 'none', cursor: 'pointer' }">
                                {{ hasUnitNutrition ? '每' + form.servingUnit : '每份 ' + (form.servingSize || '?') + ' ' + (form.servingUnit || '') }}
                            </button>
                        </div>
                    </div>

                    <!-- 份量基準輸入 (僅在「按單份」模式下展示) -->
                    <div v-if="form.displayBasis === 'serving' && !hasUnitNutrition" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.85rem; background: #FFFFFF; padding: 8px 12px; border-radius: 8px; border: 1px dashed var(--color-primary);">
                        <span style="font-weight: 700; color: var(--color-text-main);">單份份量：</span>
                        <input type="number" v-model.number="form.servingSize" @input="onServingSizeChange" style="width: 54px; padding: 3px 6px; border: 1px solid var(--color-border); border-radius: 6px; font-weight: 700; text-align: right; background: #FAF8F5;">
                        <select v-model="form.servingUnit" @change="onServingSizeChange"><option value="g">g</option><option value="ml">ml</option></select>
                    </div>

                    <p v-if="photo.status === 'success' && !completeNutrients(form.perServing) && !completeNutrients(form.per100g)"
                       style="font-size:0.82rem;color:#92400E;margin-bottom:8px;">
                        部分營養數字未辨識到；可先儲存，但須補齊才能計算營養。
                    </p>
                    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
                        <label v-for="field in [{key:'kcal',name:'熱量',unit:'kcal'},{key:'protein',name:'蛋白質',unit:'g'},{key:'carbs',name:'碳水',unit:'g'},{key:'fat',name:'脂肪',unit:'g'},{key:'sodium',name:'鈉',unit:'mg'}]" :key="field.key" style="min-width:0;background:#fff;padding:8px;border-radius:8px;font-size:0.85rem;">
                            {{ field.name }} {{ field.unit }}
                            <input v-if="form.displayBasis === '100g'" type="number" min="0" v-model.number="form.per100g[field.key]" @input="on100gInput" style="width:100%;min-width:0;box-sizing:border-box;">
                            <input v-else type="number" min="0" v-model.number="form.perServing[field.key]" @input="onServingInput" style="width:100%;min-width:0;box-sizing:border-box;">
                        </label>
                    </div>
                </div>

                <!-- Less-frequent controls remain accessible without dominating nutrition review. -->
                <details :open="modalMode === 'create'" style="border:1px solid var(--color-border);border-radius:14px;padding:12px;margin-bottom:16px;background:#fff;">
                    <summary style="cursor:pointer;font-weight:700;font-size:0.86rem;color:var(--color-text-main);">其他設定：分類、存放與採買</summary>
                    <div style="margin-top:14px;">
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

                <!-- 4.1 食物優先級與裁量屬性 (4大階梯) -->
                <div style="background: #FFF; border: 1px solid var(--color-border); border-radius: 12px; padding: 12px; margin-bottom: 14px;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">
                        食物優先級 (熱量緊繃時取捨)：
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button v-for="tier in [
                            { id: 1, label: '🥩 原型營養 (保底守護)' },
                            { id: 2, label: '🍠 原型慢碳 (彈性調節)' },
                            { id: 3, label: '🍢 加工精緻 (緊繃讓位)' },
                            { id: 4, label: '🍯 高脂厚醬 (高卡防線)' }
                        ]" 
                        :key="tier.id"
                        type="button"
                        class="capsule"
                        :class="form.priorityTier === tier.id ? 'selected' : 'in-stock'"
                        style="padding: 5px 10px; font-size: 0.8rem; font-weight: 600; cursor: pointer;"
                        @click="form.priorityTier = tier.id">
                            {{ tier.label }}
                        </button>
                    </div>
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

                    <!-- Source / product metadata remains available only when explicitly needed. -->
                    <details style="border:1px solid var(--color-border);border-radius:12px;padding:12px;margin-bottom:14px;">
                        <summary style="cursor:pointer;font-size:0.85rem;color:var(--color-text-muted);">進階營養資料（選填）</summary>
                <!-- Show the source status, but keep audit prose out of the primary task. -->
                <div class="card" style="margin-bottom:12px;flex-shrink:0;display:grid;gap:10px;font-size:0.85rem;line-height:1.5;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="color:var(--color-text-muted);">營養來源</span>
                        <strong role="status" style="font-size:0.85rem;color:var(--color-text-main);">{{ sourceText }}</strong>
                    </div>
                    <details style="border-top:1px solid var(--color-border);padding-top:8px;">
                        <summary style="cursor:pointer;color:var(--color-text-muted);">查看來源與計算說明</summary>
                        <div style="display:grid;gap:8px;margin-top:10px;color:var(--color-text-muted);font-size:0.8rem;">
                            <p>一般食材採官方估算；有產品標示時可用照片核對。空白不代表 0。</p>
                            <p v-if="sourceEvidence">{{ sourceEvidence.note }} · {{ sourceEvidence.checkedAt || '日期待確認' }}</p>
                            <p v-if="modalMode === 'edit' && engine.getNutritionIssues([{ id: form.id, amount: 1 }]).length">
                                {{ engine.getNutritionIssues([{ id: form.id, amount: 1 }]).join('；') }}
                            </p>
                            <div v-if="sourceEvidence && sourceEvidence.sources && sourceEvidence.sources.length">
                                <p v-for="source in sourceEvidence.sources" :key="source.ref || source.url" style="overflow-wrap:anywhere;">
                                    {{ source.ref }} {{ source.title }} {{ source.url }}
                                </p>
                            </div>
                        </div>
                    </details>
                    <button type="button" class="btn-icon" style="border:1px solid var(--color-border);border-radius:10px;padding:9px 10px;"
                            @click="showLabelReview = !showLabelReview">
                        {{ showLabelReview ? '收起商品資訊' : '有產品營養標示？核對商品' }}
                    </button>
                    <template v-if="showLabelReview">
                        <strong style="font-size:0.9rem;">1. 核對商品資訊</strong>
                        <label style="display:block;">品牌
                            <input style="width:100%;min-width:0;box-sizing:border-box;" v-model="form.brand">
                        </label>
                        <label style="display:block;">商品規格（口味／版本／淨容量，不是每份容量）
                            <input style="width:100%;min-width:0;box-sizing:border-box;" v-model="evidenceSpec"
                                   placeholder="例：地獄版；看不清請留空">
                        </label>
                        <div style="color:var(--color-text-muted);font-size:0.8rem;">
                            計量：{{ hasUnitNutrition ? form.servingUnit : (form.servingSize || '?') + ' ' + (form.servingUnit || '') }}
                            · {{ evidenceBasis === 'as_sold' ? '販售狀態' : evidenceBasis === 'raw' ? '生重' : evidenceBasis === 'cooked' ? '熟重' : evidenceBasis === 'dry' ? '乾重' : '重量基準待確認' }}
                        </div>
                        <details style="border-top:1px solid var(--color-border);padding-top:8px;">
                            <summary style="cursor:pointer;color:var(--color-text-muted);">進階核對設定（通常不用改）</summary>
                            <div style="display:grid;gap:8px;margin-top:10px;">
                                <label style="display:block;">來源備註 <input style="width:100%;" v-model="evidenceSource"></label>
                                <label>重量基準 <select v-model="evidenceBasis"><option value="unknown">待確認</option><option value="raw">生重／可食部</option><option value="cooked">熟重／可食部</option><option value="dry">乾重</option><option value="as_sold">販售／即食狀態</option></select></label>
                                <label v-if="!hasUnitNutrition">計量單位 <select v-model="evidenceUnit"><option value="g">g</option><option value="ml">ml</option><option v-if="!['g','ml'].includes(evidenceUnit)" :value="evidenceUnit">{{ evidenceUnit }}</option></select></label>
                                <label v-if="!hasUnitNutrition && !['g','ml'].includes(evidenceUnit)" style="display:block;">每 {{ evidenceUnit }} 可食重量 g（依包裝或實測）<input type="number" min="0" v-model.number="gramsPerUnit"></label>
                            </div>
                        </details>
                    </template>
                </div>

                        <label v-if="showLabelReview" style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;line-height:1.5;">
                            <input type="checkbox" v-model="evidenceConfirmed" style="margin-top:3px;flex-shrink:0;">
                            <span>已人工核對營養資料（非拍照新增時選用）</span>
                        </label>
                    </details>
                    </div>
                </details>

                <!-- 🟠 第 1 頁專屬：右下角系統黃浮動正圓鈕【從料理移除】(FAB: 碗 ✕ 往右弧度箭頭 款式 1，純平無光暈) -->
                <div v-if="context === 'calculator' && mode === 'edit'"
                     @click="handleRemoveFromDish"
                     title="從此料理移除"
                     style="position: absolute; right: 18px; bottom: 98px; width: 52px; height: 52px; border-radius: 50%; background: #FFCA60; display: flex; align-items: center; justify-content: center; z-index: 40; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.08); transition: transform 0.15s ease;">
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
        </div>
    `
};

export default IngredientDetailModal;
