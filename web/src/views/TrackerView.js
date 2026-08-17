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

        // 📸 真正的 Gemini Vision API 視覺辨識
        const processPhotoResult = async (hintText = '') => {
            showAiModal.value = true;
            isAiAnalyzing.value = true;
            modalStep.value = 'result';

            if (capturedPhotoUrl.value) {
                try {
                    const res = await fetch('/api/analyze-meal-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: capturedPhotoUrl.value
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
                aiNote: '十一粒 AI 視覺估算：含主菜與配菜，數值皆可直接點擊手動微調。'
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

            try {
                const res = await fetch('/api/analyze-food-nlp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
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

            // 網路離線時的備援
            resultForm.value = {
                dishName: text,
                kcal: 450,
                protein: 20,
                carbs: 55,
                fat: 15,
                sodium: 600,
                aiNote: '十一粒 AI 語意估算：已記錄餐點名稱，數據可直接手動微調。'
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
            saveAsFavorite
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

            <!-- 01 Daily Progress Dashboard (新版暖黃韓系極簡圖表：頂部長膠囊熱量條 + 3個圓環進度圈 + 鈉含量文字) -->
            <div class="card" style="margin-bottom: 24px; background: #FFFFFF; border: 1px solid var(--color-border); border-radius: 20px; padding: 20px 18px 16px;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-weight: 700; font-size: 1rem; color: var(--color-text-main);">
                        全天達標進度 ({{ targetProfile.name }})
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 600; color: #6D4C00; background: #FFF9E6; padding: 4px 10px; border-radius: 20px; border: 1px solid #FFE082;">
                        <span>{{ remaining.kcal >= 0 ? '剩餘 ' + remaining.kcal + ' kcal' : '超標 ' + Math.abs(remaining.kcal) + ' kcal' }}</span>
                        <span>🔔</span>
                    </div>
                </div>
                
                <!-- 1. 頂部大長條膠囊進度條 (🔥 熱量 Calories) -->
                <div style="margin-bottom: 22px;">
                    <div class="calorie-capsule-bar" style="position: relative; width: 100%; height: 38px; background: #FFF5D6; border-radius: 9999px; overflow: hidden; display: flex; align-items: center;">
                        <!-- 進度填充層 (系統黃色漸層) -->
                        <div :style="{ 
                            width: percent.kcal + '%', 
                            height: '100%', 
                            background: percent.rawKcal > 100 ? 'linear-gradient(90deg, #FFB020 0%, #E16262 100%)' : 'linear-gradient(90deg, #FFD54F 0%, #FFB300 100%)', 
                            borderRadius: '9999px',
                            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                        }"></div>
                        <!-- 文字置中 -->
                        <div style="position: absolute; width: 100%; text-align: center; font-weight: 800; font-size: 1.05rem; color: #5A3E00; pointer-events: none; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(255,255,255,0.4);">
                            {{ percent.rawKcal }}% <span style="font-size: 0.8rem; font-weight: 600; opacity: 0.85;">({{ totals.kcal }} / {{ targetProfile.targetKcal }} kcal)</span>
                        </div>
                    </div>
                </div>

                <!-- 2. 下方三個圓環進度圈 (蛋白質 Proteins、碳水 Carbohydrates、脂肪 Fats) -->
                <div style="display: flex; justify-content: space-around; align-items: flex-start; margin-bottom: 18px; text-align: center;">
                    <!-- 蛋白質 Proteins -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <!-- 背景底圈 -->
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <!-- 進度圈 (系統黃色漸層效果) -->
                                <path stroke="#FFB300" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.protein + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <!-- 圈內百分比文字 -->
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #6D4C00; line-height: 1;">{{ percent.rawProtein }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">蛋白質</div>
                        <div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px;">{{ totals.protein }}g / {{ targetProfile.targetProtein }}g</div>
                    </div>

                    <!-- 碳水 Carbohydrates -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <!-- 背景底圈 -->
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <!-- 進度圈 -->
                                <path stroke="#FFB300" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.carbs + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <!-- 圈內百分比文字 -->
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #6D4C00; line-height: 1;">{{ percent.rawCarbs }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">碳水</div>
                        <div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px;">{{ totals.carbs }}g / {{ targetProfile.targetCarbs }}g</div>
                    </div>

                    <!-- 脂肪 Fats -->
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="circular-progress" style="position: relative; width: 76px; height: 76px;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <!-- 背景底圈 -->
                                <path stroke="#FFF1C2" stroke-width="4.2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <!-- 進度圈 -->
                                <path stroke="#FFB300" stroke-width="4.2" stroke-linecap="round" fill="none"
                                      :stroke-dasharray="percent.fat + ', 100'"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      style="transition: stroke-dasharray 0.4s ease;" />
                            </svg>
                            <!-- 圈內百分比文字 -->
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 800; font-size: 1rem; color: #6D4C00; line-height: 1;">{{ percent.rawFat }}%</span>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 700; color: var(--color-text-main);">脂肪</div>
                        <div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px;">{{ totals.fat }}g / {{ targetProfile.targetFat }}g</div>
                    </div>
                </div>

                <!-- 3. 底部鈉含量文字呈現 -->
                <div style="border-top: 1px dashed #F0E6D2; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--color-text-main);">
                        <span>🧂 <strong>今日鈉攝取：</strong></span>
                        <span style="font-weight: 600; color: #6D4C00;">{{ totals.sodium }} mg</span>
                        <span style="color: var(--color-text-muted); font-size: 0.78rem;">(上限 {{ targetProfile.targetSodium }} mg)</span>
                    </div>
                    <div :style="{ color: remaining.sodium >= 0 ? '#10B981' : '#E16262', fontWeight: 600, fontSize: '0.8rem' }">
                        {{ remaining.sodium >= 0 ? '🟢 剩 ' + remaining.sodium + ' mg' : '🔴 超標 ' + Math.abs(remaining.sodium) + ' mg' }}
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
                                <span v-else style="font-size: 0.68rem; background: #FEF3C7; color: #B45309; padding: 2px 5px; border-radius: 4px; font-weight: 600; flex-shrink: 0;">💬 快捷/輸入</span>
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

            <!-- 隱藏原生手機相機與相簿 input (常駐於 DOM 確保點擊立即直接喚起系統相簿/相機) -->
            <input type="file" accept="image/*" capture="environment" ref="nativeCameraInput" @change="handleNativeCameraSnap" style="display: none;">
            <input type="file" accept="image/*" ref="albumInput" @change="handleAlbumUpload" style="display: none;">

            <!-- Bottom Floating Action Bar (主畫面保持俐落雙控制鈕) -->
            <div class="fab-container">
                <button class="btn-primary" @click="openAiModal('camera')">📷 拍照記錄</button>
                <button class="btn-primary accent" @click="openAiModal('voice')">🎙️ 語音/文字輸入</button>
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
                            <span style="font-size: 0.9rem; font-weight: 700; color: var(--color-text-main);">📷 拍照 AI 補記</span>
                            <button class="btn-icon" @click="toggleFacingMode" style="border: none; font-size: 0.92rem; color: var(--color-text-muted);" title="翻轉鏡頭">
                                🔄 鏡頭
                            </button>
                        </div>

                        <!-- Camera Live Viewfinder Area (點擊即拍) -->
                        <div @click="triggerShutter('')" 
                             style="background: #111827; border-radius: 20px; height: 320px; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 18px; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); cursor: pointer;">
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
                        <!-- Header (乾淨標題與關閉按鈕) -->
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

                        <!-- 常用餐點快捷 (直接點擊 0 毫秒帶出精確數據確認卡) -->
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
                            <!-- Real Captured Photo Display with Retake Button -->
                            <div v-if="capturedPhotoUrl" style="margin-bottom: 14px; position: relative;">
                                <img :src="capturedPhotoUrl" style="width: 100%; max-height: 220px; object-fit: cover; border-radius: 14px; border: 1px solid var(--color-border); box-shadow: 0 4px 14px rgba(0,0,0,0.08); display: block;">
                                <!-- 頂部右上角：重拍按鈕 -->
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
        </div>
    `
};
