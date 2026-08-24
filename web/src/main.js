const { createApp, ref, computed, onMounted } = Vue;

import KitchenEngine from './engine/KitchenEngine.js?v=20260824_CUCUMBER_CLAMP_V57';
import CalculatorView from './views/CalculatorView.js?v=20260824_CUCUMBER_CLAMP_V57';
import TrackerView from './views/TrackerView.js?v=20260824_CUCUMBER_CLAMP_V57';
import PantryView from './views/PantryView.js?v=20260824_CUCUMBER_CLAMP_V57';
import CameraVisionModal from './components/CameraVisionModal.js?v=20260824_CUCUMBER_CLAMP_V57';

const App = {
    components: {
        CalculatorView,
        TrackerView,
        PantryView,
        CameraVisionModal
    },
    setup() {
        const currentTab = ref('calculator'); // 'calculator', 'tracker', 'pantry'
        const engine = ref(null);
        const isLoading = ref(true);
        const error = ref(null);

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
        };

        const refreshData = async () => {
            isLoading.value = true;
            await engine.value.initialize();
            isLoading.value = false;
        };

        return {
            currentTab,
            setTab,
            engine,
            isLoading,
            error,
            refreshData
        };
    },
    template: `
        <div class="app-container">
            <header class="header">
                <h1>FAMILY KITCHEN 2.0</h1>
                <button class="btn-icon" @click="refreshData" style="display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>刷新</span>
                </button>
            </header>

            <nav class="tabs">
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'calculator' }"
                    @click="setTab('calculator')"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"></path>
                        <line x1="6" y1="17" x2="18" y2="17"></line>
                    </svg>
                    <span>備料計算器</span>
                </button>
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'tracker' }"
                    @click="setTab('tracker')"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                        <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                    </svg>
                    <span>今日紀錄</span>
                </button>
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'pantry' }"
                    @click="setTab('pantry')"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"></rect>
                        <line x1="5" y1="10" x2="19" y2="10"></line>
                        <line x1="8" y1="5" x2="8" y2="8"></line>
                        <line x1="8" y1="13" x2="8" y2="17"></line>
                    </svg>
                    <span>智慧冰箱</span>
                </button>
            </nav>

            <div v-if="isLoading" class="view-content" style="align-items: center; justify-content: center;">
                <p>載入中...</p>
            </div>
            
            <div v-else-if="error" class="view-content" style="align-items: center; justify-content: center;">
                <p style="color: var(--color-secondary);">{{ error }}</p>
            </div>

            <main v-else class="view-content">
                <CalculatorView v-if="currentTab === 'calculator'" :engine="engine" :onNavigate="setTab" />
                <TrackerView v-if="currentTab === 'tracker'" :engine="engine" />
                <PantryView v-if="currentTab === 'pantry'" :engine="engine" />
            </main>
            
            <!-- 共用 AI 拍照視窗 -->
            <CameraVisionModal />
        </div>
    `
};

createApp(App).mount('#app');
