const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick } = Vue;

import KitchenEngine from './engine/KitchenEngine.js?v=20261109_FK21_THREE_FOODS_V2';
import CalculatorView from './views/CalculatorView.js?v=20261109_FK21_THREE_FOODS_V2';
import TrackerView from './views/TrackerView.js?v=20261105_INGREDIENT_PHOTO_AUTH_V1';
import PantryView from './views/PantryView.js?v=20261109_FK21_THREE_FOODS_V2';
import ShoppingView from './views/ShoppingView.js?v=20260926_FK004_STORE_SYNC';
// Auth 與同步服務共用無版本 URL，避免建立兩份登入狀態。
import authService from './services/FamilyAuthService.js';
import { inspectIngredientPhotos, formatIngredientPhotoAudit } from './utils/IngredientPhotoAudit.js?v=20261107_PHOTO_AUDIT_COMPACT_V1';
import { auditIngredientNutrition, formatIngredientNutritionAudit } from './utils/IngredientNutritionAudit.js?v=20261109_FK21_THREE_FOODS_V2';

import { isFk14KnownNutritionDifference } from './utils/Fk14OfficialNutritionRepair.js?v=20261109_FK21_THREE_FOODS_V2';

const App = {
    components: {
        CalculatorView,
        TrackerView,
        PantryView,
        ShoppingView
    },
    setup() {
        const currentTab = ref('calculator'); // 'calculator', 'tracker', 'pantry', 'shopping'
        const appVersion = '2026.11.09.8';
        const engine = ref(null);
        const isLoading = ref(true);
        const error = ref(null);
        const isKeyboardOpen = ref(false);
        const trackerView = ref(null);
        const showRecordActions = ref(false);
        const personalReady = ref(false);
        const personalMessage = ref(authService.message);
        const identityVersion = ref(0);
        let identityAttempt = 0;
        let removeAuthListener = () => {};
        let removeIdentityListeners = () => {};
        const showAccount = ref(false);
        const loginEmail = ref('');
        const loginCode = ref('');
        const loginStep = ref('email');
        const loginMessage = ref('');
        const loginSending = ref(false);
        const currentUser = ref(null);
        const arielResetting = ref(false);
        const arielResetMessage = ref('');
        const baselineUpdating = ref(false);
        const baselineMessage = ref('');
        const photoAudit = ref({ busy: false, text: '', message: '' });
        const nutritionAudit = ref({ busy: false, text: '', message: '' });
        const fk14Repairing = ref(false);
        // Explicit per-recipe opt-in. Never preselect unreviewed local recipes.
        const selectedLegacyRecipeIds = ref([]);
        const legacyRecipeReview = computed(() =>
            engine.value?.recipeSync?.reviewLegacy?.() || []);

        const canRepairFk14Nutrition = computed(() => {
            const report = nutritionAudit.value.report;
            return personalReady.value && engine.value?.personalScope === 'household'
                && currentUser.value && engine.value.hasPersonalAccess()
                && !engine.value?.officialCatalogActive && !nutritionAudit.value.busy && isFk14KnownNutritionDifference(report);
        });

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
                removeAuthListener = authService.subscribe(() => {
                    identityAttempt += 1;
                    personalReady.value = false;
                    currentUser.value = null;
                    selectedLegacyRecipeIds.value = [];
                    personalMessage.value = authService.message;
                    identityVersion.value += 1;
                    document.body.classList.remove('modal-open');
                    engine.value?.clearPersonalScope();
                });
                await confirmIdentity();
                const resume = () => { if (!document.hidden) return confirmIdentity(); };
                const offline = () => {
                    const current = engine.value;
                    authService.invalidate('目前離線。連線後會重新確認庫存權限，本機資料仍保留。');
                    // Auth invalidation intentionally clears scope access. Restore
                    // ONLY a user-bound, previously verified Supabase catalog from
                    // the device snapshot so nutrition edits may still be queued.
                    // Never grant offline access to pantry/shopping or claim sync.
                    if (typeof current?.loadOfficialIngredientCatalog !== 'function') return;
                    current.loadOfficialIngredientCatalog().then(restored => {
                        if (!restored || engine.value !== current) return;
                        current.data.ingredients = ['proteins','veggies','carbs','sauces']
                            .flatMap(cat => current.data.rawIngredients?.[cat] || []);
                    }).catch(error => console.warn('Offline ingredient snapshot unavailable:',error.message));
                    current.recipeSync?.load().catch(error =>
                        console.warn('Offline recipe snapshot unavailable:',error.message));
                };
                const storage = event => {
                    if (event.key === 'family_kitchen_auth_session' || event.key === null) return confirmIdentity();
                };
                window.addEventListener('online', resume);
                window.addEventListener('offline', offline);
                window.addEventListener('pageshow', resume);
                window.addEventListener('storage', storage);
                document.addEventListener('visibilitychange', resume);
                removeIdentityListeners = () => {
                    window.removeEventListener('online', resume);
                    window.removeEventListener('offline', offline);
                    window.removeEventListener('pageshow', resume);
                    window.removeEventListener('storage', storage);
                    document.removeEventListener('visibilitychange', resume);
                };
                isLoading.value = false;
            } catch (e) {
                console.error("Failed to load KitchenEngine:", e);
                error.value = e.message || "無法載入資料，請確認網路後重新開啟 FK。";
                isLoading.value = false;
            }
        });

        onBeforeUnmount(() => {
            removeKeyboardListeners();
            removeAuthListener();
            removeIdentityListeners();
        });

        const setTab = (tab) => {
            document.body.classList.remove('modal-open');
            currentTab.value = tab;
        };

        const openRecordActions = () => {
            showRecordActions.value = true;
            document.body.classList.add('modal-open');
        };

        const closeRecordActions = () => {
            showRecordActions.value = false;
            document.body.classList.remove('modal-open');
        };

        // 中央加號只負責選擇輸入方式；只有使用者選「拍照」才啟用相機。
        const selectRecordAction = async (action) => {
            closeRecordActions();
            currentTab.value = 'tracker';
            await nextTick();

            if (action === 'album') {
                trackerView.value?.triggerAlbumSelect();
            } else if (action === 'camera') {
                trackerView.value?.openAiModal('camera');
            } else if (action === 'voice') {
                trackerView.value?.openAiModal('voice');
            }
        };

        const refreshData = async () => {
            isLoading.value = true;
            // A unique document URL revalidates the entry without clearing device data.
            const latest = new URL(window.location.href);
            latest.searchParams.set('fk_update', Date.now().toString());
            window.location.replace(latest.href);
        };

        const loadAuthorizedKitchen = async () => {
            const attempt = ++identityAttempt;
            const nextEngine = new KitchenEngine({ cloudSync: engine.value?.cloudSync });
            await nextEngine.initialize();
            if (attempt !== identityAttempt) {
                if (!engine.value) { nextEngine.clearPersonalScope(); engine.value = nextEngine; }
                return;
            }
            engine.value = nextEngine;
            currentUser.value = authService.user;
            personalReady.value = nextEngine.hasPersonalAccess();
            personalMessage.value = authService.message;
            identityVersion.value += 1;
            // A successful device-local repair reloads the app. Verify the real
            // Engine automatically rather than making the user find the audit
            // action and paste the same report again.
            try {
                if (personalReady.value && nextEngine.personalScope === 'household'
                    && sessionStorage.getItem('fk14_two_item_recheck') === 'pending') {
                    sessionStorage.setItem('fk14_two_item_recheck', 'checked');
                    const result = await checkIngredientNutrition();
                    if (result?.matched === 100 && result?.different === 0) {
                        nutritionAudit.value.message = '修復後自動驗證通過：100／100 項一致。';
                    } else if (result) {
                        nutritionAudit.value.message = `修復後自動驗證仍有 ${result.different} 項差異，請複製結果貼給十一粒。`;
                    }
                    showAccount.value = true;
                }
            } catch (error) {
                nutritionAudit.value.message = '修復後尚未完成驗證：' + error.message;
                showAccount.value = true;
                console.warn('FK #14 post-repair check unavailable:', error.message);
            }
        };

        const confirmIdentity = async () => {
            await authService.initialize();
            await loadAuthorizedKitchen();
        };

        const requestLoginCode = async () => {
            loginMessage.value = '';
            loginSending.value = true;
            try {
                await authService.requestEmailCode(loginEmail.value);
                loginCode.value = '';
                loginStep.value = 'code';
                loginMessage.value = '驗證碼已寄出。請回到 FK 輸入 Email 中的數字驗證碼。';
            } catch (error) {
                loginMessage.value = error.message || '無法寄送驗證碼。';
            } finally {
                loginSending.value = false;
            }
        };

        const verifyLoginCode = async () => {
            loginMessage.value = '';
            loginSending.value = true;
            try {
                await authService.verifyEmailCode(loginEmail.value, loginCode.value);
                loginMessage.value = '此裝置已完成同步登入。正在同步你的資料…';
                await loadAuthorizedKitchen();
                if (!personalReady.value) throw new Error(personalMessage.value);
                loginMessage.value = '登入與庫存權限已確認。';
            } catch (error) {
                loginMessage.value = error.message || '無法驗證登入碼。';
            } finally {
                loginSending.value = false;
            }
        };

        const signOut = () => {
            authService.signOut();
            currentUser.value = null;
            loginMessage.value = '';
        };

        const resetArielKitchen = async () => {
            const target = engine.value;
            if (arielResetting.value || !personalReady.value || target?.personalScope !== 'ariel') return;
            if (!confirm('將這台裝置樂樂原有的庫存、採買、家用品改為空白，原本的本機資料會先備份。食材、照片、餐點、登入與 Bebe／Jason 的資料不受影響。確定從空白開始？')) return;
            arielResetting.value = true;
            arielResetMessage.value = '';
            try {
                await target.adoptEmptyArielKitchen();
                if (engine.value !== target || !target.hasPersonalAccess()) throw new Error('登入狀態已變更，請重開檢查。');
                identityVersion.value += 1;
                arielResetMessage.value = '已保留原本機備份，樂樂的庫存、採買與家用品已從空白開始。新增或修改後會依現有版本保護同步。';
            } catch (resetError) {
                arielResetMessage.value = resetError.message || '無法安全重設，原資料已保留。';
            } finally {
                arielResetting.value = false;
            }
        };

        const approveLegacyRecipes = async () => {
            const target=engine.value;
            if (!personalReady.value || !target?.recipeSync?.active) return;
            const allowed=new Set(legacyRecipeReview.value
                .filter(recipe => recipe.blockedIds.length === 0)
                .map(recipe=>recipe.id));
            const chosen=selectedLegacyRecipeIds.value.filter(id=>allowed.has(id));
            if (!chosen.length) return;
            const names=legacyRecipeReview.value.filter(recipe=>chosen.includes(recipe.id))
                .map(recipe=>recipe.name);
            if (!confirm('確定只分享下列 '+chosen.length+' 項料理給全家？\n'
                +names.join('、')+'\n未勾選及引用私房食材的料理會繼續保存在這台手機。')) return;
            try {
                await target.recipeSync.approveLegacy(chosen);
                selectedLegacyRecipeIds.value=[];
            } catch (error) {
                target.recipeSync.message='上傳未完成，原料理保留：'+error.message;
            }
        };

        const retryRecipeSync = async () => {
            const target=engine.value;
            if (!target?.recipeSync || !personalReady.value) return;
            try {
                await target.recipeSync.sync();
            } catch (error) {
                target.recipeSync.message='料理同步未完成，原資料保留：'+error.message;
            }
        };

        const adoptIngredientBaseline = async () => {
            if (!engine.value || baselineUpdating.value || engine.value.data.ingredientBaselineApplied) return;
            if (!confirm('請先關閉其他 FK 分頁。這次會備份本機食材，再採用 GitHub 官方 100 項食材的營養與換算基準；價格、通路、額外私房食材、庫存、採買及飲食紀錄都保留。三項缺失營養仍待補。確定更新這台裝置？')) return;
            baselineUpdating.value = true;
            baselineMessage.value = '';
            try {
                await engine.value.adoptIngredientBaseline();
                baselineMessage.value = '已保留照片並備份、採用 GitHub 官方 100 項食材基準。豆腐麵、蛤蜊、洋菇仍待補營養；符合條件的已核實營養修正可供家人共用。';
            } catch (updateError) {
                baselineMessage.value = updateError.message || '無法完成食材更新，請保留原資料並稍後重試。';
                if (updateError.requiresReload) error.value = baselineMessage.value;
            } finally {
                baselineUpdating.value = false;
            }
        };

        const checkIngredientNutrition = async () => {
            if (nutritionAudit.value.busy || fk14Repairing.value || !personalReady.value || !engine.value) return;
            const target = engine.value;
            nutritionAudit.value = { busy: true, text: '', message: '正在唯讀比對官方食材與手機實際計算數值…' };
            try {
                const report = await auditIngredientNutrition(target);
                if (target !== engine.value || !target.hasPersonalAccess()) throw Error('登入狀態已變更，請重新比對。');
                nutritionAudit.value = {
                    busy: false, report, text: formatIngredientNutritionAudit(report, appVersion),
                    message: report.different
                        ? `只完成檢查，尚未修復：${report.matched} 項一致，${report.different} 項不同／缺少。`
                        : `檢查完成：官方 ${report.officialCount} 項營養與重量基準全數一致；另有 ${report.privateCount} 項私房食材。`
                };
                return report;
            } catch (error) {
                nutritionAudit.value = { busy: false, text: '', message: error.message || '比對失敗，沒有修改任何資料。' };
            }
        };

        // Only the rendered CHECK action enters the confirmation flow.
        const checkAndOfferFk14Repair = async () => {
            if (nutritionAudit.value.busy || fk14Repairing.value) return;
            const report = await checkIngredientNutrition();
            if (report && canRepairFk14Nutrition.value) await repairFk14Nutrition();
        };

        const repairFk14Nutrition = async () => {
            const target = engine.value;
            if (!target || fk14Repairing.value || !canRepairFk14Nutrition.value) return;
            if (!confirm('檢查發現手機缺少官方雪白菇。這次會先備份原食材與照片，再補回雪白菇；若有無法辨識的同名私人食材則停止。可可粉已從全家共用庫移除，不會補回。庫存、採買、料理與其他食材保留。請關閉其他 FK 分頁，確定修復？')) {
                nutritionAudit.value.message = '已取消修復；這次仍只檢查，手機資料未修改。';
                return;
            }
            fk14Repairing.value = true;
            try {
                const repaired = await target.repairFk14OfficialNutrition();
                if (!repaired) throw Error('本機已有修復記錄，但尚未驗證 100 項一致；請重新開啟 FK 執行檢查。');
                nutritionAudit.value = {busy:false,text:'',message:'已寫入修復，重新載入後會自動核對 100 項。'};
                sessionStorage.setItem('fk14_two_item_recheck', 'pending');
                window.location.reload();
            } catch (repairError) {
                nutritionAudit.value.message = repairError.message || '修復失敗，原食材資料保留。';
                if (repairError.requiresReload) error.value = nutritionAudit.value.message;
            } finally { fk14Repairing.value = false; }
        };

        const copyIngredientNutritionAudit = async () => {
            try {
                await navigator.clipboard.writeText(nutritionAudit.value.text);
                nutritionAudit.value.message = '已複製，請貼回對話。';
            } catch {
                nutritionAudit.value.message = '請長按下方結果文字，全選後複製。';
            }
        };

        const checkIngredientPhotos = async () => {
            if (photoAudit.value.busy) return;
            photoAudit.value = { busy: true, text: '', message: '正在讀取這台裝置的照片紀錄…' };
            try {
                const report = await inspectIngredientPhotos({ ingredients: engine.value?.data.ingredients, appVersion });
                photoAudit.value.text = formatIngredientPhotoAudit(report);
                photoAudit.value.message = `目前 ${report.summary.currentWithPhotoRecord} 項食材有照片紀錄，另有 ${report.summary.storedElsewhere} 項在快取或舊備份有紀錄。請複製結果貼回對話。`;
            } catch {
                photoAudit.value.message = '目前無法完成檢查，請稍後重試。';
            } finally {
                photoAudit.value.busy = false;
            }
        };

        const copyPhotoAudit = async () => {
            try {
                await navigator.clipboard.writeText(photoAudit.value.text);
                photoAudit.value.message = '已複製，請貼回對話。';
            } catch {
                photoAudit.value.message = '請長按下方文字，全選後複製。';
            }
        };

        return {
            nutritionAudit,
            checkIngredientNutrition,
            checkAndOfferFk14Repair,
            canRepairFk14Nutrition,
            fk14Repairing,
            repairFk14Nutrition,
            copyIngredientNutritionAudit,
            photoAudit,
            checkIngredientPhotos,
            copyPhotoAudit,
            appVersion,
            adoptIngredientBaseline,
            arielResetting,
            arielResetMessage,
            resetArielKitchen,
            approveLegacyRecipes,
            selectedLegacyRecipeIds,
            legacyRecipeReview,
            retryRecipeSync,
            baselineUpdating,
            baselineMessage,
            currentTab,
            setTab,
            engine,
            isLoading,
            error,
            isKeyboardOpen,
            trackerView,
            showRecordActions,
            openRecordActions,
            closeRecordActions,
            selectRecordAction,
            refreshData,
            personalReady,
            personalMessage,
            identityVersion,
            showAccount,
            loginEmail,
            loginCode,
            loginStep,
            loginMessage,
            loginSending,
            currentUser,
            requestLoginCode,
            verifyLoginCode,
            signOut
        };
    },
    template: `
        <div class="app-container">
            <!-- 頂部精緻 Header (已移除沉重 Tabs) -->
            <header class="header">
                <div>
                    <h1>FAMILY KITCHEN 2.0</h1>
                    <small style="display:block; margin-top:4px; font-size:10px; color:var(--color-text-muted);">版本 {{ appVersion }}</small>
                </div>
                <div class="header-actions">
                    <button class="btn-icon header-refresh" @click="refreshData" title="刷新資料" aria-label="刷新資料">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                    <button class="btn-icon header-account" @click="showAccount = true" title="家庭同步帳號" aria-label="家庭同步帳號">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="8" r="3.2"></circle>
                            <path d="M4.8 20c.8-3.5 3.2-5.3 7.2-5.3s6.4 1.8 7.2 5.3"></path>
                        </svg>
                    </button>
                </div>
            </header>
            <p v-if="engine?.officialCatalogActive && (engine.officialCatalogOffline
                || engine.officialCatalogStatus?.includes('待同步')
                || engine.officialCatalogStatus?.includes('未同步')
                || engine.officialCatalogStatus?.includes('等待')
                || engine.officialCatalogStatus?.includes('衝突'))"
                class="account-message" role="status" style="margin:4px 16px 0;">
                {{ engine.officialCatalogStatus }}
            </p>

            <div v-if="isLoading" class="view-content" style="align-items: center; justify-content: center;">
                <p>載入中...</p>
            </div>
            
            <div v-else-if="error" class="view-content" style="align-items: center; justify-content: center;">
                <p style="color: var(--color-secondary);">{{ error }}</p>
            </div>

            <!-- 主內容分頁區域 (Padding-bottom 自動適配 5 鍵 Dock) -->
            <main v-else class="view-content">
                <section v-if="!personalReady && (currentTab === 'pantry' || currentTab === 'shopping')" class="account-copy" role="status">
                    <p>{{ personalMessage }}</p>
                    <button class="action-sheet-row" @click="showAccount = true">確認登入</button>
                </section>
                <!-- 1. 備料計算器 -->
                <CalculatorView :key="'calculator-' + identityVersion" v-if="currentTab === 'calculator'" :engine="engine" :onNavigate="setTab" />
                <!-- 2. 今日紀錄 -->
                <TrackerView v-if="currentTab === 'tracker'" ref="trackerView" :engine="engine" />
                <!-- 4. 智慧冰箱 -->
                <PantryView :key="'pantry-' + identityVersion" v-if="currentTab === 'pantry' && personalReady" :engine="engine" />
                <!-- 5. 獨立採買清單 -->
                <ShoppingView :key="'shopping-' + identityVersion" v-if="currentTab === 'shopping' && personalReady" :engine="engine" />
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
                        <button class="dock-center-btn" @click="openRecordActions" title="新增記錄" aria-label="新增記錄">
                            <svg viewBox="0 0 24 24">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <!-- 單顆晶耀星芒 (右上角，旋轉 45 度) -->
                                <path class="starburst" transform="rotate(45 19 5)" d="M 19,1.5 Q 19,5 22.5,5 Q 19,5 19,8.5 Q 19,5 15.5,5 Q 19,5 19,1.5 Z"></path>
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

            <!-- 新增記錄：先選輸入方式，避免中央加號直接請求相機權限。 -->
            <div v-if="showRecordActions" class="action-sheet-overlay" @click.self="closeRecordActions" role="presentation">
                <section class="action-sheet" role="dialog" aria-modal="true" aria-labelledby="record-action-title">
                    <h2 id="record-action-title" class="action-sheet-title">新增記錄</h2>
                    <div class="action-sheet-list" aria-label="選擇記錄方式">
                        <button class="action-sheet-row" @click="selectRecordAction('album')">從相簿選取</button>
                        <button class="action-sheet-row" @click="selectRecordAction('camera')">拍照</button>
                        <button class="action-sheet-row" @click="selectRecordAction('voice')">語音／文字輸入</button>
                    </div>
                    <button class="action-sheet-cancel" @click="closeRecordActions">取消</button>
                </section>
            </div>

            <div v-if="showAccount" class="action-sheet-overlay" @click.self="showAccount = false" role="presentation">
                <section class="action-sheet account-sheet" role="dialog" aria-modal="true" aria-labelledby="family-account-title">
                    <h2 id="family-account-title" class="action-sheet-title">家庭同步</h2>
                    <template v-if="currentUser">
                        <p class="account-copy">已登入 {{ currentUser.email }}。庫存與採買會在你有權限的資料空間內同步。</p>
                        <p v-if="engine?.sharedNutritionMessage" class="account-message" role="status">{{ engine.sharedNutritionMessage }}</p>
                        <p v-if="engine?.personalScope === 'ariel' && engine?.arielOfficialResetMessage" class="account-message" role="status">{{ engine.arielOfficialResetMessage }}</p>
                        <button class="action-sheet-row" @click="signOut">登出此裝置</button>
                    </template>
                    <template v-else>
                        <p class="account-copy">請使用自己的 Email 取得驗證碼；登入後會自動確認庫存權限。</p>
                        <label class="account-email-label" for="family-login-email">Email</label>
                        <input id="family-login-email" class="account-email-input" v-model="loginEmail" type="email" autocomplete="email" :disabled="loginSending">
                        <button class="action-sheet-row" @click="requestLoginCode" :disabled="loginSending">{{ loginStep === 'code' ? '重新寄送驗證碼' : '取得驗證碼' }}</button>
                        <template v-if="loginStep === 'code'">
                            <label class="account-email-label" for="family-login-code">驗證碼</label>
                            <input id="family-login-code" class="account-email-input" v-model="loginCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" :disabled="loginSending">
                            <button class="action-sheet-row" @click="verifyLoginCode" :disabled="loginSending">確認登入</button>
                        </template>
                    </template>
                    <p v-if="!personalReady" class="account-message" role="status">{{ personalMessage }}</p>
                    <button v-if="!personalReady" class="action-sheet-row" @click="signOut">登出此裝置</button>
                    <p v-if="loginMessage" class="account-message">{{ loginMessage }}</p>
                    <details v-if="personalReady && engine?.personalScope === 'ariel'">
                        <summary class="account-email-label">樂樂庫存重新開始</summary>
                        <p class="account-copy">只處理這台裝置的樂樂庫存、採買與家用品。執行前會再次確認雲端仍為空白，並保留原本機備份；不會更動 Bebe／Jason、食材、照片或餐點資料。</p>
                        <button class="action-sheet-row" @click="resetArielKitchen" :disabled="arielResetting">
                            {{ arielResetting ? '正在核對空白雲端與備份…' : '備份並從空白開始' }}
                        </button>
                        <p v-if="arielResetMessage" class="account-message" role="status">{{ arielResetMessage }}</p>
                    </details>
                    <details v-if="personalReady && engine" :open="!!nutritionAudit.message">
                        <summary class="account-email-label">食材營養一致性檢查</summary>
                        <p class="account-copy">可可粉已依全家決定移除。{{ engine?.officialCatalogActive ? '此處直接比對 Supabase 唯一官方食材資料與手機計算值；手機修改會先立即生效，再顯示同步狀態。' : '目前仍以舊版 GitHub 100 項基準比對；Supabase 食材 SSOT 尚未載入，不會用空白雲端覆蓋手機。' }}</p>
                        <p v-if="engine?.officialCatalogStatus" class="account-message" role="status">{{ engine.officialCatalogStatus }}</p>
                        <button v-if="engine?.officialCatalogActive" class="action-sheet-row" @click="engine.syncOfficialIngredientEdits()" :disabled="engine.officialCatalogSyncing">
                            {{ engine.officialCatalogSyncing ? '正在同步食材營養…' : '重試同步待處理的營養修改' }}
                        </button>
                        <template v-if="canRepairFk14Nutrition">
                            <p class="account-message" role="status">已找出雪白菇 1 項缺少，現在尚未修復。可用下面的備援修復按鈕，備份並更新手機食材。</p>
                            <button class="action-sheet-row" @click="repairFk14Nutrition" :disabled="fk14Repairing">
                                {{ fk14Repairing ? '正在備份與修復…' : '備份並修復雪白菇（1 項）' }}
                            </button>
                        </template>
                        <button class="action-sheet-row" @click="checkAndOfferFk14Repair" :disabled="nutritionAudit.busy || fk14Repairing">
                            {{ nutritionAudit.busy ? '比對中…' : '檢查 100 項營養；已知差異會詢問修復' }}
                        </button>
                        <p v-if="nutritionAudit.message" class="account-message" role="status">{{ nutritionAudit.message }}</p>
                        <template v-if="nutritionAudit.text">
                            <button class="action-sheet-row" @click="copyIngredientNutritionAudit">複製比對結果</button>
                            <textarea class="account-email-input" aria-label="食材營養比對結果" readonly :value="nutritionAudit.text" rows="8" style="font-size:12px;max-height:220px;"></textarea>
                        </template>
                    </details>
                    <details v-if="personalReady && engine?.recipeSync">
                        <summary class="account-email-label">共用料理同步</summary>
                        <p class="account-copy">你在手機新增或修改的料理可與家人使用同一份配方；不會同步個人庫存、採買或家用品。原本手機的舊配方先保留，確認後才分享。</p>
                        <p class="account-message" role="status">{{ engine.recipeSync.message }}</p>
                        <p v-if="engine.customIngredientSync" class="account-copy" role="status">
                            私房食材：{{ engine.customIngredientSync.message }}
                        </p>
                        <p v-if="engine.favoriteFoodSync" class="account-copy" role="status">
                            常用餐點：{{ engine.favoriteFoodSync.message }}
                        </p>
                        <details v-if="engine.customIngredientSync?.conflictDetails?.length" class="recipe-review-panel">
                            <summary>查看 {{ engine.customIngredientSync.conflictDetails.length }} 項私房食材待核對</summary>
                            <p class="account-copy">這些資料仍保留在手機，沒有覆寫官方食材或猜測營養值。其他沒有衝突的私房食材會獨立同步。</p>
                            <div v-for="item in engine.customIngredientSync.conflictDetails" :key="item.id" class="recipe-review-card">
                                <strong>{{ item.name }}（{{ item.id }}）</strong>
                                <small class="recipe-review-blocked" style="display:block;overflow-wrap:anywhere;">
                                    {{ item.kind === 'official_id' ? '與官方食材 ID 相同、資料不同'
                                        : item.kind === 'official_name' ? '與官方食材同名'
                                        : item.kind === 'remote_version' ? '與雲端較新版本不同'
                                        : '與另一項私房食材同名' }}
                                </small>
                                <small style="display:block;overflow-wrap:anywhere;">對照：{{ item.againstName }}（{{ item.againstId }}）</small>
                            </div>
                        </details>
                        <details v-if="legacyRecipeReview.length" class="recipe-review-panel">
                            <summary>檢視與選擇 {{ legacyRecipeReview.length }} 項手機料理差異</summary>
                            <div class="recipe-review-list">
                                <p class="account-copy">請逐項檢查差異再勾選要分享的料理，不會預設全選。引用私房食材的料理仍保存在手機。</p>
                            <div v-for="item in legacyRecipeReview" :key="item.id" class="recipe-review-card">
                                <label class="recipe-review-choice">
                                    <input type="checkbox" :value="item.id" v-model="selectedLegacyRecipeIds"
                                        :disabled="item.blockedIds.length > 0 || engine.recipeSync.busy || engine.recipeSync.offline"
                                        :aria-label="'分享料理：' + item.name" />
                                    <span>
                                        <strong>{{ item.name }}</strong>
                                        <small v-if="item.blockedIds.length" class="recipe-review-blocked">
                                            暫不可分享：引用尚未共用的食材 {{ item.blockedNames.join('、') }}
                                        </small>
                                        <small v-else>可以選擇分享，未勾選會保留在本機</small>
                                    </span>
                                </label>
                                <details v-if="item.diffs.length" class="recipe-review-diff">
                                    <summary>檢視 {{ item.diffs.length }} 個不同欄位</summary>
                                    <div v-for="field in item.diffs" :key="field.name" class="recipe-review-diff-row">
                                        <strong>{{ field.name }}</strong>
                                        <small>雲端：{{ field.before }}</small>
                                        <small>手機：{{ field.after }}</small>
                                    </div>
                                </details>
                            </div>
                            <button class="action-sheet-row" @click="approveLegacyRecipes"
                                :disabled="!selectedLegacyRecipeIds.some(id => legacyRecipeReview.some(item => item.id === id && !item.blockedIds.length)) || engine.recipeSync.busy || engine.recipeSync.offline">
                                確認分享勾選的 {{ selectedLegacyRecipeIds.filter(id => legacyRecipeReview.some(item => item.id === id && !item.blockedIds.length)).length }} 項料理
                            </button>
                            </div>
                        </details>
                        <button v-if="engine.recipeSync.active" class="action-sheet-row"
                            @click="retryRecipeSync" :disabled="engine.recipeSync.busy || engine.recipeSync.offline">
                            {{ engine.recipeSync.busy ? '正在同步料理…' : '重試同步待處理料理' }}
                        </button>
                    </details>
                    <details>
                        <summary class="account-email-label">食材照片檢查</summary>
                        <p class="account-copy">檢查這台裝置的食材照片、舊快取與備份。結果包含食材名稱與保存狀態，可複製給十一粒協助查找。</p>
                        <button class="action-sheet-row" @click="checkIngredientPhotos" :disabled="photoAudit.busy">
                            {{ photoAudit.busy ? '檢查中…' : '檢查食材照片' }}
                        </button>
                        <p v-if="photoAudit.message" class="account-message" role="status">{{ photoAudit.message }}</p>
                        <template v-if="photoAudit.text">
                            <button class="action-sheet-row" @click="copyPhotoAudit">複製檢查結果</button>
                            <textarea class="account-email-input" aria-label="食材照片檢查結果" readonly :value="photoAudit.text" rows="8" style="font-size:12px;max-height:220px;"></textarea>
                        </template>
                    </details>
                    <details v-if="engine">
                        <summary class="account-email-label">食材資料更新</summary>
                        <p class="account-copy">一次採用 GitHub 官方 100 項食材的營養與換算基準，更新前先備份，舊照片保留在這台裝置。符合條件且經核實的營養修改可與家人共享，其餘本機資料不會自動共享。</p>
                        <button class="action-sheet-row" @click="adoptIngredientBaseline" :disabled="baselineUpdating || engine.data.ingredientBaselineApplied">
                            {{ baselineUpdating ? '備份與更新中…' : engine.data.ingredientBaselineApplied ? '此裝置已採用官方基準' : '備份並更新這台裝置的食材' }}
                        </button>
                        <p v-if="baselineMessage" class="account-message" role="status">{{ baselineMessage }}</p>
                    </details>
                    <button class="action-sheet-cancel" @click="showAccount = false">關閉</button>
                </section>
            </div>

        </div>
    `
};

createApp(App).mount('#app');
