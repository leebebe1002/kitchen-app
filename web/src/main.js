const { createApp, ref, computed, onMounted } = Vue;

import KitchenEngine from './engine/KitchenEngine.js?v=20260813_FAMILY_KITCHEN_20';
import CalculatorView from './views/CalculatorView.js?v=20260813_FAMILY_KITCHEN_20';
import TrackerView from './views/TrackerView.js?v=20260813_FAMILY_KITCHEN_20';
import PantryView from './views/PantryView.js?v=20260813_FAMILY_KITCHEN_20';
import CameraVisionModal from './components/CameraVisionModal.js?v=20260813_FAMILY_KITCHEN_20';

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
                <button class="btn-icon" @click="refreshData">🔄 刷新</button>
            </header>

            <nav class="tabs">
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'calculator' }"
                    @click="setTab('calculator')"
                >🍳 備料計算器</button>
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'tracker' }"
                    @click="setTab('tracker')"
                >📊 今日紀錄</button>
                <button 
                    class="tab-btn" 
                    :class="{ active: currentTab === 'pantry' }"
                    @click="setTab('pantry')"
                >🧊 智慧冰箱</button>
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
