const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick } = Vue;


import KitchenEngine from './engine/KitchenEngine.js?v=20260908_ENGINE_RECOVERY_V2';
import CalculatorView from './views/CalculatorView.js?v=20260908_CALCULATOR_INIT_V2';
import TrackerView from './views/TrackerView.js?v=20260905_CAMERA_V3';
import PantryView from './views/PantryView.js?v=20260905_PANTRY_FAB_V2';
import ShoppingView from './views/ShoppingView.js?v=20260906_PURCHASE_SORT_V1';
import { PERSONAL_SCOPES } from './services/PersonalKitchenState.js?v=20260906_PERSONAL_SCOPE_V1';// 強制 iPhone PWA 取得新版登入回跳規則。
import authService from './services/FamilyAuthService.js?v=20260907_FAMILY_AUTH_REDIRECT_V2';


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
        const showRecordActions = ref(false);
        const personalScope = ref(localStorage.getItem('kitchen_v2_active_storage_scope') || 'household');
        const personalScopes = Object.values(PERSONAL_SCOPES);
        const showAccount = ref(false);
        const loginEmail = ref('');
        const loginMessage = ref('');
        const loginSending = ref(false);
        const currentUser = ref(null);
        let viewport = null;
        let removeKeyboardListeners = () => {};


        onMounted(async () => {
