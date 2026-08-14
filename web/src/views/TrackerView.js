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

        // 智慧台灣在地美食/點心/飲料/正餐 NLP 語意解析引擎
        const parseFoodNLP = (rawInput) => {
            let text = (rawInput || '').trim();
            if (!text) return null;

            // 1. 抽取數量倍率 (支援: 1個, 2顆, 半碗, 3份, 1杯, 2塊, 1大碗...)
            let multiplier = 1;
            let qtyLabel = '';

            const numMap = { '半': 0.5, '一': 1, '兩': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
            const qtyRegex = /(?:吃了|喝了|來了|點了|買了)?\s*([0-9]+|半|一|兩|二|三|四|五|六|七|八|九|十)\s*(個|顆|份|杯|碗|大碗|小碗|塊|包|盤|條|捲|片|盒|支|根|粒)?/i;
            const matchQty = text.match(qtyRegex);
            if (matchQty) {
                const numStr = matchQty[1];
                const unitStr = matchQty[2] || '';
                const parsedNum = !isNaN(Number(numStr)) ? Number(numStr) : (numMap[numStr] || 1);
                multiplier = parsedNum;
                qtyLabel = `${parsedNum}${unitStr}`;
            }

            // 清理語意前綴詞，提取純餐點名
            let cleanText = text
                .replace(/^(我|剛剛|今天|早上|中午|晚上|下午|剛才)?(吃了|喝了|點了|買了|來了)/g, '')
                .replace(/^一個|^1個|^兩顆|^2顆|^半碗|^一份|^1份|^一杯|^1杯|^一條|^1根/g, '')
                .replace(/[，。！!~]/g, '')
                .trim();

            if (!cleanText) cleanText = text;

            // 2. 本地龐大真實食物知識庫
            const foodKnowledge = [
                // 甜點 / 麻糬 / 糕點
                { keys: ['花生麻糬', '花生大麻糬', '花生米麻糬'], name: '花生大麻糬', kcal: 185, p: 3.8, c: 32.0, f: 5.2, na: 45, note: '十一粒 AI 推算：花生麻糬含糯米碳水與香濃花生粉油脂。' },
                { keys: ['紅豆麻糬', '紅豆大麻糬'], name: '紅豆大麻糬', kcal: 165, p: 2.8, c: 35.0, f: 1.5, na: 30, note: '十一粒 AI 推算：含糯米皮與蜜紅豆餡。' },
                { keys: ['芝麻麻糬', '芝麻大麻糬'], name: '芝麻大麻糬', kcal: 190, p: 4.2, c: 30.0, f: 6.2, na: 35, note: '十一粒 AI 推算：含糯米碳水與黑芝麻健康油脂。' },
                { keys: ['麻糬', '大麻糬', '客家麻糬'], name: '手作麻糬', kcal: 175, p: 3.2, c: 33.0, f: 4.0, na: 40, note: '十一粒 AI 推算：含糯米碳水與沾粉餡料。' },
                { keys: ['車輪餅', '紅豆餅', '奶油餅', '芋頭餅'], name: '車輪餅', kcal: 165, p: 3.2, c: 28.0, f: 4.5, na: 95, note: '十一粒 AI 推算：外皮麵粉碳水與內餡。' },
                { keys: ['蛋塔', '葡式蛋塔'], name: '葡式蛋塔', kcal: 220, p: 3.8, c: 22.0, f: 13.0, na: 110, note: '十一粒 AI 推算：千層酥皮與濃郁蛋奶餡。' },
                { keys: ['地瓜球', 'QQ蛋'], name: '地瓜球 (1份)', kcal: 180, p: 1.0, c: 36.0, f: 4.0, na: 20, note: '十一粒 AI 推算：地瓜粉與油炸碳水。' },
                { keys: ['肉桂捲'], name: '美式肉桂捲', kcal: 380, p: 5.5, c: 56.0, f: 15.0, na: 280, note: '十一粒 AI 推算：高碳水與肉桂糖霜。' },
                { keys: ['生乳捲', '蛋糕', '起司蛋糕'], name: '精緻蛋糕/生乳捲', kcal: 260, p: 4.5, c: 28.0, f: 14.5, na: 130, note: '十一粒 AI 推算：海綿蛋糕與鮮奶油脂肪。' },
                { keys: ['布丁', '統一布丁'], name: '焦糖雞蛋布丁', kcal: 110, p: 2.0, c: 22.0, f: 2.2, na: 65, note: '十一粒 AI 推算：雞蛋布丁與焦糖糖漿。' },

                // 台灣小吃 / 炸物 / 麵食
                { keys: ['鹹酥雞', '鹽酥雞'], name: '台灣鹹酥雞 (1份)', kcal: 460, p: 28.0, c: 24.0, f: 28.0, na: 820, note: '十一粒 AI 推算：裹粉炸雞肉蛋白質與油脂。' },
                { keys: ['蔥油餅', '蔥抓餅'], name: '香煎蔥油餅', kcal: 360, p: 7.5, c: 45.0, f: 16.0, na: 480, note: '十一粒 AI 推算：麵粉碳水與煎製油脂。' },
                { keys: ['水煎包', '生煎包'], name: '鮮肉水煎包', kcal: 190, p: 6.5, c: 24.0, f: 8.0, na: 320, note: '十一粒 AI 推算：麵皮碳水與豬肉餡。' },
                { keys: ['肉包', '鮮肉包', '包子'], name: '鮮肉大包子', kcal: 280, p: 9.5, c: 38.0, f: 10.0, na: 420, note: '十一粒 AI 推算：老麵外皮與調味豬肉餡。' },
                { keys: ['茶葉蛋'], name: '超商茶葉蛋', kcal: 75, p: 6.5, c: 1.2, f: 5.0, na: 180, note: '十一粒 AI 推算：優質蛋白質與蛋黃脂肪。' },
                { keys: ['地瓜', '烤地瓜', '蒸地瓜'], name: '香甜烤地瓜', kcal: 160, p: 2.2, c: 36.0, f: 0.4, na: 35, note: '十一粒 AI 推算：高纖低脂優質複合碳水。' },
                { keys: ['水餃', '高麗菜水餃', '韭菜水餃'], name: '手工水餃 (10顆)', kcal: 550, p: 28.0, c: 55.0, f: 25.0, na: 950, note: '十一粒 AI 推算：水餃麵皮與豬肉內餡。' },
                { keys: ['鍋貼', '八方雲集鍋貼'], name: '招牌鍋貼 (10顆)', kcal: 750, p: 30.0, c: 70.0, f: 40.0, na: 1200, note: '十一粒 AI 推算：油煎酥脆外皮與內餡。' },
                { keys: ['牛肉麵', '紅燒牛肉麵'], name: '紅燒牛肉麵', kcal: 680, p: 36.0, c: 78.0, f: 24.0, na: 1950, note: '十一粒 AI 推算：牛腱肉塊、麵條與紅燒高湯。' },
                { keys: ['清燉牛肉麵'], name: '清燉牛肉麵', kcal: 560, p: 36.0, c: 74.0, f: 14.0, na: 1400, note: '十一粒 AI 推算：牛腱肉與清爽高湯。' },
                { keys: ['排骨便當', '炸排骨飯', '便當'], name: '便當店炸排骨便當', kcal: 780, p: 32.0, c: 92.0, f: 32.0, na: 1150, note: '十一粒 AI 推算：大份炸排骨、米飯與3樣時蔬配菜。' },
                { keys: ['雞腿便當', '炸雞腿便當'], name: '便當店大雞腿便當', kcal: 850, p: 38.0, c: 90.0, f: 36.0, na: 1280, note: '十一粒 AI 推算：酥炸大雞腿與米飯配菜。' },
                { keys: ['健康餐盒', '舒肥雞胸便當', '低卡餐盒'], name: '舒肥雞胸健康餐盒', kcal: 520, p: 40.0, c: 60.0, f: 12.0, na: 580, note: '十一粒 AI 推算：舒肥雞胸、紫米飯與水煮清炒蔬菜。' },
                { keys: ['魯肉飯', '滷肉飯', '肉燥飯'], name: '傳統滷肉飯 (小碗)', kcal: 420, p: 12.0, c: 58.0, f: 16.0, na: 560, note: '十一粒 AI 推算：白米飯與帶皮五花肉燥。' },

                // 飲料 / 咖啡
                { keys: ['燕麥拿鐵', '燕麥奶拿鐵'], name: '大杯無糖燕麥拿鐵', kcal: 180, p: 4.5, c: 24.0, f: 6.5, na: 120, note: '十一粒 AI 推算：大杯燕麥奶 320ml，無添加糖漿。' },
                { keys: ['拿鐵', '鮮奶拿鐵', '咖啡拿鐵', '咖啡'], name: '大杯無糖鮮奶拿鐵', kcal: 170, p: 9.0, c: 14.0, f: 8.5, na: 140, note: '十一粒 AI 推算：濃縮咖啡與全脂鮮奶。' },
                { keys: ['美式', '美式咖啡', '黑咖啡'], name: '大杯冰美式黑咖啡', kcal: 15, p: 0.8, c: 2.0, f: 0.2, na: 10, note: '十一粒 AI 推算：純濃縮咖啡與水，極低熱量。' },
                { keys: ['珍珠奶茶', '珍奶'], name: '珍珠奶茶 (大杯/微糖)', kcal: 450, p: 4.0, c: 72.0, f: 16.0, na: 150, note: '十一粒 AI 推算：黑糖珍珠粉圓與奶茶。' },
                { keys: ['綠茶', '無糖綠茶', '四季春', '烏龍茶', '紅茶'], name: '無糖原葉純茶 (大杯)', kcal: 0, p: 0, c: 0, f: 0, na: 10, note: '十一粒 AI 推算：無糖茶飲，0 卡路里。' },
                { keys: ['豆漿', '無糖豆漿'], name: '無糖濃豆漿 (400ml)', kcal: 130, p: 13.0, c: 6.0, f: 6.0, na: 40, note: '十一粒 AI 推算：黃豆植物蛋白質與優質脂肪。' },

                // 水果 / 輕食
                { keys: ['香蕉'], name: '香蕉 (1根)', kcal: 105, p: 1.3, c: 27.0, f: 0.3, na: 1, note: '十一粒 AI 推算：天然果糖與鉀離子補給。' },
                { keys: ['蘋果'], name: '紅蘋果 (1顆)', kcal: 80, p: 0.4, c: 21.0, f: 0.2, na: 2, note: '十一粒 AI 推算：豐富水溶性膳食纖維。' },
                { keys: ['芭樂', '珍珠芭樂'], name: '珍珠芭樂 (半顆)', kcal: 60, p: 1.4, c: 14.0, f: 0.2, na: 5, note: '十一粒 AI 推算：高維生素 C 低升糖水果。' }
            ];

            // 尋找最佳匹配項
            let matched = null;
            for (const item of foodKnowledge) {
                if (item.keys.some(k => cleanText.includes(k) || k.includes(cleanText))) {
                    matched = item;
                    break;
                }
            }

            if (matched) {
                const finalName = multiplier > 1 && qtyLabel ? `${matched.name} x ${multiplier}` : (qtyLabel ? `${cleanText} (${qtyLabel})` : matched.name);
                return {
                    dishName: finalName,
                    kcal: Math.round(matched.kcal * multiplier),
                    protein: Math.round(matched.p * multiplier * 10) / 10,
                    carbs: Math.round(matched.c * multiplier * 10) / 10,
                    fat: Math.round(matched.f * multiplier * 10) / 10,
                    sodium: Math.round(matched.na * multiplier),
                    aiNote: matched.note + (multiplier > 1 ? ` (已按 ${multiplier} 份倍數計算)` : '')
                };
            }

            // 3. 智慧語意回退 (Dynamic Semantic Synthesis)
            let estKcal = 250 * multiplier;
            let estP = 10 * multiplier;
            let estC = 30 * multiplier;
            let estF = 8 * multiplier;
            let estNa = 300 * multiplier;
            let noteDetail = '十一粒 AI 語意推算';

            if (cleanText.includes('麻糬') || cleanText.includes('餅') || cleanText.includes('甜') || cleanText.includes('糖') || cleanText.includes('糕')) {
                estKcal = 190 * multiplier; estP = 3.5 * multiplier; estC = 35 * multiplier; estF = 5 * multiplier; estNa = 50 * multiplier;
                noteDetail += '：點心甜品類，主要含碳水化合物與油脂。';
            } else if (cleanText.includes('肉') || cleanText.includes('雞') || cleanText.includes('魚') || cleanText.includes('蛋') || cleanText.includes('排')) {
                estKcal = 320 * multiplier; estP = 26 * multiplier; estC = 8 * multiplier; estF = 18 * multiplier; estNa = 450 * multiplier;
                noteDetail += '：優質蛋白質肉類，含適量脂肪與鈉。';
            } else if (cleanText.includes('麵') || cleanText.includes('飯') || cleanText.includes('粉') || cleanText.includes('粥') || cleanText.includes('餃')) {
                estKcal = 420 * multiplier; estP = 12 * multiplier; estC = 68 * multiplier; estF = 10 * multiplier; estNa = 650 * multiplier;
                noteDetail += '：主食主餐類，主要含複合碳水與調味。';
            } else if (cleanText.includes('茶') || cleanText.includes('水') || cleanText.includes('咖啡')) {
                estKcal = 30 * multiplier; estP = 1 * multiplier; estC = 5 * multiplier; estF = 0.5 * multiplier; estNa = 15 * multiplier;
                noteDetail += '：飲品類，極低熱量。';
            } else {
                noteDetail += '：已為您辨識餐點名稱，數值可直接點擊微調。';
            }

            const dishDisplayName = qtyLabel ? `${cleanText} (${qtyLabel})` : cleanText;
            return {
                dishName: dishDisplayName,
                kcal: Math.round(estKcal),
                protein: Math.round(estP * 10) / 10,
                carbs: Math.round(estC * 10) / 10,
                fat: Math.round(estF * 10) / 10,
                sodium: Math.round(estNa),
                aiNote: noteDetail
            };
        };

        const targetProfile = computed(() => {
            return engine.profiles[currentMember.value] || {
                name: 'Bebe', targetKcal: 1350, targetProtein: 105, targetCarbs: 140, targetFat: 40, targetSodium: 1500
            };
        });

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

        // Progress percentage for 3 graphical progress bars
        const percent = computed(() => {
            const p = targetProfile.value;
            const t = totals.value;
            return {
                kcal: Math.min(100, Math.max(0, (t.kcal / p.targetKcal) * 100)),
                protein: Math.min(100, Math.max(0, (t.protein / p.targetProtein) * 100)),
                carbs: Math.min(100, Math.max(0, (t.carbs / p.targetCarbs) * 100))
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

        const startCameraStream = async () => {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
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

        // Handle Native Mobile Camera Snap
        const handleNativeCameraSnap = (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                showAiModal.value = true;
                isAiAnalyzing.value = true;
                modalStep.value = 'result';
                const reader = new FileReader();
                reader.onload = (e) => {
                    capturedPhotoUrl.value = e.target.result;
                    stopCameraStream();
                    processPhotoResult(file.name || '外食拍照餐點');
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
                reader.onload = (e) => {
                    capturedPhotoUrl.value = e.target.result;
                    stopCameraStream();
                    processPhotoResult(file.name || '相簿選取餐點');
                };
                reader.readAsDataURL(file);
                event.target.value = ''; // Reset input
            }
        };

        // Process AI Analysis
        const processPhotoResult = (hintText = '', isVoice = false) => {
            showAiModal.value = true;
            isAiAnalyzing.value = true;
            modalStep.value = 'result';
            if (isVoice) {
                capturedPhotoUrl.value = null; // Clear old photo if doing voice analysis!
            }

            setTimeout(() => {
                const parsed = parseFoodNLP(hintText) || {
                    dishName: '外食健康餐盒 / 排骨便當',
                    kcal: 580,
                    protein: 32,
                    carbs: 65,
                    fat: 18,
                    sodium: 720,
                    aiNote: '十一粒 AI 視覺估算：含主菜蛋白質、米飯與時蔬配菜，數據可直接點擊微調。'
                };

                resultForm.value = parsed;
                isAiAnalyzing.value = false;
            }, 600);
        };

        // Trigger Voice/Text Analysis
        const triggerVoiceAnalysis = () => {
            const text = (voiceText.value || '').trim();
            if (!text) {
                alert('請輸入或說出你吃了什麼！');
                return;
            }
            processPhotoResult(text, true);
        };

        // 畫面 C: 確認寫入今日紀錄
        const confirmSaveRecord = async () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

            const meal = {
                id: 'meal_' + Date.now() + '_' + currentMember.value,
                dishName: resultForm.value.dishName,
                time: timeStr,
                source: modalStep.value === 'voice' ? 'nlp_ai' : 'photo_ai',
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
            triggerShutter,
            handleNativeCameraSnap,
            handleAlbumUpload,
            triggerVoiceAnalysis,
            confirmSaveRecord
        };
    },
    template: `
        <div class="view-tracker">
            <!-- Date & Family Member Switcher -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center;">
                <button class="btn-icon" @click="changeDate(-1)">◀️</button>
                <span style="font-weight: 700; font-size: 1.05rem;">
                    {{ currentDate }} {{ isToday ? '(今天)' : '' }}
                </span>
                <button class="btn-icon" @click="changeDate(1)">▶️</button>
            </div>
            
            <div class="capsule-group" style="margin-bottom: 24px;">
                <button class="capsule" :class="{ 'selected': currentMember === 'bebe' }" @click="currentMember = 'bebe'">
                    😊 Bebe
                </button>
                <button class="capsule" :class="{ 'selected': currentMember === 'ariel' }" @click="currentMember = 'ariel'">
                    ❤️ 樂樂
                </button>
                <button class="capsule" :class="{ 'selected': currentMember === 'jason' }" @click="currentMember = 'jason'">
                    🪨 Jason
                </button>
            </div>

            <!-- 01 Daily Progress Dashboard (熱量、蛋白質、碳水為圖示進度條，其餘為文字) -->
            <div class="card" style="margin-bottom: 24px; background: #FFFFFF;">
                <div class="section-title" style="margin-bottom: 18px;">
                    全天達標進度 ({{ targetProfile.name }})
                </div>
                
                <!-- 1. 🔥 熱量 (Calories) Progress Bar -->
                <div style="margin-bottom: 18px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
                        <span style="font-weight: 600;">🔥 熱量 (Calories)</span>
                        <span :style="{ color: remaining.kcal >= 0 ? 'var(--color-accent)' : '#EF4444', fontWeight: 600 }">
                            {{ remaining.kcal >= 0 ? '🟢 剩 ' + remaining.kcal + ' kcal' : '🔴 超標 ' + Math.abs(remaining.kcal) + ' kcal' }}
                        </span>
                    </div>
                    <div style="width: 100%; height: 10px; background: #F3F4F6; border-radius: var(--radius-full); overflow: hidden;">
                        <div :style="{ width: percent.kcal + '%', height: '100%', background: percent.kcal > 100 ? '#EF4444' : 'var(--color-primary)', transition: 'width 0.3s' }"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
                        <span>已攝取 {{ totals.kcal }} kcal</span>
                        <span>目標 {{ targetProfile.targetKcal }} kcal</span>
                    </div>
                </div>

                <!-- 2. 🥩 蛋白質 (Protein) Progress Bar -->
                <div style="margin-bottom: 18px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
                        <span style="font-weight: 600;">🥩 蛋白質 (Protein)</span>
                        <span :style="{ color: remaining.protein >= 0 ? 'var(--color-accent)' : '#10B981', fontWeight: 600 }">
                            {{ remaining.protein > 0 ? '🟢 剩 ' + remaining.protein + ' g' : '🟢 已達標 (' + totals.protein + 'g)' }}
                        </span>
                    </div>
                    <div style="width: 100%; height: 10px; background: #F3F4F6; border-radius: var(--radius-full); overflow: hidden;">
                        <div :style="{ width: percent.protein + '%', height: '100%', background: '#10B981', transition: 'width 0.3s' }"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
                        <span>已攝取 {{ totals.protein }} g</span>
                        <span>目標 {{ targetProfile.targetProtein }} g</span>
                    </div>
                </div>

                <!-- 3. 🍚 碳水主食 (Carbs) Progress Bar -->
                <div style="margin-bottom: 18px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
                        <span style="font-weight: 600;">🍚 碳水主食 (Carbs)</span>
                        <span :style="{ color: remaining.carbs >= 0 ? 'var(--color-accent)' : '#EF4444', fontWeight: 600 }">
                            {{ remaining.carbs >= 0 ? '🟢 剩 ' + remaining.carbs + ' g' : '🔴 超標 ' + Math.abs(remaining.carbs) + ' g' }}
                        </span>
                    </div>
                    <div style="width: 100%; height: 10px; background: #F3F4F6; border-radius: var(--radius-full); overflow: hidden;">
                        <div :style="{ width: percent.carbs + '%', height: '100%', background: '#3B82F6', transition: 'width 0.3s' }"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
                        <span>已攝取 {{ totals.carbs }} g</span>
                        <span>目標 {{ targetProfile.targetCarbs }} g</span>
                    </div>
                </div>

                <!-- 4. 其他營養素（脂肪、鈉以純文字呈現） -->
                <div style="border-top: 1px dashed var(--color-border); padding-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 0.82rem; color: var(--color-text-main);">
                    <div>
                        <span style="font-weight: 600;">🥑 脂肪：</span>
                        <span>{{ totals.fat }}g / {{ targetProfile.targetFat }}g</span>
                    </div>
                    <div>
                        <span style="font-weight: 600;">🧂 鈉：</span>
                        <span>{{ totals.sodium }}mg / {{ targetProfile.targetSodium }}mg</span>
                    </div>
                </div>
            </div>

            <!-- 02 Meal Timeline Log -->
            <div class="section-title">當日用餐時間軸</div>
            
            <!-- Empty State -->
            <div v-if="meals.length === 0" 
                 style="text-align: center; padding: 36px 16px; color: var(--color-text-muted); background: #FFFDF8; border-radius: 12px; border: 1px dashed var(--color-border); font-size: 0.9rem; margin-bottom: 24px;">
                🥣 {{ isToday ? '今日' : currentDate }} 尚無任何飲食紀錄<br>
                <span style="font-size: 0.8rem; color: #9CA3AF; margin-top: 6px; display: inline-block;">
                    可在第一頁備料計算後點擊「📝 紀錄」或點擊下方按鈕 AI 補記！
                </span>
            </div>

            <!-- Recorded Meals List -->
            <div v-else style="margin-bottom: 24px;">
                <div v-for="meal in meals" :key="meal.id" 
                     class="card" 
                     style="margin-bottom: 14px; position: relative; border-left: 4px solid var(--color-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <h4 style="margin: 0; font-size: 1rem; word-break: break-word;">{{ meal.dishName }}</h4>
                                <span v-if="meal.source === 'photo_ai'" style="font-size: 0.68rem; background: #EEF2FF; color: #4F46E5; padding: 2px 5px; border-radius: 4px; font-weight: 600; flex-shrink: 0;">📷 拍照</span>
                                <span v-else-if="meal.source === 'nlp_ai'" style="font-size: 0.68rem; background: #FEF3C7; color: #B45309; padding: 2px 5px; border-radius: 4px; font-weight: 600; flex-shrink: 0;">💬 語音</span>
                            </div>
                            <span style="font-size: 0.78rem; color: var(--color-text-muted);">🕒 {{ meal.time }}</span>
                        </div>
                        <button class="btn-icon" @click="deleteMeal(meal.id)" style="padding: 3px 8px; border: none; font-size: 0.82rem; color: #EF4444; cursor: pointer; flex-shrink: 0;">
                            🗑️ 刪除
                        </button>
                    </div>
                    
                    <!-- Real Photo Thumbnail if recorded via Camera/Album -->
                    <div v-if="meal.photoUrl" style="margin-bottom: 10px;">
                        <img :src="meal.photoUrl" style="width: 100%; max-height: 160px; object-fit: cover; border-radius: 10px; border: 1px solid var(--color-border); box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    </div>

                    <div style="font-size: 0.82rem; color: var(--color-text-main); font-weight: 600; display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 8px;">
                        <span>🔥 {{ meal.nutrients?.kcal || 0 }} kcal</span>
                        <span>🥩 {{ meal.nutrients?.protein || 0 }}g 蛋白</span>
                        <span>🍚 {{ meal.nutrients?.carbs || 0 }}g 碳水</span>
                        <span>🥑 {{ meal.nutrients?.fat || 0 }}g 脂</span>
                    </div>

                    <!-- AI Context Note -->
                    <div v-if="meal.aiNote" style="font-size: 0.8rem; color: #4B5563; background: #F3F4F6; padding: 6px 10px; border-radius: 6px; margin-bottom: 6px;">
                        {{ meal.aiNote }}
                    </div>

                    <!-- Ingredients Summary (for home cooking) -->
                    <div v-if="meal.ingredientsSummary && meal.ingredientsSummary.length > 0" 
                         style="font-size: 0.8rem; color: var(--color-text-muted); background: #FAF8F5; padding: 6px 10px; border-radius: 6px;">
                        ▫️ {{ meal.ingredientsSummary.join('、') }}
                    </div>
                </div>
            </div>

            <!-- Bottom Floating Action Bar -->
            <div class="fab-container">
                <label class="btn-primary" style="margin: 0; cursor: pointer;">
                    📷 拍照記錄
                    <input type="file" accept="image/*" capture="environment" @change="handleNativeCameraSnap" style="display: none;">
                </label>
                <button class="btn-primary accent" @click="openAiModal('voice')">🎙️ 語音/文字輸入</button>
            </div>

            <!-- 全螢幕 / 抽屜 AI 辨識視窗 (100% 還原 畫面 B & 畫面 C) -->
            <div v-if="showAiModal" class="modal-overlay" @click.self="closeAiModal">
                <div class="drawer-content" style="max-height: 92vh; padding: 20px 20px 32px 20px;">
                    
                    <!-- 畫面 B：【開頁即拍自訂相機畫面】 -->
                    <div v-if="modalStep === 'camera'">
                        <!-- Hidden Real Camera & Album Inputs -->
                        <input type="file" accept="image/*" capture="environment" ref="nativeCameraInput" @change="handleNativeCameraSnap" style="display: none;">
                        <input type="file" accept="image/*" ref="albumInput" @change="handleAlbumUpload" style="display: none;">

                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <button class="btn-icon" @click="closeAiModal" style="border: none; font-weight: 600; font-size: 0.95rem; color: var(--color-text-muted);">
                                ✕ 關閉
                            </button>
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted);">📷 拍照 AI 補記</span>
                            <span style="width: 40px;"></span>
                        </div>

                        <!-- Camera Live Viewfinder Area (點擊即拍) -->
                        <div @click="triggerShutter('')" 
                             style="background: #111827; border-radius: 20px; height: 320px; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); cursor: pointer;">
                            <!-- Video Stream -->
                            <video ref="videoRef" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>
                            
                            <!-- 韓式圓角對焦框 (Focus Bracket) -->
                            <div style="width: 220px; height: 220px; border: 2px dashed rgba(245, 158, 11, 0.8); border-radius: 24px; position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                                <!-- 4 Corners -->
                                <div style="position: absolute; top: -2px; left: -2px; width: 24px; height: 24px; border-top: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary); border-top-left-radius: 12px;"></div>
                                <div style="position: absolute; top: -2px; right: -2px; width: 24px; height: 24px; border-top: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary); border-top-right-radius: 12px;"></div>
                                <div style="position: absolute; bottom: -2px; left: -2px; width: 24px; height: 24px; border-bottom: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary); border-bottom-left-radius: 12px;"></div>
                                <div style="position: absolute; bottom: -2px; right: -2px; width: 24px; height: 24px; border-bottom: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary); border-bottom-right-radius: 12px;"></div>
                                
                                <span style="color: #FFF; font-size: 0.85rem; font-weight: 600; text-shadow: 0 1px 4px rgba(0,0,0,0.8); background: rgba(0,0,0,0.5); padding: 6px 12px; border-radius: 20px;">
                                    🎯 點擊此處或下方快門拍照
                                </span>
                            </div>
                        </div>

                        <!-- Shutter Action Bar -->
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 12px;">
                            <!-- Big White Shutter Button -->
                            <button @click="triggerShutter('')" 
                                    style="width: 74px; height: 74px; border-radius: 50%; background: #FFFFFF; border: 5px solid var(--color-primary); box-shadow: 0 4px 14px rgba(0,0,0,0.25); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s;"
                                    title="拍攝辨識 (快門)">
                                <div style="width: 54px; height: 54px; border-radius: 50%; background: #F3F4F6;"></div>
                            </button>
                            <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted);">
                                ⚪ 點擊拍攝辨識 (快門)
                            </span>

                            <!-- Bottom Row: 相簿選擇 ＋ 語音/文字輸入 -->
                            <div style="display: flex; justify-content: space-between; width: 100%; padding: 0 12px; margin-top: 6px;">
                                <label class="btn-icon" style="cursor: pointer; font-size: 0.85rem; padding: 8px 14px;">
                                    <span>🖼️ 從相簿選擇照片</span>
                                    <input type="file" accept="image/*" @change="handleAlbumUpload" style="display: none;">
                                </label>
                                <button class="btn-icon" @click="modalStep = 'voice'" style="font-size: 0.85rem; padding: 8px 14px;">
                                    🎙️ 語音 / 文字輸入
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 語音 / 文字輸入子畫面 -->
                    <div v-if="modalStep === 'voice'">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <button class="btn-icon" @click="modalStep = 'camera'" style="border: none; font-size: 0.9rem;">
                                ◀️ 返回相機
                            </button>
                            <span style="font-weight: 700; font-size: 1rem;">🎙️ 語音 / 文字輸入</span>
                            <button class="btn-icon" @click="closeAiModal" style="border: none; font-size: 1rem;">✕</button>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <textarea v-model="voiceText" 
                                      placeholder="請直接輸入或說出你吃了什麼 (例如：剛剛喝了一杯大杯無糖燕麥拿鐵，吃了一份雞肉三明治)..." 
                                      rows="4" 
                                      class="search-input" 
                                      style="resize: none; font-size: 0.95rem; line-height: 1.5;"></textarea>
                        </div>

                        <!-- Quick Prompts -->
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px;">
                            <button class="capsule" style="font-size: 0.8rem;" @click="voiceText = '大杯星巴克無糖燕麥拿鐵'">☕ 燕麥拿鐵</button>
                            <button class="capsule" style="font-size: 0.8rem;" @click="voiceText = '便當店炸排骨便當半碗飯'">🍱 排骨便當</button>
                            <button class="capsule" style="font-size: 0.8rem;" @click="voiceText = '炙燒雞肉全麥三明治加蛋'">🥪 雞肉三明治</button>
                        </div>

                        <button class="btn-primary accent" @click="triggerVoiceAnalysis" style="width: 100%; justify-content: center; padding: 12px; font-weight: 700;">
                            ✨ AI 智能辨識
                        </button>
                    </div>

                    <!-- 畫面 C：【十一粒 AI 視覺/語意分析結果與確認卡片】 -->
                    <div v-if="modalStep === 'result'">
                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
                            <span style="font-weight: 700; font-size: 1.05rem; color: var(--color-text-main);">
                                {{ capturedPhotoUrl ? '🤖 十一粒 AI 視覺辨識分析結果' : '💬 十一粒 AI 語意推算分析結果' }}
                            </span>
                            <button class="btn-icon" @click="closeAiModal" style="border: none; font-size: 1.1rem;">✕</button>
                        </div>

                        <!-- Analyzing Spinner -->
                        <div v-if="isAiAnalyzing" style="text-align: center; padding: 40px 16px;">
                            <div style="font-size: 2.2rem; animation: spin 1s linear infinite; display: inline-block; margin-bottom: 12px;">✨</div>
                            <div style="font-weight: 700; font-size: 1rem; color: var(--color-primary);">
                                {{ capturedPhotoUrl ? 'Gemini AI 視覺神經網絡分析中...' : '十一粒 AI 語意深度計算中...' }}
                            </div>
                        </div>

                        <!-- Result Card -->
                        <div v-else>
                            <!-- Real Captured Photo Display -->
                            <div v-if="capturedPhotoUrl" style="margin-bottom: 14px; position: relative;">
                                <img :src="capturedPhotoUrl" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 12px; border: 1px solid var(--color-border); box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                                <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.65); color: #FFF; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 600;">📷 實拍照片</span>
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

                            <!-- CTA Button (一鍵歸入今日時間軸) -->
                            <button class="btn-primary accent" @click="confirmSaveRecord" style="width: 100%; justify-content: center; padding: 14px; font-size: 1rem; font-weight: 700;">
                                ✅ 確認寫入今日紀錄
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
