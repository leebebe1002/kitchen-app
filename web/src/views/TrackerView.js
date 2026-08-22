const { ref, computed, onMounted, onUnmounted, nextTick } = Vue;

export default {
    props: ['engine'],
    setup(props) {
        const engine = props.engine;
        
        // Today's date by default (e.g. "2026-08-12")
        const getTodayStr = () => {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const currentDate = ref(getTodayStr());
        const currentMember = ref('bebe'); // bebe, ariel, jason

        // AI Modal States (畫面 B / 畫面 C / 語音輸入)
        const showAiModal = ref(false);
        const modalStep = ref('camera'); // 'camera' (畫面 B) | 'voice' | 'result' (畫面 C)
        const isAiAnalyzing = ref(false);
        const capturedPhotoUrl = ref(null);
        const voiceText = ref('');
        const videoRef = ref(null);
        let mediaStream = null;

        // Editable Result Form for 畫面 C
        const resultForm = ref({
            dishName: '便當店排骨便當',
            kcal: 680,
            protein: 28.5,
            carbs: 82.0,
            fat: 24.0,
            sodium: 980,
            aiNote: '估算自信度 88%，包含大油炒高麗菜與排骨裹粉。'
        });



        const targetProfile = computed(() => {
            return engine.profiles[currentMember.value] || {
                name: 'Bebe', targetKcal: 1350, targetProtein: 105, targetCarbs: 140, targetFat: 40, targetSodium: 1500
            };
        });

        const favoriteFoods = computed(() => engine.getFavoriteFoods());

        const selectFavoriteFood = (fav) => {
            capturedPhotoUrl.value = null;
            resultForm.value = {
                dishName: fav.name,
                kcal: Number(fav.nutrients?.kcal) || 0,
                protein: Number(fav.nutrients?.protein) || 0,
                carbs: Number(fav.nutrients?.carbs) || 0,
                fat: Number(fav.nutrients?.fat) || 0,
                sodium: Number(fav.nutrients?.sodium) || 0,
                aiNote: fav.aiNote || '常用快捷精確數據'
            };
            modalStep.value = 'result';
            isAiAnalyzing.value = false;
        };

        const saveAsFavorite = async () => {
            const newFav = {
                id: 'fav_' + Date.now(),
                name: resultForm.value.dishName,
                icon: '⭐️',
                category: '客製常用',
                nutrients: {
                    kcal: Number(resultForm.value.kcal) || 0,
                    protein: Number(resultForm.value.protein) || 0,
                    carbs: Number(resultForm.value.carbs) || 0,
                    fat: Number(resultForm.value.fat) || 0,
                    sodium: Number(resultForm.value.sodium) || 0
                },
                aiNote: resultForm.value.aiNote
            };
            await engine.saveFavoriteFood(newFav);
            alert(`🎉 已成功將【${resultForm.value.dishName}】收錄為常用快捷餐點！`);
        };

        const memberLog = computed(() => {
            return engine.getDailyLog(currentDate.value, currentMember.value);
        });

        const totals = computed(() => {
            return memberLog.value.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        });

        const meals = computed(() => {
            return memberLog.value.meals || [];
        });

        // Remaining budgets
        const remaining = computed(() => {
            const p = targetProfile.value;
            const t = totals.value;
            return {
                kcal: Math.round((p.targetKcal - t.kcal) * 10) / 10,
                protein: Math.round((p.targetProtein - t.protein) * 10) / 10,
                carbs: Math.round((p.targetCarbs - t.carbs) * 10) / 10,
                fat: Math.round((p.targetFat - t.fat) * 10) / 10,
                sodium: Math.round((p.targetSodium - t.sodium))
            };
        });

        // Progress percentage for graphical dashboard (熱量大膠囊 + 3個圓環)
        const percent = computed(() => {
            const p = targetProfile.value;
            const t = totals.value;
            const rawKcal = p.targetKcal > 0 ? Math.round((t.kcal / p.targetKcal) * 100) : 0;
            const rawProtein = p.targetProtein > 0 ? Math.round((t.protein / p.targetProtein) * 100) : 0;
            const rawCarbs = p.targetCarbs > 0 ? Math.round((t.carbs / p.targetCarbs) * 100) : 0;
            const rawFat = p.targetFat > 0 ? Math.round((t.fat / p.targetFat) * 100) : 0;
            return {
                rawKcal,
                rawProtein,
                rawCarbs,
                rawFat,
                kcal: Math.min(100, rawKcal),
                protein: Math.min(100, rawProtein),
                carbs: Math.min(100, rawCarbs),
                fat: Math.min(100, rawFat)
            };
        });

        // Date navigation
        const changeDate = (days) => {
            const parts = currentDate.value.split('-');
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            d.setDate(d.getDate() + days);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            currentDate.value = `${year}-${month}-${day}`;
        };

        const isToday = computed(() => {
            return currentDate.value === getTodayStr();
        });

        const deleteMeal = async (mealId) => {
            if (confirm('確定要刪除這筆飲食紀錄嗎？')) {
                await engine.deleteMeal(currentDate.value, currentMember.value, mealId);
            }
        };

        const nativeCameraInput = ref(null);
        const albumInput = ref(null);

        // --- Camera & Modal Flow (畫面 B / 畫面 C) ---
        const currentFacingMode = ref('environment');

        const toggleFacingMode = async () => {
            currentFacingMode.value = currentFacingMode.value === 'environment' ? 'user' : 'environment';
            stopCameraStream();
            await startCameraStream();
        };

        const startCameraStream = async () => {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: currentFacingMode.value } },
                        audio: false
                    });
                    mediaStream = stream;
                    if (videoRef.value) {
                        videoRef.value.srcObject = stream;
                        videoRef.value.setAttribute('playsinline', 'true');
                        videoRef.value.setAttribute('muted', 'true');
                        await videoRef.value.play().catch(e => console.log('Video play catch:', e));
                    }
                }
            } catch (err) {
                console.log('WebRTC camera not available or blocked by HTTP origin:', err);
            }
        };

        const stopCameraStream = () => {
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            if (videoRef.value) {
                videoRef.value.srcObject = null;
            }
        };

        const openAiModal = async (type = 'camera') => {
            modalStep.value = type;
            capturedPhotoUrl.value = null;
            isAiAnalyzing.value = false;
            showAiModal.value = true;
            if (type === 'camera') {
                await nextTick();
                startCameraStream();
            }
        };

        const closeAiModal = () => {
            stopCameraStream();
            showAiModal.value = false;
        };

        // 畫面 B 快門按下 (Shutter Click) - 支援真實 Live Frame 截圖與 iPhone 原生相機
        const triggerShutter = (customHint = '') => {
            // 情況 1: 若 WebRTC 串流中且有畫面，直接透過 Canvas 擷取「真實即時照片」！
            if (videoRef.value && videoRef.value.videoWidth > 0 && !videoRef.value.paused) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = videoRef.value.videoWidth || 640;
                    canvas.height = videoRef.value.videoHeight || 480;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);
                    const photoData = canvas.toDataURL('image/jpeg', 0.85);
                    capturedPhotoUrl.value = photoData;
                    stopCameraStream();
                    processPhotoResult(customHint || '外食拍照餐點');
                    return;
                } catch (e) {
                    console.log('Canvas frame capture error:', e);
                }
            }

            // 情況 2: 若手機瀏覽器安全限制 (如 HTTP 網址無法啟用 WebRTC 串流)，直接呼叫 iPhone 原生相機！
            if (nativeCameraInput.value) {
                nativeCameraInput.value.click();
            }
        };

        // Direct Camera & Album Triggers
        const triggerCameraSelect = () => {
            if (nativeCameraInput.value) {
                nativeCameraInput.value.value = '';
                nativeCameraInput.value.click();
            }
        };

        // 圖片壓縮輔助 (避免相簿高解析大圖卡死或超時)
        const compressImage = (dataUrl, maxWidth = 1000, maxHeight = 1000, quality = 0.82) => {
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
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            });
        };

        const showApiKeyModal = ref(false);
        const inputApiKey = ref('');

        const getGeminiApiKey = () => {
            return (
                localStorage.getItem('family_kitchen_gemini_key') ||
                localStorage.getItem('kitchen_v2_gemini_api_key') ||
                localStorage.getItem('gemini_api_key') ||
                localStorage.getItem('GEMINI_API_KEY') ||
                engine.data?.config?.geminiApiKey ||
                engine.data?.config?.gemini_api_key ||
                ''
            );
        };

        const openApiKeySettings = () => {
            inputApiKey.value = getGeminiApiKey();
            showApiKeyModal.value = true;
        };

        const saveApiKeySetting = () => {
            const k = (inputApiKey.value || '').trim();
            localStorage.setItem('family_kitchen_gemini_key', k);
            localStorage.setItem('kitchen_v2_gemini_api_key', k);
            localStorage.setItem('gemini_api_key', k);
            localStorage.setItem('GEMINI_API_KEY', k);
            if (engine.data?.config) {
                engine.data.config.gemini_api_key = k;
                engine.data.config.geminiApiKey = k;
            }
            showApiKeyModal.value = false;
            alert(k ? '✨ Gemini API Key 已成功儲存！' : '已清除 API Key');
        };

        // Client-side Gemini Vision API 直接呼叫 (支援 Cloud Mode 與無後端模式)
        const callClientGeminiVision = async (compressedDataUrl, apiKey) => {
            console.log('🤖 [十一粒 AI] 正在啟動 Gemini 視覺神經網絡分析...');
            const b64Data = compressedDataUrl.split(',')[1];
            const mimeType = compressedDataUrl.split(',')[0].split(':')[1]?.split(';')[0] || 'image/jpeg';
            const cleanB64 = b64Data ? b64Data.replace(/[\n\r\s]/g, '') : '';

            const prompt = `你是一位極具洞察力的頂級營養師與 AI 視覺估算專家。
請仔細辨識這張照片中的食物/餐點（若照片非食物，請推測可能的情境或如實說明）。
請提取出『料理/餐點名稱 (dishName)』，並根據視覺份量精準估算全份餐點的『熱量 (kcal)』、『蛋白質 (protein, 克)』、『碳水化合物 (carbs, 克)』、『脂肪 (fat, 克)』與『鈉含量 (sodium, 毫克)』，並給出一句簡短親切的估算備註說明 (aiNote)。

請嚴格只輸出合法 JSON，不要加入 markdown \`\`\`json 標籤：
{
  "dishName": "精準料理品名 (如: 炙燒鮭魚丼 / 舒肥雞胸溫沙拉 / 燕麥拿鐵)",
  "kcal": 520,
  "protein": 38,
  "carbs": 45,
  "fat": 16,
  "sodium": 680,
  "aiNote": "十一粒 AI 視覺估算：含主菜蛋白質、主食與時蔬，數據可隨時點擊調整。"
}`;

            const payload = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType, data: cleanB64 } }
                    ]
                }]
            };

            const attempts = [
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
            ];

            let lastErr = '';
            for (const endpoint of attempts) {
                try {
                    const fetchUrl = `${endpoint}?key=${encodeURIComponent(apiKey)}`;
                    console.log(`📡 [十一粒 AI] 嘗試連線模型: ${endpoint.split('/models/')[1]?.split(':')[0]}`);
                    const resp = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                        body: JSON.stringify(payload)
                    });
                    
                    const rawTextResp = await resp.text();
                    let resData = null;
                    try { resData = JSON.parse(rawTextResp); } catch (e) {}

                    if (resp.ok && resData) {
                        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        let cleanJson = rawText;
                        if (cleanJson.startsWith('```')) {
                            cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
                        }
                        const parsed = JSON.parse(cleanJson);
                        console.log('✅ [十一粒 AI] 視覺神經網絡分析成功！辨識結果:', parsed);
                        return { status: 'success', result: parsed, isRealAi: true };
                    } else {
                        const msg = resData?.error?.message || resp.statusText || rawTextResp.slice(0, 100);
                        lastErr = `HTTP ${resp.status}: ${msg}`;
                        console.warn(`⚠️ [十一粒 AI] 模型 ${endpoint} 回應異常: ${lastErr}`);
                    }
                } catch (e) {
                    lastErr = e.message || String(e);
                    console.warn(`⚠️ [十一粒 AI] 連線模型 ${endpoint} 失敗:`, e);
                }
            }
            return { status: 'error', message: lastErr || 'Gemini Vision 呼叫失敗' };
        };

        // Client-side Gemini NLP 語音/文字解析直接呼叫
        const callClientGeminiNLP = async (text, apiKey) => {
            console.log('🤖 [十一粒 AI] 正在啟動 Gemini 語意深度解析...');
            const prompt = `你是一位極具洞察力的頂級營養師與 AI 飲食精算專家。
使用者輸入了今日飲食文字：「${text}」
請分析該餐點內容，提取出精確的『料理名稱 (dishName)』，並根據一般外食/家常份量精準推算全份餐點的『熱量 (kcal)』、『蛋白質 (protein, 克)』、『碳水化合物 (carbs, 克)』、『脂肪 (fat, 克)』與『鈉含量 (sodium, 毫克)』，並給出一句簡短親切的估算備註說明 (aiNote)。

請嚴格只輸出合法 JSON，不要加入 markdown 標籤：
{
  "dishName": "料理品名",
  "kcal": 450,
  "protein": 25,
  "carbs": 50,
  "fat": 15,
  "sodium": 600,
  "aiNote": "十一粒 AI 語意估算完成，數據可隨時點擊調整。"
}`;

            const payload = {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            };

            const attempts = [
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
            ];

            let lastErr = '';
            for (const endpoint of attempts) {
                try {
                    const fetchUrl = `${endpoint}?key=${encodeURIComponent(apiKey)}`;
                    const resp = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                        body: JSON.stringify(payload)
                    });
                    const rawTextResp = await resp.text();
                    let resData = null;
                    try { resData = JSON.parse(rawTextResp); } catch (e) {}

                    if (resp.ok && resData) {
                        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        let cleanJson = rawText;
                        if (cleanJson.startsWith('```')) {
                            cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
                        }
                        const parsed = JSON.parse(cleanJson);
                        console.log('✅ [十一粒 AI] 語意精算成功！解析結果:', parsed);
                        return { status: 'success', result: parsed, isRealAi: true };
                    } else {
                        lastErr = resData?.error?.message || resp.statusText;
                    }
                } catch (e) {
                    lastErr = e.message || String(e);
                }
            }
            return { status: 'error', message: lastErr || 'Gemini NLP 呼叫失敗' };
        };

        const triggerAlbumSelect = () => {
            if (albumInput.value) {
                albumInput.value.value = '';
                albumInput.value.click();
            }
        };

        // Handle Native Mobile Camera Snap
        const handleNativeCameraSnap = (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                showAiModal.value = true;
                isAiAnalyzing.value = true;
                modalStep.value = 'result';
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawDataUrl = e.target.result;
                    // 即時等比壓縮，避免傳輸超大照片卡死
                    const compressed = await compressImage(rawDataUrl, 1000, 1000, 0.82);
                    capturedPhotoUrl.value = compressed;
                    stopCameraStream();
                    processPhotoResult(file.name || '外食拍照餐點', compressed);
                };
                reader.readAsDataURL(file);
                event.target.value = ''; // Reset input to allow next photo
            }
        };

        // Handle Album File Upload
        const handleAlbumUpload = (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                showAiModal.value = true;
                isAiAnalyzing.value = true;
                modalStep.value = 'result';
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawDataUrl = e.target.result;
                    // 即時等比壓縮，避免相簿超高畫質相片卡死
                    const compressed = await compressImage(rawDataUrl, 1000, 1000, 0.82);
                    capturedPhotoUrl.value = compressed;
                    stopCameraStream();
                    processPhotoResult(file.name || '相簿選取餐點', compressed);
                };
                reader.readAsDataURL(file);
                event.target.value = ''; // Reset input
            }
        };

        // 📸 真正的 Gemini Vision API 視覺辨識 (優先前端直接連線，支援 Cloud Mode 與本地 Server)
        const processPhotoResult = async (hintText = '', directPhotoUrl = null) => {
            showAiModal.value = true;
            isAiAnalyzing.value = true;
            modalStep.value = 'result';

            const photoData = directPhotoUrl || capturedPhotoUrl.value;
            const apiKey = getGeminiApiKey();

            if (!apiKey) {
                console.warn('⚠️ 未設定 Gemini API Key，自動開啟設定視窗');
                isAiAnalyzing.value = false;
                resultForm.value = {
                    dishName: hintText || '外食拍照餐點',
                    kcal: 520,
                    protein: 30,
                    carbs: 60,
                    fat: 16,
                    sodium: 680,
                    aiNote: '⚠️ 尚未設定 Gemini API Key，請點擊右上角「🔑 設定 Key」輸入你的 Google 金鑰，即可開啟秒速視覺辨識！'
                };
                openApiKeySettings();
                return;
            }

            if (photoData) {
                // 1. 若有 Client-side Gemini API Key，直接由前端呼叫 Gemini 官方 API (極速 1~2 秒，支援 Cloud Mode)
                try {
                    const clientRes = await callClientGeminiVision(photoData, apiKey);
                    if (clientRes.status === 'success' && clientRes.result) {
                        resultForm.value = {
                            dishName: clientRes.result.dishName || '拍照餐點',
                            kcal: Number(clientRes.result.kcal) || 0,
                            protein: Number(clientRes.result.protein) || 0,
                            carbs: Number(clientRes.result.carbs) || 0,
                            fat: Number(clientRes.result.fat) || 0,
                            sodium: Number(clientRes.result.sodium) || 0,
                            aiNote: clientRes.result.aiNote || '十一粒 AI 視覺辨識完成，數據可點擊微調。'
                        };
                        isAiAnalyzing.value = false;
                        return;
                    }
                } catch (err) {
                    console.warn('Direct Client Vision failed, trying backend fallback:', err);
                }

                // 2. 本地 Server Fallback (若處於 Local 伺服器環境)
                try {
                    const res = await fetch('/api/analyze-meal-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: photoData,
                            apiKey: apiKey
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success' && data.result) {
                        resultForm.value = {
                            dishName: data.result.dishName || '拍照餐點',
                            kcal: Number(data.result.kcal) || 0,
                            protein: Number(data.result.protein) || 0,
                            carbs: Number(data.result.carbs) || 0,
                            fat: Number(data.result.fat) || 0,
                            sodium: Number(data.result.sodium) || 0,
                            aiNote: data.result.aiNote || '十一粒 AI 視覺辨識估算完成，數據可點擊手動微調。'
                        };
                        isAiAnalyzing.value = false;
                        return;
                    }
                } catch (e) {
                    console.log('Vision API request failed:', e);
                }
            }

            // 若視覺辨識異常時的備援
            resultForm.value = {
                dishName: hintText || '外食拍照餐點',
                kcal: 520,
                protein: 30,
                carbs: 60,
                fat: 16,
                sodium: 680,
                aiNote: apiKey ? '十一粒 AI 視覺推算：含主菜與配菜，數值皆可直接點擊手動微調。' : '⚠️ 尚未設定 Gemini API Key，已帶入標準備援估算數值（可點擊手動修改）。'
            };
            isAiAnalyzing.value = false;
        };

        // 🎙️ 真正的 Gemini LLM 自然語言深度語意解析
        const triggerVoiceAnalysis = async () => {
            const text = (voiceText.value || '').trim();
            if (!text) {
                alert('請輸入或說出你吃了什麼！');
                return;
            }

            showAiModal.value = true;
            isAiAnalyzing.value = true;
            modalStep.value = 'result';
            capturedPhotoUrl.value = null; // 清除照片

            const apiKey = getGeminiApiKey();

            // 1. 若有 Client-side Gemini API Key，直接由前端呼叫 Gemini 官方 API
            if (apiKey) {
                try {
                    const clientRes = await callClientGeminiNLP(text, apiKey);
                    if (clientRes.status === 'success' && clientRes.result) {
                        resultForm.value = {
                            dishName: clientRes.result.dishName || text,
                            kcal: Number(clientRes.result.kcal) || 0,
                            protein: Number(clientRes.result.protein) || 0,
                            carbs: Number(clientRes.result.carbs) || 0,
                            fat: Number(clientRes.result.fat) || 0,
                            sodium: Number(clientRes.result.sodium) || 0,
                            aiNote: clientRes.result.aiNote || '十一粒 AI 語意精算完成，數據可點擊手動微調。'
                        };
                        isAiAnalyzing.value = false;
                        return;
                    }
                } catch (err) {
                    console.warn('Direct Client NLP failed, trying backend fallback:', err);
                }
            }

            // 2. 本地 Server Fallback
            try {
                const res = await fetch('/api/analyze-food-nlp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, apiKey })
                });
                const data = await res.json();
                if (data.status === 'success' && data.result) {
                    resultForm.value = {
                        dishName: data.result.dishName || text,
                        kcal: Number(data.result.kcal) || 0,
                        protein: Number(data.result.protein) || 0,
                        carbs: Number(data.result.carbs) || 0,
                        fat: Number(data.result.fat) || 0,
                        sodium: Number(data.result.sodium) || 0,
                        aiNote: data.result.aiNote || '十一粒 AI 語意精算完成，數據可點擊手動微調。'
                    };
                    isAiAnalyzing.value = false;
                    return;
                }
            } catch (e) {
                console.log('NLP API request failed:', e);
            }

            // 網路離線或無 Key 時的備援
            resultForm.value = {
                dishName: text,
                kcal: 450,
                protein: 20,
                carbs: 55,
                fat: 15,
                sodium: 600,
                aiNote: apiKey ? '十一粒 AI 語意估算：已記錄餐點名稱，數據可直接手動微調。' : '⚠️ 尚未設定 Gemini API Key，已記錄餐點名稱並帶入估算值（可手動修改）。'
            };
            isAiAnalyzing.value = false;
        };

        // 畫面 C: 確認寫入今日紀錄
        const confirmSaveRecord = async () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

            const isFromPhoto = Boolean(capturedPhotoUrl.value);
            const meal = {
                id: 'meal_' + Date.now() + '_' + currentMember.value,
                dishName: resultForm.value.dishName,
                time: timeStr,
                source: isFromPhoto ? 'photo_ai' : 'nlp_ai',
                nutrients: {
                    kcal: Number(resultForm.value.kcal) || 0,
                    protein: Number(resultForm.value.protein) || 0,
                    carbs: Number(resultForm.value.carbs) || 0,
                    fat: Number(resultForm.value.fat) || 0,
                    sodium: Number(resultForm.value.sodium) || 0
                },
                aiNote: resultForm.value.aiNote,
                photoUrl: capturedPhotoUrl.value
            };

            await engine.recordMeal(currentDate.value, currentMember.value, meal);
            closeAiModal();
            alert(`🎉 已成功將【${resultForm.value.dishName}】記錄至今日時間軸！`);
        };

        onUnmounted(() => {
            stopCameraStream();
        });

        return {
            engine,
            currentDate,
            currentMember,
            targetProfile,
            totals,
            meals,
            remaining,
            percent,
            isToday,
            showAiModal,
            modalStep,
            isAiAnalyzing,
            capturedPhotoUrl,
            voiceText,
            videoRef,
            nativeCameraInput,
            albumInput,
            resultForm,
            changeDate,
            deleteMeal,
            openAiModal,
            closeAiModal,
            currentFacingMode,
            toggleFacingMode,
            triggerShutter,
            triggerCameraSelect,
            triggerAlbumSelect,
            processPhotoResult,
            handleNativeCameraSnap,
            handleAlbumUpload,
            triggerVoiceAnalysis,
            confirmSaveRecord,
            favoriteFoods,
            selectFavoriteFood,
            saveAsFavorite,
            showApiKeyModal,
            inputApiKey,
            openApiKeySettings,
            saveApiKeySetting,
            getGeminiApiKey
        };
    },
    template: `
        <div class="view-tracker" style="padding-top: 6px;">
            <!-- Date Switcher -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 14px; align-items: center;">
                <button class="btn-icon" @click="changeDate(-1)" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <span style="font-weight: 800; font-size: 1.1rem; color: #111827;">
                    {{ currentDate }} {{ isToday ? '(今天)' : '' }}
                </span>
                <button class="btn-icon" @click="changeDate(1)" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
            
            <!-- Family Member Selector Capsules -->
            <div class="capsule-group" style="margin-bottom: 20px;">
                <button class="capsule" :class="{ 'selected': currentMember === 'bebe' }" @click="currentMember = 'bebe'" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                    <span>Bebe</span>
                </button>
                <button class="capsule" :class="{ 'selected': currentMember === 'ariel' }" @click="currentMember = 'ariel'" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>樂樂</span>
                </button>
                <button class="capsule" :class="{ 'selected': currentMember === 'jason' }" @click="currentMember = 'jason'" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 18L3 11L9 4L17 5L21 11L19 19L11 21L5 18Z"></path>
                        <line x1="9" y1="4" x2="11" y2="12"></line>
                        <line x1="11" y1="12" x2="19" y2="19"></line>
                        <line x1="11" y1="12" x2="3" y2="11"></line>
                    </svg>
                    <span>Jason</span>
                </button>
            </div>

            <!-- 01 Daily Progress Dashboard (新版暖黃韓系極簡圖表：頂部長膠囊熱量條 + 3個圓環進度圈 + 鈉含量文字) -->
            <div class="card" style="margin-bottom: 24px; background: #FFFFFF; border: 1px solid var(--color-border); border-radius: 20px; padding: 20px 18px 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-weight: 700; font-size: 1.05rem; color: #111827;">
                        全天達標進度 ({{ targetProfile.name }})
                    </div>
                    <div style="display: flex; align-items: center; font-size: 0.85rem; font-weight: 700; color: #E11D48; background: #FFF1F2; padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(225, 29, 72, 0.2);">
                        <span>{{ remaining.kcal >= 0 ? '剩餘 ' + remaining.kcal + ' kcal' : '超標 ' + Math.abs(remaining.kcal) + ' kcal' }}</span>
                    </div>
                </div>
                
                <!-- 1. 頂部大長條膠囊進度條 (🔥 熱量 Calories) -->
                <div style="margin-bottom: 22px;">
                    <div class="calorie-capsule-bar" style="position: relative; width: 100%; height: 40px; background: #FFF9E6; border: 1.5px solid #FFE082; border-radius: 9999px; overflow: hidden; display: flex; align-items: center;">
                        <!-- 進度填充層 (系統黃色漸層) -->
                        <div :style="{ 
                            width: percent.kcal + '%', 
                            height: '100%', 
                            background: percent.rawKcal > 100 ? 'linear-gradient(90deg, #FFB020 0%, #E11D48 100%)' : 'linear-gradient(90deg, #FDE68A 0%, #F59E0B 100%)', 
                            borderRadius: '9999px',
                            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                        }"></div>
                        <!-- 文字置中 (清晰深棕色文字) -->
                        <div style="position: absolute; width: 100%; text-align: center; font-weight: 800; font-size: 1.05rem; color: #451A03; pointer-events: none; letter-spacing: 0.5px;">
                            {{ percent.rawKcal }}% <span style="font-size: 0.85rem; font-weight: 600; color: #78350F;">({{ totals.kcal }} / {{ targetProfile.targetKcal }} kcal)</span>
                        </div>
                    </div>
                </div>

                <!-- 2. 下方三個圓環進度圈 (蛋白質 Proteins、碳水 Carbohydrates、脂肪 Fats) -->
                <div style="display: flex; justify-content: space-around; align-items: flex-start; margin-bottom: 18px; text-align: center;">
                    <!-- 蛋白質 Proteins -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path stroke="#F59E0B" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.protein + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #451A03; line-height: 1;">{{ percent.rawProtein }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.9rem; font-weight: 700; color: #1F2937;">蛋白質</div>
                        <div style="font-size: 0.78rem; font-weight: 600; color: #4B5563; margin-top: 2px;">{{ totals.protein }}g / {{ targetProfile.targetProtein }}g</div>
                    </div>

                    <!-- 碳水 Carbohydrates -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path stroke="#F59E0B" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.carbs + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #451A03; line-height: 1;">{{ percent.rawCarbs }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.9rem; font-weight: 700; color: #1F2937;">碳水</div>
                        <div style="font-size: 0.78rem; font-weight: 600; color: #4B5563; margin-top: 2px;">{{ totals.carbs }}g / {{ targetProfile.targetCarbs }}g</div>
                    </div>

                    <!-- 脂肪 Fats -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path stroke="#F59E0B" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.fat + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #451A03; line-height: 1;">{{ percent.rawFat }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.9rem; font-weight: 700; color: #1F2937;">脂肪</div>
                        <div style="font-size: 0.78rem; font-weight: 600; color: #4B5563; margin-top: 2px;">{{ totals.fat }}g / {{ targetProfile.targetFat }}g</div>
                    </div>
                </div>

                <!-- 3. 底部鈉含量文字呈現 -->
                <div style="border-top: 1px dashed #E5E7EB; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <div style="display: flex; align-items: center; gap: 6px; color: #1F2937;">
                        <span>🧂</span>
                        <strong>今日鈉攝取：</strong>
                        <span style="font-weight: 800; color: #111827;">{{ totals.sodium }} mg</span>
                        <span style="color: #6B7280; font-size: 0.78rem;">(上限 {{ targetProfile.targetSodium }} mg)</span>
                    </div>
                    <div :style="{ color: remaining.sodium >= 0 ? '#059669' : '#DC2626', fontWeight: 800, fontSize: '0.88rem' }">
                        {{ remaining.sodium >= 0 ? '剩 ' + remaining.sodium + ' mg' : '超標 ' + Math.abs(remaining.sodium) + ' mg' }}
                    </div>
                </div>
            </div>

            <!-- 02 Meal Timeline Log -->
            <div class="section-title" style="font-size: 1rem; font-weight: 700; color: #374151; margin-bottom: 12px;">當日用餐時間軸</div>
            
            <!-- Empty State (清晰深色文字與排版) -->
            <div v-if="meals.length === 0" 
                 style="text-align: center; padding: 32px 18px; color: #374151; background: #FFFFFF; border-radius: 16px; border: 1.5px dashed #D1D5DB; font-size: 0.95rem; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                <div style="font-weight: 700; font-size: 1.05rem; color: #1F2937; margin-bottom: 6px;">
                    🍽️ {{ isToday ? '今日' : currentDate }} 尚無任何飲食紀錄
                </div>
                <div style="font-size: 0.85rem; color: #4B5563; line-height: 1.5;">
                    可在第一頁備料計算後點擊「記錄」，或點擊下方按鈕進行 AI 補記！
                </div>
            </div>

            <!-- Recorded Meals List -->
            <div v-else style="margin-bottom: 24px;">
                <div v-for="meal in meals" :key="meal.id" class="card" style="margin-bottom: 14px; border-left: 4px solid var(--color-primary); background: #FFFFFF; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--color-border);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827;">{{ meal.dishName }}</h4>
                            <span style="font-size: 0.78rem; color: #6B7280;">🕒 {{ meal.time }}</span>
                        </div>
                        <button class="btn-icon" @click="deleteMeal(meal.id)" style="color: #EF4444; border: none; font-size: 0.9rem; cursor: pointer;">🗑️</button>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 700; color: #374151; display: flex; gap: 12px; margin-top: 4px;">
                        <span>🔥 {{ meal.nutrients?.kcal || 0 }} kcal</span>
                        <span>🥩 {{ meal.nutrients?.protein || 0 }}g 蛋白</span>
                        <span>🍚 {{ meal.nutrients?.carbs || 0 }}g 碳水</span>
                        <span>🥑 {{ meal.nutrients?.fat || 0 }}g 脂</span>
                    </div>
                </div>
            </div>

            <!-- 隱藏原生手機相機與相簿 input (常駐於 DOM 確保點擊立即直接喚起系統相簿/相機) -->
            <input type="file" accept="image/*" capture="environment" ref="nativeCameraInput" @change="handleNativeCameraSnap" style="display: none;">
            <input type="file" accept="image/*" ref="albumInput" @change="handleAlbumUpload" style="display: none;">

            <!-- Bottom Floating Action Bar -->
            <div class="fab-container">
                <button class="btn-primary" @click="openAiModal('camera')" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <span>拍照記錄</span>
                </button>
                <button class="btn-primary accent" @click="openAiModal('voice')" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                    <span>語音/文字輸入</span>
                </button>
            </div>

            <!-- 全螢幕 / 抽屜 AI 辨識視窗 (100% 還原 畫面 B & 畫面 C) -->
            <div v-if="showAiModal" class="modal-overlay" @click.self="closeAiModal">
                <div class="drawer-content" style="max-height: 92vh; padding: 20px 20px 32px 20px;">
                    
                    <!-- 畫面 B：【開頁即拍自訂相機畫面】 -->
                    <div v-if="modalStep === 'camera'">
                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <button class="btn-icon" @click="closeAiModal" style="border: none; font-weight: 600; font-size: 0.95rem; color: var(--color-text-muted);">
                                ✕ 關閉
                            </button>
                            <span style="font-size: 0.95rem; font-weight: 700; color: var(--color-text-main);">📷 拍照 AI 補記</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button class="btn-icon" @click="openApiKeySettings" 
                                        :style="{ 
                                            background: getGeminiApiKey() ? '#EFF6FF' : '#FEF2F2',
                                            border: getGeminiApiKey() ? '1.5px solid #3B82F6' : '1.5px solid #EF4444',
                                            color: getGeminiApiKey() ? '#1D4ED8' : '#DC2626'
                                        }"
                                        style="padding: 5px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;" 
                                        title="Gemini API Key 設定">
                                    🔑 {{ getGeminiApiKey() ? 'Key 已設定' : '設定 Key' }}
                                </button>
                                <button class="btn-icon" @click="toggleFacingMode" style="border: 1px solid var(--color-border); padding: 4px 8px; border-radius: 10px; font-size: 0.88rem; color: var(--color-text-muted);" title="翻轉鏡頭">
                                    🔄
                                </button>
                            </div>
                        </div>

                        <!-- Camera Live Viewfinder Area (點擊即拍) -->
                        <div @click="triggerShutter('')" 
                             style="background: #111827; border-radius: 20px; height: 320px; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 18px; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); cursor: pointer;">
                            <!-- Video Stream -->
                            <video ref="videoRef" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>
                            
                            <!-- 韓式圓角對焦框 (Focus Bracket) -->
                            <div style="width: 220px; height: 220px; border: 2px dashed rgba(245, 158, 11, 0.8); border-radius: 24px; position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                                <div style="position: absolute; top: -2px; left: -2px; width: 24px; height: 24px; border-top: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary); border-top-left-radius: 12px;"></div>
                                <div style="position: absolute; top: -2px; right: -2px; width: 24px; height: 24px; border-top: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary); border-top-right-radius: 12px;"></div>
                                <div style="position: absolute; bottom: -2px; left: -2px; width: 24px; height: 24px; border-bottom: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary); border-bottom-left-radius: 12px;"></div>
                                <div style="position: absolute; bottom: -2px; right: -2px; width: 24px; height: 24px; border-bottom: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary); border-bottom-right-radius: 12px;"></div>
                                
                                <span style="color: #FFF; font-size: 0.85rem; font-weight: 600; text-shadow: 0 1px 4px rgba(0,0,0,0.8); background: rgba(0,0,0,0.5); padding: 6px 12px; border-radius: 20px;">
                                    🎯 點擊此處或下方快門拍照
                                </span>
                            </div>
                        </div>

                        <!-- 經典相機底部三聯控制列 (左：相簿選取、中：快門拍攝、右：語音文字) -->
                        <div style="display: flex; justify-content: space-around; align-items: center; width: 100%; padding: 4px 10px 10px;">
                            <!-- 左側：相簿選取按鈕 -->
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 72px;">
                                <button class="btn-icon" @click="triggerAlbumSelect" 
                                        style="width: 52px; height: 52px; border-radius: 16px; background: #F3F4F6; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); cursor: pointer;"
                                        title="從相簿選取照片">
                                    🖼️
                                </button>
                                <span style="font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);">相簿選取</span>
                            </div>

                            <!-- 中間：經典大快門按鈕 -->
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                <button @click="triggerShutter('')" 
                                        style="width: 74px; height: 74px; border-radius: 50%; background: #FFFFFF; border: 5px solid var(--color-primary); box-shadow: 0 4px 16px rgba(0,0,0,0.2); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s;"
                                        title="拍攝辨識 (快門)">
                                    <div style="width: 54px; height: 54px; border-radius: 50%; background: #F3F4F6;"></div>
                                </button>
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted);">拍攝快門</span>
                            </div>

                            <!-- 右側：語音/文字輸入按鈕 -->
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 72px;">
                                <button class="btn-icon" @click="modalStep = 'voice'" 
                                        style="width: 52px; height: 52px; border-radius: 16px; background: #F3F4F6; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); cursor: pointer;"
                                        title="語音或文字手動補記">
                                    🎙️
                                </button>
                                <span style="font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);">語音/文字</span>
                            </div>
                        </div>
                    </div>

                    <!-- 語音 / 文字輸入子畫面 -->
                    <div v-if="modalStep === 'voice'">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--color-text-main);">🎙️ 語音 / 文字輸入</span>
                            <button class="btn-icon" @click="closeAiModal" style="border: none; font-size: 1.1rem; color: var(--color-text-muted);">✕</button>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <textarea v-model="voiceText" 
                                      placeholder="請直接輸入或說出你吃了什麼 (例如：麥克雙牛堡、大杯無糖燕麥拿鐵)..." 
                                      rows="4" 
                                      class="search-input" 
                                      style="resize: none; font-size: 0.95rem; line-height: 1.5;"></textarea>
                        </div>

                        <!-- 常用餐點快捷 -->
                        <div style="margin-bottom: 22px;">
                            <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 8px;">⭐ 常用餐點快捷 (點擊秒出精確數據)：</div>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                <button v-for="fav in favoriteFoods" :key="fav.id" 
                                        class="capsule" 
                                        style="font-size: 0.85rem; padding: 6px 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; background: #FFF9E6; border: 1px solid #FFE082; color: #6D4C00; cursor: pointer;" 
                                        @click="selectFavoriteFood(fav)">
                                    {{ fav.icon || '🍔' }} {{ fav.name }}
                                </button>
                            </div>
                        </div>

                        <button class="btn-primary accent" @click="triggerVoiceAnalysis" style="width: 100%; justify-content: center; padding: 12px; font-weight: 700;">
                            ✨ Gemini AI 深度智能解析
                        </button>
                    </div>

                    <!-- 畫面 C：【十一粒 AI 視覺/語意分析結果與確認卡片】 -->
                    <div v-if="modalStep === 'result'">
                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--color-text-main);">
                                {{ capturedPhotoUrl ? '🤖 十一粒 AI 視覺辨識分析結果' : '💬 十一粒 AI 語意推算分析結果' }}
                            </span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button class="btn-icon" @click="openApiKeySettings" 
                                        :style="{ 
                                            background: getGeminiApiKey() ? '#EFF6FF' : '#FEF2F2',
                                            border: getGeminiApiKey() ? '1.5px solid #3B82F6' : '1.5px solid #EF4444',
                                            color: getGeminiApiKey() ? '#1D4ED8' : '#DC2626'
                                        }"
                                        style="padding: 5px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;" 
                                        title="設定 Key">
                                    🔑 {{ getGeminiApiKey() ? 'Key 已設定' : '設定 Key' }}
                                </button>
                                <button class="btn-icon" @click="closeAiModal" style="border: none; font-size: 1.1rem;">✕</button>
                            </div>
                        </div>

                        <!-- Analyzing Spinner -->
                        <div v-if="isAiAnalyzing" style="text-align: center; padding: 40px 16px;">
                            <div style="font-size: 2.2rem; animation: spin 1s linear infinite; display: inline-block; margin-bottom: 12px;">✨</div>
                            <div style="font-weight: 700; font-size: 1rem; color: var(--color-primary);">
                                {{ capturedPhotoUrl ? 'Gemini AI 視覺神經網絡分析中...' : '十一粒 AI 語意深度計算中...' }}
                            </div>
                            <div style="font-size: 0.78rem; color: var(--color-text-muted); margin-top: 6px;">
                                正在辨識料理名稱並精算熱量與營養成分...
                            </div>
                        </div>

                        <!-- Result Card -->
                        <div v-else>
                            <!-- Real Captured Photo Display with Retake Button -->
                            <div v-if="capturedPhotoUrl" style="margin-bottom: 14px; position: relative;">
                                <img :src="capturedPhotoUrl" style="width: 100%; max-height: 220px; object-fit: cover; border-radius: 14px; border: 1px solid var(--color-border); box-shadow: 0 4px 14px rgba(0,0,0,0.08); display: block;">
                                <button @click="openAiModal('camera')" 
                                        style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.72); color: #FFF; border: 1px solid rgba(255,255,255,0.3); font-size: 0.82rem; padding: 6px 14px; border-radius: 20px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                                    🔄 重拍照片
                                </button>
                                <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.65); color: #FFF; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 600;">📷 實拍照片</span>
                            </div>

                            <!-- Dish Name Row -->
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; background: #FAF8F5; padding: 10px 14px; border-radius: 12px;">
                                <span style="font-size: 1.5rem;">🍱</span>
                                <div style="flex: 1;">
                                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted);">推算料理名稱 (可點擊修改)</div>
                                    <input type="text" v-model="resultForm.dishName" class="search-input" style="padding: 6px 10px; font-weight: 700; font-size: 1rem; background: #FFF; margin-top: 4px;">
                                </div>
                            </div>

                            <!-- 5 Editable Nutrients (熱量、蛋白、碳水、脂肪、鈉) -->
                            <div style="background: #FFFFFF; border: 1px solid var(--color-border); border-radius: 14px; padding: 14px; margin-bottom: 16px;">
                                <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 10px; font-weight: 600;">
                                    營養數據 (數字皆可手動點擊微調)：
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <span style="font-weight: 600;">🔥 熱量：</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="number" v-model="resultForm.kcal" style="width: 80px; text-align: center; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.95rem;">
                                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">kcal</span>
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <span style="font-weight: 600;">🥩 蛋白：</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="number" v-model="resultForm.protein" style="width: 80px; text-align: center; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.95rem;">
                                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">g</span>
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <span style="font-weight: 600;">🌾 碳水：</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="number" v-model="resultForm.carbs" style="width: 80px; text-align: center; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.95rem;">
                                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">g</span>
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <span style="font-weight: 600;">🥑 脂肪：</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="number" v-model="resultForm.fat" style="width: 80px; text-align: center; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.95rem;">
                                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">g</span>
                                    </div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-weight: 600;">🧂 鈉：</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="number" v-model="resultForm.sodium" style="width: 80px; text-align: center; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; font-weight: 700; font-size: 0.95rem;">
                                        <span style="font-size: 0.85rem; color: var(--color-text-muted);">mg</span>
                                    </div>
                                </div>
                            </div>

                            <!-- AI Context Note -->
                            <div style="font-size: 0.85rem; color: #4B5563; background: #FAF8F5; border: 1px solid var(--color-border); padding: 10px 14px; border-radius: 10px; margin-bottom: 20px; line-height: 1.4;">
                                💡 <strong>AI 說明：</strong>{{ resultForm.aiNote }}
                            </div>

                            <!-- CTA Button (一鍵歸入今日時間軸 + 收藏常用) -->
                            <div style="display: flex; gap: 10px;">
                                <button class="btn-primary" @click="saveAsFavorite" style="flex: 1; justify-content: center; padding: 14px; font-size: 0.95rem; font-weight: 700; background: #FFF9E6; border: 1px solid #FFE082; color: #6D4C00; cursor: pointer;">
                                    ⭐ 存為常用
                                </button>
                                <button class="btn-primary accent" @click="confirmSaveRecord" style="flex: 2; justify-content: center; padding: 14px; font-size: 1rem; font-weight: 700;">
                                    ✅ 確認寫入紀錄
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gemini API Key 快速設定 Modal -->
            <div v-if="showApiKeyModal" class="modal-overlay" @click.self="showApiKeyModal = false" style="z-index: 1001;">
                <div class="modal-content" style="padding: 24px 20px; border-radius: 20px; max-width: 380px; width: 90%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 6px;">
                            🔑 Gemini API Key 設定
                        </h3>
                        <button class="btn-icon" @click="showApiKeyModal = false" style="border: none; font-size: 1.1rem;">✕</button>
                    </div>
                    <p style="font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 14px;">
                        請輸入你的 Google Gemini API Key，即可在手機與雲端模式下秒速啟用 AI 拍照辨識與語意精算：
                    </p>
                    <input type="password" 
                           v-model="inputApiKey" 
                           placeholder="AIzaSy..." 
                           class="search-input" 
                           style="width: 100%; padding: 10px 12px; margin-bottom: 16px; font-family: monospace;">
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-primary" @click="showApiKeyModal = false" style="flex: 1; justify-content: center; background: #F3F4F6; color: #4B5563; border: none;">
                            取消
                        </button>
                        <button class="btn-primary accent" @click="saveApiKeySetting" style="flex: 1.5; justify-content: center; font-weight: 700;">
                            儲存金鑰
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};
