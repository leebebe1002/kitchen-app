const { createApp, ref, computed, onMounted } = Vue;

import KitchenEngine from './engine/KitchenEngine.js?v=20260905_DOCK_V1';
import CalculatorView from './views/CalculatorView.js?v=20260905_DOCK_V1';
import TrackerView from './views/TrackerView.js?v=20260905_DOCK_V1';
import PantryView from './views/PantryView.js?v=20260905_DOCK_V1';
import ShoppingView from './views/ShoppingView.js?v=20260905_DOCK_V1';
import CameraVisionModal from './components/CameraVisionModal.js?v=20260905_DOCK_V1';

const App = {
    components: {
        CalculatorView,
        TrackerView,
        PantryView,
        ShoppingView,
        CameraVisionModal
    },
    setup() {
        const currentTab = ref('calculator'); // 'calculator', 'tracker', 'pantry', 'shopping'
        const engine = ref(null);
        const isLoading = ref(true);
        const error = ref(null);
        const showActionSheet = ref(false);

        // 原生相機與相簿觸發 input
        const nativeCameraInput = ref(null);
        const albumInput = ref(null);

        onMounted(async () => {
            try {
                engine.value = new KitchenEngine();
                await engine.value.initialize();
                isLoading.value = false;
            } catch (e) {
                console.error("Failed to load KitchenEngine:", e);
                error.value = "無法載入資料，請確認 server.py 是否正在運行。";
                isLoading.value = false;
            }
        });

        const setTab = (tab) => {
            document.body.classList.remove('modal-open');
            currentTab.value = tab;
            showActionSheet.value = false;
        };

        const toggleActionSheet = () => {
            showActionSheet.value = !showActionSheet.value;
        };

        const closeActionSheet = () => {
            showActionSheet.value = false;
        };

        // 記一餐快捷操作：切換至今日紀錄並啟動對應功能
        const triggerCameraRecord = () => {
            closeActionSheet();
            currentTab.value = 'tracker';
            // 若有原生相機觸發，直接喚醒相機
            setTimeout(() => {
                if (nativeCameraInput.value) {
                    nativeCameraInput.value.click();
                } else {
                    const el = document.querySelector('input[capture="environment"]');
                    if (el) el.click();
                }
            }, 150);
        };

        const triggerAlbumRecord = () => {
            closeActionSheet();
            currentTab.value = 'tracker';
            setTimeout(() => {
                if (albumInput.value) {
                    albumInput.value.click();
                } else {
                    const el = document.querySelector('input[type="file"]:not([capture])');
                    if (el) el.click();
                }
            }, 150);
        };

        const triggerVoiceRecord = () => {
            closeActionSheet();
            currentTab.value = 'tracker';
            setTimeout(() => {
                // 自動尋找 TrackerView 內的語音記錄觸發鈕
                const btns = Array.from(document.querySelectorAll('button'));
                const voiceBtn = btns.find(b => b.textContent && b.textContent.includes('語音'));
                if (voiceBtn) voiceBtn.click();
            }, 150);
        };

        const triggerManualRecord = () => {
            closeActionSheet();
            currentTab.value = 'tracker';
        };

        const refreshData = async () => {
            isLoading.value = true;
            try {
                sessionStorage.removeItem('family_kitchen_calc_session_state');
                sessionStorage.removeItem('family_kitchen_calc_state_v2');
            } catch (e) {}
            window.location.reload();
        };

        return {
            currentTab,
            setTab,
            engine,
            isLoading,
            error,
            showActionSheet,
            toggleActionSheet,
            closeActionSheet,
            triggerCameraRecord,
            triggerAlbumRecord,
            triggerVoiceRecord,
            triggerManualRecord,
            nativeCameraInput,
            albumInput,
            refreshData
        };
    },
    template: `
        <div class="app-container">
            <!-- 頂部精緻 Header (已移除沉重 Tabs) -->
            <header class="header">
                <h1>FAMILY KITCHEN 2.0</h1>
                <button class="btn-icon" @click="refreshData" style="display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>刷新</span>
                </button>
            </header>

            <div v-if="isLoading" class="view-content" style="align-items: center; justify-content: center;">
                <p>載入中...</p>
            </div>
            
            <div v-else-if="error" class="view-content" style="align-items: center; justify-content: center;">
                <p style="color: var(--color-secondary);">{{ error }}</p>
            </div>

            <!-- 主內容分頁區域 (Padding-bottom 自動適配 5 鍵 Dock) -->
            <main v-else class="view-content">
                <!-- 1. 備料計算器 -->
                <CalculatorView v-if="currentTab === 'calculator'" :engine="engine" :onNavigate="setTab" />
                <!-- 2. 今日紀錄 -->
                <TrackerView v-if="currentTab === 'tracker'" :engine="engine" />
                <!-- 4. 智慧冰箱 -->
                <PantryView v-if="currentTab === 'pantry'" :engine="engine" />
                <!-- 5. 獨立採買清單 -->
                <ShoppingView v-if="currentTab === 'shopping'" :engine="engine" />
            </main>

            <!-- 📱 1:1 復刻記帳 App 5 鍵式純白浮空底部導航列 -->
            <nav class="bottom-dock-container">
                <div class="bottom-dock">
                    <!-- Tab 1: 備料計算器 (日系指針烘焙機械秤) -->
                    <button class="dock-tab" :class="{ active: currentTab === 'calculator' }" @click="setTab('calculator')" title="備料計算器" aria-label="備料計算器">
                        <svg viewBox="0 0 24 24">
                            <path d="M3.5 5h17c-.6 2-2.5 3-5.5 3h-6C6 8 4.1 7 3.5 5z"></path>
                            <line x1="12" y1="8" x2="12" y2="10"></line>
                            <path d="M5.5 10h13l1.5 10.5a1 1 0 0 1-1 1.5H5a1 1 0 0 1-1-1.5L5.5 10z"></path>
                            <circle cx="12" cy="15.5" r="3.2"></circle>
                            <line x1="12" y1="15.5" x2="13.8" y2="13.8"></line>
                        </svg>
                    </button>

                    <!-- Tab 2: 今日紀錄 (優雅同心三圓環進度) -->
                    <button class="dock-tab" :class="{ active: currentTab === 'tracker' }" @click="setTab('tracker')" title="今日紀錄" aria-label="今日紀錄">
                        <svg viewBox="0 0 24 24">
                            <path d="M 12,3.5 A 8.5,8.5 0 1,1 5.5,6.5"></path>
                            <path d="M 12,6.2 A 5.8,5.8 0 1,1 7.5,8.5"></path>
                            <path d="M 12,9 A 3,3 0 1,1 9.5,10.5"></path>
                        </svg>
                    </button>

                    <!-- Tab 3 (CTA): 中央突出純白大圓鈕 (100% 復刻：純粹正中圓角十字，無星芒) -->
                    <div class="dock-center-wrap">
                        <button class="dock-center-btn" @click="toggleActionSheet" title="記一餐" aria-label="記一餐">
                            <svg viewBox="0 0 24 24">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                    </div>

                    <!-- Tab 4: 智慧冰箱 (飽滿雙門分層冰箱) -->
                    <button class="dock-tab" :class="{ active: currentTab === 'pantry' }" @click="setTab('pantry')" title="智慧冰箱" aria-label="智慧冰箱">
                        <svg viewBox="0 0 24 24">
                            <rect x="4.5" y="2.5" width="15" height="19" rx="3.5"></rect>
                            <line x1="4.5" y1="9.5" x2="19.5" y2="9.5"></line>
                            <line x1="7.5" y1="5.5" x2="7.5" y2="7.5"></line>
                            <line x1="7.5" y1="12.5" x2="7.5" y2="15.5"></line>
                        </svg>
                    </button>

                    <!-- Tab 5: 採買清單 (超市手推車) -->
                    <button class="dock-tab" :class="{ active: currentTab === 'shopping' }" @click="setTab('shopping')" title="採買清單" aria-label="採買清單">
                        <svg viewBox="0 0 24 24">
                            <path d="M2.5 3.5h3.2l2.3 11a1.8 1.8 0 0 0 1.8 1.5h9.4a1.8 1.8 0 0 0 1.8-1.5L22.5 7.5H6.2"></path>
                            <circle cx="9.5" cy="19.5" r="1.5"></circle>
                            <circle cx="17.5" cy="19.5" r="1.5"></circle>
                        </svg>
                    </button>
                </div>
            </nav>

            <!-- 📱 中央大圓鈕滑出 Action Sheet (記一餐快捷入口) -->
            <div v-if="showActionSheet" class="action-sheet-overlay" @click.self="closeActionSheet">
                <div class="action-sheet">
                    <div class="action-sheet-title">✨ 記一餐</div>
                    <div class="action-sheet-subtitle">選擇方便的記錄方式，AI 自動估算營養素</div>

                    <div class="action-sheet-grid">
                        <!-- 1. AI 拍照記錄 -->
                        <div class="action-sheet-btn" @click="triggerCameraRecord">
                            <div class="action-sheet-btn-icon" style="background: #FEF3C7; color: #D97706;">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                    <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                            </div>
                            <div class="action-sheet-btn-title">AI 拍照記錄</div>
                            <div class="action-sheet-btn-desc">鏡頭實拍自動估算</div>
                        </div>

                        <!-- 2. 相簿選取解析 -->
                        <div class="action-sheet-btn" @click="triggerAlbumRecord">
                            <div class="action-sheet-btn-icon" style="background: #E0E7FF; color: #4338CA;">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                            </div>
                            <div class="action-sheet-btn-title">相簿選照片</div>
                            <div class="action-sheet-btn-desc">解析過去拍攝餐點</div>
                        </div>

                        <!-- 3. 語音 / 文字輸入 -->
                        <div class="action-sheet-btn" @click="triggerVoiceRecord">
                            <div class="action-sheet-btn-icon" style="background: #ECFDF5; color: #059669;">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                </svg>
                            </div>
                            <div class="action-sheet-btn-title">語音 / 文字</div>
                            <div class="action-sheet-btn-desc">說出餐點自動拆解</div>
                        </div>

                        <!-- 4. 今日時間軸手動調整 -->
                        <div class="action-sheet-btn" @click="triggerManualRecord">
                            <div class="action-sheet-btn-icon" style="background: #F3F4F6; color: #374151;">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </div>
                            <div class="action-sheet-btn-title">今日時間軸</div>
                            <div class="action-sheet-btn-desc">手動編輯與快捷品項</div>
                        </div>
                    </div>

                    <button class="action-sheet-cancel" @click="closeActionSheet">取消</button>
                </div>
            </div>

            <!-- 共用 AI 拍照視窗 -->
            <CameraVisionModal />
        </div>
    `
};

createApp(App).mount('#app');
