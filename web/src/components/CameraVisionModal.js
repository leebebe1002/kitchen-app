const { ref } = Vue;

export default {
    setup() {
        const isVisible = ref(false);
        const step = ref(1); // 1: Camera, 2: Result
        
        const openModal = () => {
            isVisible.value = true;
            step.value = 1;
        };

        const closeModal = () => {
            isVisible.value = false;
        };

        const takePhoto = () => {
            // Simulate AI processing
            setTimeout(() => {
                step.value = 2;
            }, 1000);
        };

        return {
            isVisible,
            step,
            openModal,
            closeModal,
            takePhoto
        };
    },
    template: `
        <div v-if="isVisible" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--color-surface); z-index: 1000; display: flex; flex-direction: column;">
            
            <!-- Header -->
            <div style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border);">
                <span style="font-weight: 700;">{{ step === 1 ? 'AI 智能辨識' : '辨識結果' }}</span>
                <button class="btn-icon" @click="closeModal" style="border: none;">❌</button>
            </div>
            
            <!-- Step 1: Camera -->
            <div v-if="step === 1" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000; position: relative;">
                <div style="width: 250px; height: 250px; border: 2px solid var(--color-primary); border-radius: var(--radius-lg); position: relative;">
                    <!-- Focus Corners -->
                    <div style="position: absolute; top: -2px; left: -2px; width: 20px; height: 20px; border-top: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary);"></div>
                    <div style="position: absolute; top: -2px; right: -2px; width: 20px; height: 20px; border-top: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary);"></div>
                    <div style="position: absolute; bottom: -2px; left: -2px; width: 20px; height: 20px; border-bottom: 4px solid var(--color-primary); border-left: 4px solid var(--color-primary);"></div>
                    <div style="position: absolute; bottom: -2px; right: -2px; width: 20px; height: 20px; border-bottom: 4px solid var(--color-primary); border-right: 4px solid var(--color-primary);"></div>
                </div>
                
                <div style="position: absolute; bottom: 40px; display: flex; flex-direction: column; align-items: center; gap: 20px;">
                    <button @click="takePhoto" style="width: 70px; height: 70px; border-radius: 50%; background: var(--color-surface); border: 4px solid var(--color-border); cursor: pointer;"></button>
                    <div style="display: flex; gap: 40px; color: #FFF; font-size: 0.9rem;">
                        <span>🖼️ 相簿</span>
                        <span>💬 文字輸入</span>
                    </div>
                </div>
            </div>

            <!-- Step 2: Result -->
            <div v-if="step === 2" style="flex: 1; padding: 24px; background: var(--color-base);">
                <div class="card">
                    <h3 style="margin-bottom: 16px;">✨ Gemini 辨識成功</h3>
                    <p style="margin-bottom: 8px;"><strong>品名：</strong> 義美高纖全麥吐司</p>
                    <p style="margin-bottom: 8px;"><strong>建議存放：</strong> 常溫區 / 碳水</p>
                    <div style="background: var(--color-base); padding: 12px; border-radius: var(--radius-sm); margin: 16px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>熱量</span> <span style="font-weight: 600;">250 kcal/100g</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>蛋白質</span> <span style="font-weight: 600;">9g/100g</span></div>
                        <div style="display: flex; justify-content: space-between;"><span>碳水</span> <span style="font-weight: 600;">45g/100g</span></div>
                    </div>
                    <button class="btn-primary accent" style="width: 100%; justify-content: center;" @click="closeModal">✅ 儲存建檔並設為有庫存</button>
                </div>
            </div>
            
        </div>
    `
};
