const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick } = Vue;

import KitchenEngine from './engine/KitchenEngine.js?v=20260905_SHOPPING_RECOVERY_V3';
import CalculatorView from './views/CalculatorView.js?v=20260905_DOCK_V1';
import TrackerView from './views/TrackerView.js?v=20260905_CAMERA_V3';
import PantryView from './views/PantryView.js?v=20260905_PANTRY_FAB_V2';
import ShoppingView from './views/ShoppingView.js?v=20260905_DOCK_V1';

const App = {
    components: {
        CalculatorView,
        TrackerView,
        PantryView,
        ShoppingView
    },
    setup() {
        const currentTab = ref('calculator'); // 'calculator', 'tracker', 'pantry', 'shopping'
        const engine = ref(null);
        const isLoading = ref(true);
        const error = ref(null);
        const isKeyboardOpen = ref(false);
        const trackerView = ref(null);
        let viewport = null;
        let removeKeyboardListeners = () => {};

        onMounted(async () => {
            // iOS 鍵盤開啟時收起固定 Dock，避免 FAB 被推到鍵盤上方。
            viewport = window.visualViewport;
            if (viewport) {
                const updateKeyboardState = () => {
                    isKeyboardOpen.value = window.innerHeight - viewport.height > 150;
                };
                viewport.addEventListener('resize', updateKeyboardState);
                viewport.addEventListener('scroll', updateKeyboardState);
                removeKeyboardListeners = () => {
                    viewport.removeEventListener('resize', updateKeyboardState);
                    viewport.removeEventListener('scroll', updateKeyboardState);
                };
            }

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

        onBeforeUnmount(() => {
            removeKeyboardListeners();
        });

        const setTab = (tab) => {
            document.body.classList.remove('modal-open');
            currentTab.value = tab;
        };

        // Camera-first：全域 FAB 直接開啟今日紀錄既有的即時相機，不重複實作串流與辨識流程。
        const openCameraFirst = async () => {
            currentTab.value = 'tracker';
            await nextTick();
            trackerView.value?.openAiModal('camera');
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
            isKeyboardOpen,
            trackerView,
            openCameraFirst,
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
                <TrackerView v-if="currentTab === 'tracker'" ref="trackerView" :engine="engine" />
                <!-- 4. 智慧冰箱 -->
                <PantryView v-if="currentTab === 'pantry'" :engine="engine" />
                <!-- 5. 獨立採買清單 -->
                <ShoppingView v-if="currentTab === 'shopping'" :engine="engine" />
            </main>

            <!-- 📱 1:1 復刻記帳 App 5 鍵式純白浮空底部導航列 -->
            <nav class="bottom-dock-container" :class="{ 'is-keyboard-open': isKeyboardOpen }" aria-label="主要功能導覽">
                <div class="bottom-dock">
                    <div class="dock-side-group" aria-label="主要功能">
                        <!-- Tab 1: 備料計算器 (日系指針烘焙機械秤) -->
                        <button class="dock-tab" :class="{ active: currentTab === 'calculator' }" :aria-pressed="currentTab === 'calculator'" @click="setTab('calculator')" title="備料計算器" aria-label="備料計算器">
                            <svg viewBox="0 0 24 24">
                                <path d="M4 5h16c-.5 2.2-2.8 3.5-5 3.5H9C6.8 8.5 4.5 7.2 4 5z"></path>
                                <line x1="12" y1="8.5" x2="12" y2="10.5"></line>
                                <path d="M6 10.5h12l1.5 10H4.5L6 10.5z"></path>
                                <circle cx="12" cy="15.5" r="3"></circle>
                                <line x1="12" y1="15.5" x2="13.8" y2="13.8"></line>
                            </svg>
                        </button>

                        <!-- Tab 2: 今日紀錄 (優雅同心三圓環進度) -->
                        <button class="dock-tab" :class="{ active: currentTab === 'tracker' }" :aria-pressed="currentTab === 'tracker'" @click="setTab('tracker')" title="今日紀錄" aria-label="今日紀錄">
                            <svg viewBox="0 0 24 24">
                                <g transform="rotate(155 12 12)">
                                    <circle cx="12" cy="12" r="8.5" stroke-dasharray="45 10"></circle>
                                    <circle cx="12" cy="12" r="5.8" stroke-dasharray="26 10"></circle>
                                    <circle cx="12" cy="12" r="3.1" stroke-dasharray="11 7"></circle>
                                </g>
                            </svg>
                        </button>
                    </div>

                    <!-- Tab 3 (CTA): 中央突出純白大圓鈕 (正中十字 ＋ 右上晶耀單星芒) -->
                    <div class="dock-center-wrap">
                        <button class="dock-center-btn" @click="openCameraFirst" title="拍照 AI 補記" aria-label="拍照 AI 補記">
                            <svg viewBox="0 0 24 24">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <!-- 單顆晶耀星芒 (右上角) -->
                                <path class="starburst" d="M 19,1.5 Q 19,5 22.5,5 Q 19,5 19,8.5 Q 19,5 15.5,5 Q 19,5 19,1.5 Z"></path>
                            </svg>
                        </button>
                    </div>

                    <div class="dock-side-group" aria-label="庫存與採買功能">
                        <!-- Tab 4: 智慧冰箱 (飽滿雙門分層冰箱) -->
                        <button class="dock-tab" :class="{ active: currentTab === 'pantry' }" :aria-pressed="currentTab === 'pantry'" @click="setTab('pantry')" title="智慧冰箱" aria-label="智慧冰箱">
                            <svg viewBox="0 0 24 24">
                                <rect x="5" y="2.5" width="14" height="19" rx="3"></rect>
                                <line x1="5" y1="10" x2="19" y2="10"></line>
                                <line x1="8" y1="6" x2="8" y2="8"></line>
                                <line x1="8" y1="13" x2="8" y2="16"></line>
                            </svg>
                        </button>

                        <!-- Tab 5: 採買清單 (超市手推車) -->
                        <button class="dock-tab" :class="{ active: currentTab === 'shopping' }" :aria-pressed="currentTab === 'shopping'" @click="setTab('shopping')" title="採買清單" aria-label="採買清單">
                            <svg viewBox="0 0 24 24">
                                <path d="M2 3.5h3.2l2.3 11a1.6 1.6 0 0 0 1.6 1.4h9.6a1.6 1.6 0 0 0 1.6-1.4L22 7.5H5.8"></path>
                                <circle cx="9.5" cy="19.5" r="1.3"></circle>
                                <circle cx="17.5" cy="19.5" r="1.3"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
            </nav>

        </div>
    `
};

createApp(App).mount('#app');
