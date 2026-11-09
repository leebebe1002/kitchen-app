import { auditIngredientNutrition } from '../utils/IngredientNutritionAudit.js?v=20261108_FK14_WINDOW_FETCH_V1';
import { withNutritionEvidence } from '../utils/NutritionEvidence.js?v=20261105_DEFAULT_ESTIMATES_V1';
import { emptyMealState, readMealState, writeMealState } from '../services/MealLogState.js?v=20261102_FK22_MEALS_V1';
import authService from '../services/FamilyAuthService.js';
import CloudSyncEngine from './CloudSyncEngine.js';
import supabaseService from '../services/SupabaseService.js?v=20261105_INGREDIENT_PHOTO_AUTH_V1';
import {
    PERSONAL_SCOPES,
    emptyPersonalKitchenState,
    hasPersonalKitchenData,
    readPersonalKitchenState,
    writePersonalKitchenState
} from '../services/PersonalKitchenState.js?v=20261102_FK16_REVISION_V1';
import personalKitchenSyncService from '../services/PersonalKitchenSyncService.js';
import sharedIngredientNutritionService from '../services/SharedIngredientNutritionService.js';
import Fk14LocalDataCoordinator from '../services/Fk14LocalDataCoordinator.js?v=20261109_FK14_ALL_DATA_SYNC_V1';
import SharedRecipeCoordinator from '../services/SharedRecipeCoordinator.js?v=20261109_FK14_ALL_DATA_SYNC_V1';
import { recoverRecipeJournal } from '../utils/SharedRecipeState.js?v=20261108_FK14_RECIPE_SYNC_V1';
import officialIngredientCatalogService, { groupOfficialCatalogRows, canonicalNutritionItem }
    from '../services/OfficialIngredientCatalogService.js?v=20261108_FK14_WINDOW_FETCH_V1';
import { readOfficialOutbox, stageOfficialEdit, persistOfficialCatalogEdit,
    recoverOfficialCatalogEdit, clearPublishedEntry, OFFICIAL_OUTBOX_KEY }
    from '../utils/OfficialIngredientOutbox.js?v=20261108_FK14_WINDOW_FETCH_V1';

import { sharedNutritionPayload, applySharedNutrition } from '../utils/SharedIngredientNutrition.js?v=20261108_FK14_SHARED_NUTRITION_V1';
import { recoverArielOfficialReset, applyArielOfficialReset } from '../utils/ArielOfficialIngredientReset.js?v=20261108_FK14_COCOA_RETIRED_V1';
import { recoverFk14OfficialRepair, applyFk14OfficialRepair, isFk14KnownNutritionDifference, retireFk14Cocoa, isRetiredOfficialIngredient, withoutRetiredRecipeIngredients } from '../utils/Fk14OfficialNutritionRepair.js?v=20261108_FK14_COCOA_RETIRED_V1';

export const OFFICIAL_CATALOG_SNAPSHOT_KEY = 'kitchen_v2_official_catalog_snapshot_v1';
const sessionCatalogOwner = auth => {
    try {
        const token = auth.readSession?.()?.access_token;
        if (!token || typeof atob !== 'function') return null;
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        return typeof payload.sub === 'string' ? payload.sub : null;
    } catch { return null; }
};
const verifiedCatalogSnapshot = (owner, storage = localStorage) => {
    try {
        const json = storage.getItem(OFFICIAL_CATALOG_SNAPSHOT_KEY);
        if (!json) return null;
        const snapshot = JSON.parse(json);
        if (!owner || snapshot?.ownerUserId !== owner) return null;
        groupOfficialCatalogRows(snapshot.rows);
        return snapshot;
    } catch { return null; }
};

import { normalizeIngredientName } from '../utils/IngredientMatcher.js?v=20260918_FIX_STATE_V2';
import { normalizeStoreName, normalizeStoreList } from '../utils/StoreNormalizer.js?v=20260926_FK004_STORE_SYNC';
import { mergeIngredientNutrition, sameNutrition } from '../utils/IngredientNutritionCache.js?v=20261105_DEFAULT_ESTIMATES_V1';
import { approvedIngredientBaseline, applyIngredientBaseline, recoverIngredientBaseline, INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY } from '../utils/IngredientBaselineUpdate.js?v=20261108_FK14_COCOA_RETIRED_V1';
import { ingredientPhotoStore, prepareIngredientPhotoBackup, hydrateIngredientPhotos, hasEmbeddedIngredientPhoto, serializeIngredientPhotos } from '../utils/IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';
import { ingredientNutritionBasis, ingredientNutritionIssue } from '../utils/IngredientUnit.js?v=20261105_DEFAULT_ESTIMATES_V1';

export default class KitchenEngine {
    constructor({ auth = authService, cloudSync, photoStore = ingredientPhotoStore } = {}) {
        const { reactive } = Vue;
        this.cloudSync = cloudSync || new CloudSyncEngine();
        this.supabase = supabaseService;
        this.personalKitchenSync = personalKitchenSyncService;
        this.sharedNutritionService = sharedIngredientNutritionService;
        this.officialCatalogService = officialIngredientCatalogService;
        this.officialCatalogRows = new Map();
        this.officialCatalogActive = false;
        this.officialCatalogOffline = false;
        this.officialCatalogOwner = null;
        this.officialCatalogStatus = '尚未啟用 Supabase 官方食材資料庫';
        this.officialCatalogSyncing = false;
        this.recipeStaticBaseline = [];
        this.recipeSync = new SharedRecipeCoordinator(this);
        this.sharedCustomCatalogRows = new Map();
        this.customIngredientSync = new Fk14LocalDataCoordinator(this,{kind:'custom'});
        this.favoriteFoodSync = new Fk14LocalDataCoordinator(this,{kind:'favorite'});



        this.officialIngredientById = new Map();
        this.sharedNutritionRevision = new Map();
        this.sharedNutritionLoaded = false;
        this.sharedNutritionMessage = '';
        this.arielOfficialResetMessage = '';

        this.auth = auth;
        this.ingredientPhotoStore = photoStore;
        this.personalContext = null;
        this.personalScope = null;
        this.personalRevision = null;
        this.mealAccess = null;
        this.mealState = emptyMealState();
        this.mealMutation = 0;
        this.mealReadSequence = new Map();
        this.mealSyncPromise = null;
        // Invalidate pending personal-state requests whenever the selected scope changes.
        this.personalScopeGeneration = 0;
        this.personalSyncSequence = 0;
        this.data = reactive({
            ingredients: [],
            ingredientBaselineApplied: false,
            householdSupplies: [],
            pantryInventory: {},
            dishes: [],
            dailyLogs: { logs: [] },
            mealSyncMessage: '請登入並確認餐點權限。',
            config: { gemini_api_key: '', openai_api_key: '' }
        });
        // 家庭成員健康檔案 (Family Profiles)
        this.profiles = Vue.reactive({
            bebe: { name: 'Bebe', targetKcal: 1500, targetProtein: 95, targetCarbs: 167, targetFat: 50, targetSodium: 1500 },
            ariel: { name: 'Ariel', targetKcal: 1600, targetProtein: 85, targetCarbs: 200, targetFat: 50, targetSodium: 1800 },
            jason: { name: 'Jason', targetKcal: 1800, targetProtein: 130, targetCarbs: 200, targetFat: 50, targetSodium: 2000 }
        });
        // 墓碑機制 (Tombstone)：記錄已刪除餐點 ID，防止雲端拉取歷史或合流時死而復生
        try {
            const savedTombstones = localStorage.getItem('kitchen_v2_deleted_meal_ids');
            this.deletedMealIds = new Set(savedTombstones ? JSON.parse(savedTombstones) : []);
        } catch (e) {
            this.deletedMealIds = new Set();
        }
    }

    async initialize() {
        // Recover an interrupted GLOBAL ingredient cache write before reading either key.
        // Scope-based inventory data remains untouched and initializes separately.
        recoverArielOfficialReset();
        recoverFk14OfficialRepair();
        recoverOfficialCatalogEdit();
        recoverRecipeJournal();

        await Promise.all([
            this.fetchJson('ingredients.json', 'rawIngredients', {}),
            this.fetchJson('dishes.json', 'rawDishes', {dishes:[]}),
            this.fetchJson('favorite_foods.json', 'rawFavoriteFoods', {favorites:[]}),
            this.fetchJson('config.json', 'config', {})
        ]);
        // Migrate legacy browser-only credentials before removing them from shared configuration.
        this.protectLocalGeminiKey();
        
        // 🛡️【第 1 優先守門】：立即載入個人專屬廚房狀態 (household / ariel)
        // 必須在任何食材清洗或業務邏輯執行前完成，確保 this.data.pantryInventory 100% 是使用者真實最新的庫存資料！
        await this.initializePersonalKitchenState();
        await this.initializeMealLogs();
        // Ariel has authorized replacing her unused old device ingredient cache.
        // Run only once per device after verified Scope initialization and before
        // duplicate cleanup / custom merge, so no stale custom overrides survive.
        await this.maybeAdoptOfficialArielIngredients();

        if (this.hasPersonalAccess()) {
            const context = this.personalContext, generation = this.personalScopeGeneration;
            const retired = await retireFk14Cocoa({photoStore:this.ingredientPhotoStore,
                isCurrent:() => this.hasPersonalAccess() && this.personalContext === context && this.personalScopeGeneration === generation});
            if (retired) this.data.rawIngredients = retired;
        }

        // 🛡️【第 2 優先守門】：食材名稱去重與清洗 (徹底消除歷史雙胞胎如重複洋蔥)
        if (this.hasPersonalAccess()) this.cleanDuplicateIngredients();

        // 1. 合併使用者在本地自訂新增的私人食材 (防止 Git 更新時沖掉自建食材)
        this.mergeCustomUserIngredients();
        await hydrateIngredientPhotos(this.data.rawIngredients, this.ingredientPhotoStore, { allowMissing: true });
        await this.loadOfficialIngredientCatalog();
        await this.loadSharedIngredientNutrition();
        // Verified Scope precedes EVERY cloud custom merge. Shared custom food
        // IDs must exist before any recipe referencing them may be published.
        await this.customIngredientSync.load();
        await this.recipeSync.load();

        // 2. 攤平食材列表並正規化舊版通路名稱
        this.data.ingredients = [];
        if (this.data.rawIngredients) {
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                if (this.data.rawIngredients[cat]) {
                    this.data.rawIngredients[cat].forEach(ing => {
                        if (ing.preferredStore) ing.preferredStore = normalizeStoreName(ing.preferredStore);
                        if (Array.isArray(ing.preferredStores)) {
                            ing.preferredStores = normalizeStoreList(ing.preferredStores);
                        }
                    });
                    this.data.ingredients = this.data.ingredients.concat(this.data.rawIngredients[cat].filter(item => !isRetiredOfficialIngredient(item.id)));
                }
            });
        }
        
        // 3. 攤平料理列表
        this.data.rawDishes = {...this.data.rawDishes, dishes:(this.data.rawDishes?.dishes || []).map(withoutRetiredRecipeIngredients)};
        this.data.dishes = this.data.rawDishes.dishes;
        
        // 4. 常用料理
        this.data.favoriteFoods = this.data.rawFavoriteFoods?.favorites || [];
        await this.favoriteFoodSync.load();
        
        // 5. 初始化庫存保護結構 (確保所有食材皆有狀態，且預設保留使用者打勾)
        if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
        if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
        if (!this.data.pantryInventory.shoppingList) this.data.pantryInventory.shoppingList = [];
        if (!this.data.pantryInventory.foodCart) this.data.pantryInventory.foodCart = [];

        // 正規化採買清單中的舊版通路名稱
        this.data.pantryInventory.shoppingList.forEach(item => {
            if (item.store) item.store = normalizeStoreName(item.store);
            if (Array.isArray(item.preferredStores)) {
                item.preferredStores = normalizeStoreList(item.preferredStores);
            }
        });

        this.syncPersonalKitchenState().catch(error => console.warn('Personal kitchen sync unavailable:', error.message));

        // 6. ☁️ 全家雲端同步中樞在背景非同步執行 (不阻塞 App 啟動，實現 0 秒秒開)
        this.syncWithCloud().catch(err => console.warn("Background sync error:", err));
        
        console.log("KitchenEngine Initialized with State Protection & Instant Startup", this.data);
    }

    hasPersonalAccess() {
        return Boolean(this.personalScope && this.auth.isCurrentContext(this.personalContext));
    }

    clearPersonalScope() {
        this.clearMealLogs();
        this.personalScopeGeneration += 1;
        // Catalog data and queued edits must never retain another account's
        // authentication context after logout/scope switch.
        this.officialCatalogActive = false;
        this.officialCatalogOffline = false;
        this.officialCatalogOwner = null;
        this.officialCatalogRows.clear();
        this.recipeSync.reset();
        this.customIngredientSync.reset();
        this.favoriteFoodSync.reset();
        this.sharedCustomCatalogRows.clear();
        this.personalScope = null;
        this.personalRevision = null;
        this.personalContext = null;
        this.applyPersonalKitchenState(emptyPersonalKitchenState());
    }

    getPersonalKitchenSnapshot() {
        const localState = readPersonalKitchenState(this.personalScope);
        return JSON.parse(JSON.stringify({
            ...localState,
            pantryInventory: this.data.pantryInventory || emptyPersonalKitchenState().pantryInventory,
            householdSupplies: this.data.householdSupplies || { supplies: [] },
            revision: this.personalRevision,
            version: localState?.version || 1,
            updatedAt: localState?.updatedAt || null
        }));
    }

    async initializePersonalKitchenState() {
        const context = this.auth.getPersonalContext();
        if (!context) {
            this.clearPersonalScope();
            return;
        }
        this.personalContext = context;
        this.personalScope = context.scopeId;
        this.personalRevision = null;
        let savedState;
        try { savedState = readPersonalKitchenState(this.personalScope); }
        catch (error) { this.clearPersonalScope(); throw error; }
        if (savedState) {
            this.applyPersonalKitchenState(savedState);
            return;
        }
        // Only a verified household may adopt legacy device data; never load it for ariel.
        if (this.personalScope === 'household') {
            await Promise.all([
                this.fetchJson('pantry_inventory.json', 'pantryInventory', {}),
                this.fetchJson('household_supplies.json', 'householdSupplies', { supplies: [] })
            ]);
            if (!this.hasPersonalAccess()) { this.clearPersonalScope(); return; }
        }
        const initialState = this.personalScope === 'household'
            ? this.getPersonalKitchenSnapshot() : emptyPersonalKitchenState();
        // An untouched empty kitchen is not a new edit that may replace existing cloud data.
        writePersonalKitchenState(this.personalScope, initialState, { preserveUpdatedAt: !hasPersonalKitchenData(initialState) });
        this.applyPersonalKitchenState(initialState);
    }

    applyPersonalKitchenState(state) {
        // Never borrow another tab's accepted revision for this screen's older contents.
        if (Number.isSafeInteger(state?.revision) && state.revision >= 0) this.personalRevision = state.revision;
        const blank = emptyPersonalKitchenState();
        this.data.pantryInventory = state?.pantryInventory || blank.pantryInventory;
        this.data.householdSupplies = state?.householdSupplies || blank.householdSupplies;
        if (this.data.pantryInventory?.shoppingList) {
            this.data.pantryInventory.shoppingList.forEach(item => {
                if (item.store) item.store = normalizeStoreName(item.store);
                if (Array.isArray(item.preferredStores)) {
                    item.preferredStores = normalizeStoreList(item.preferredStores);
                }
            });
        }
        if (this.data.householdSupplies?.supplies) {
            this.data.householdSupplies.supplies.forEach(sup => {
                if (sup.store) sup.store = normalizeStoreName(sup.store);
                if (Array.isArray(sup.preferredStores)) {
                    sup.preferredStores = normalizeStoreList(sup.preferredStores);
                }
            });
        }
    }

    persistPersonalKitchenState() {
        if (!this.hasPersonalAccess()) return false;
        writePersonalKitchenState(this.personalScope, this.getPersonalKitchenSnapshot());
        return true;
    }

    async syncPersonalKitchenState() {
        if (!this.hasPersonalAccess() || !this.personalKitchenSync?.enabled) return false;
        const scopeId = this.personalScope;
        const context = this.personalContext;
        const generation = this.personalScopeGeneration;
        const sequence = ++this.personalSyncSequence;
        const localState = this.getPersonalKitchenSnapshot();
        const snapshot = JSON.stringify(localState);
        const isCurrent = () => this.hasPersonalAccess() && this.personalContext === context
            && this.personalScope === scopeId && this.personalScopeGeneration === generation
            && this.personalSyncSequence === sequence
            && JSON.stringify(this.getPersonalKitchenSnapshot()) === snapshot;
        const cloudState = await this.personalKitchenSync.getState(scopeId);
        if (!isCurrent()) return false;
        const conflict = () => { throw Object.assign(new Error('庫存版本衝突，本機與遠端資料已保留，請確認後再同步。'), { code: 'FK_SYNC_CONFLICT' }); };
        if (!cloudState || !Number.isSafeInteger(cloudState.revision) || cloudState.revision < 0) {
            throw new Error('無法確認伺服器庫存版本，已停止同步。');
        }
        const known = Number.isSafeInteger(localState.revision) && localState.revision >= 0;
        if (known && localState.revision > cloudState.revision) return conflict();
        const localHasData = hasPersonalKitchenData(localState);
        const cloudHasData = hasPersonalKitchenData(cloudState);
        const sameRevision = known && localState.revision === cloudState.revision;
        // An old empty row cannot authorize an unbased draft, but a confirmed base can be edited.
        if (!sameRevision && !cloudHasData && cloudState.syncStatus === 'legacy' && (localHasData || localState.dirty)) return conflict();
        const acceptCloud = () => {
            // Preserve primary before changing the screen; backup failure cannot apply a clear.
            writePersonalKitchenState(scopeId, cloudState, { preserveUpdatedAt: true });
            this.applyPersonalKitchenState(cloudState);
            return true;
        };
        if (!sameRevision) {
            // A rolling backup cannot protect an unresolved draft from a newer clear.
            if (!localState.dirty && (cloudState.syncStatus === 'cleared' || !localHasData || known)) return acceptCloud();
            if (cloudState.syncStatus !== 'initial' || known) return conflict();
        }
        if (sameRevision && !localState.dirty) return true;
        // Only a proven initial row or a draft based on this exact revision may be written.
        const saved = await this.personalKitchenSync.saveState(scopeId, { ...localState, revision: cloudState.revision });
        if (!isCurrent()) return false;
        if (!saved || !Number.isSafeInteger(saved.revision) || saved.revision !== cloudState.revision + 1) {
            throw new Error('未收到有效的庫存寫入確認，本機草稿已保留。');
        }
        writePersonalKitchenState(scopeId, saved, { preserveUpdatedAt: true });
        this.applyPersonalKitchenState(saved);
        return true;
    }


    // Explicitly adopt the currently EMPTY cloud state on Ariel's original device.
    // This is a local-only choice: it never PATCHes Supabase or touches household keys.
    async adoptEmptyArielKitchen() {
        if (!this.hasPersonalAccess() || this.personalScope !== 'ariel'
            || this.personalContext?.scopeId !== 'ariel' || !this.personalKitchenSync?.enabled) {
            throw new Error('只有已登入樂樂帳號，才能從空白庫存開始。');
        }
        const context = this.personalContext;
        const generation = this.personalScopeGeneration;
        const sequence = ++this.personalSyncSequence;
        const before = JSON.stringify(this.getPersonalKitchenSnapshot());
        const stillCurrent = () => this.hasPersonalAccess() && this.personalContext === context
            && this.personalScope === 'ariel' && this.personalScopeGeneration === generation
            && this.personalSyncSequence === sequence
            && JSON.stringify(this.getPersonalKitchenSnapshot()) === before;
        const cloud = await this.personalKitchenSync.getState('ariel');
        if (!stillCurrent()) throw new Error('登入或本機庫存已變更，沒有清空任何資料，請重新確認。');
        // Never discard local data when cloud has already become active, changed, or ambiguous.
        if (!cloud || cloud.revision !== 0 || cloud.syncStatus !== 'legacy'
            || hasPersonalKitchenData(cloud)) {
            throw new Error('樂樂的雲端庫存已變更，已保留原資料，請重新確認。');
        }
        // Keep an additional dedicated local snapshot: the ordinary rolling backup
        // is replaced after the next edit. Fail closed if either backup write fails.
        const oldBytes = localStorage.getItem('kitchen_v2_personal_state_ariel');
        if (oldBytes !== null) {
            localStorage.setItem('kitchen_v2_personal_state_ariel_reset_backup', oldBytes);
        }
        // Existing write method validates scope, rotates its normal backup,
        // then writes primary. If storage fails, do not alter the visible state.
        const saved = writePersonalKitchenState('ariel', cloud, { preserveUpdatedAt: true });
        this.applyPersonalKitchenState(saved);
        return true;
    }

    setPersonalScope(scopeId) {
        const context = this.auth.getPersonalContext();
        if (!context || context.scopeId !== scopeId || !PERSONAL_SCOPES[scopeId]) return;
        if (scopeId === this.personalScope && context === this.personalContext) return;
        this.personalScopeGeneration += 1;
        this.persistPersonalKitchenState();
        this.personalScope = scopeId;
        this.personalRevision = null;
        this.personalContext = context;

        let savedState;
        try { savedState = readPersonalKitchenState(scopeId); }
        catch (error) { this.clearPersonalScope(); throw error; }
        const nextState = savedState || emptyPersonalKitchenState();
        if (!savedState) writePersonalKitchenState(scopeId, nextState, { preserveUpdatedAt: true });
        this.applyPersonalKitchenState(nextState);
        this.syncPersonalKitchenState().catch(error => console.warn('Personal kitchen sync unavailable:', error.message));
    }

    // 使用者動態狀態檔案清單 (最高優先級：手機本地打勾狀態與自訂通路永遠不被沖掉)
    isUserStateFile(filename) {
        return ['pantry_inventory.json', 'daily_logs.json', 'config.json', 'ingredients.json', 'household_supplies.json', 'dishes.json', 'favorite_foods.json'].includes(filename);
    }

    async fetchJson(filename, key, defaultValue) {
        if (filename === 'daily_logs.json') throw new Error('舊共用餐點未確認歸屬，不自動載入。');
        if (filename === 'ingredients.json') this.data.ingredientBaselineApplied = recoverIngredientBaseline();
        const localKey = 'kitchen_v2_' + filename;
        const cached = localStorage.getItem(localKey);
        let cachedData = null;
        if (cached) {
            try {
                cachedData = JSON.parse(cached);
            } catch (e) {}
        }
        
        const isUserState = this.isUserStateFile(filename);
        const t = Date.now();

        try {
            // 嘗試從 API 或靜態檔案下載
            let response = null;
            const isLocalServer = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

            // 1. 本地開發伺服器模式 (只有在 localhost 時才嘗試 server.py API)
            if (isLocalServer) {
                try {
                    response = await fetch(`/api/data/${filename}?t=${t}`);
                } catch (e) {}
            }

            // 2. 線上 GitHub Pages 或靜態檔案模式：直接讀取靜態 JSON，不再枯等 404！
            if (!response || !response.ok) {
                try {
                    response = await fetch(`../src/data/${filename}?t=${t}`);
                } catch (e) {}
            }
            if (!response || !response.ok) {
                try {
                    // GitHub Pages 以 /kitchen-app/ 子路徑部署，不能使用網域根目錄的 /src。
                    // 從此模組位置建立相對網址，才能同時支援本機與公開網站。
                    const staticDataUrl = new URL(`../../../src/data/${filename}?t=${t}`, import.meta.url);
                    response = await fetch(staticDataUrl);
                } catch (e) {}
            }
            if ((!response || !response.ok) && isLocalServer) {
                try {
                    response = await fetch(`./src/data/${filename}?t=${t}`);
                } catch (e) {}
            }

            if (response && response.ok) {
                const serverData = await response.json();
                if (filename === 'dishes.json') {
                    if (!Array.isArray(serverData?.dishes))
                        throw Error('料理母庫格式異常，保留手機資料。');
                    this.recipeStaticBaseline = JSON.parse(JSON.stringify(serverData.dishes));
                }
                if (filename === 'ingredients.json') {
                    this.officialIngredientById = new Map(
                        ['proteins','veggies','carbs','sauces']
                            .flatMap(cat => Array.isArray(serverData?.[cat]) ? serverData[cat] : [])
                            .filter(item => typeof item?.id === 'string' && !isRetiredOfficialIngredient(item.id))
                            .map(item => [item.id,item])
                    );
                }

                if (filename === 'dishes.json') {
                    // Before Supabase confirms its exact recipes, never use the
                    // old additive GitHub/local merge here: it can resurrect
                    // previously removed ingredients or alter legacy drafts.
                    // SharedRecipeCoordinator does the versioned merge AFTER
                    // identity, backup and cloud validation are complete.
                    if (cached && !Array.isArray(cachedData?.dishes))
                        throw Error('原本料理快取無效，保留手機原始資料。');
                    this.data[key] = cachedData || serverData;
                } else if (filename === 'ingredients.json' || (isUserState && cachedData)) {
                    // 🛡️【核心保護】：使用者動態狀態 (庫存/打勾/自訂通路/飲食記錄) 優先採用手機本地，並智慧增量合併
                    const mergedData = this.mergeUserState(filename, cachedData, serverData);
                    if (filename === 'ingredients.json' && cached && !hasEmbeddedIngredientPhoto(cachedData)
                        && !localStorage.getItem(localKey + '_pre_nutrition_v1')) {
                        // Keep the exact pre-migration cache; a failed backup leaves the old cache intact.
                        localStorage.setItem(localKey + '_pre_nutrition_v1', cached);
                    }
                    this.data[key] = mergedData;
                    this.safeSetLocalStorage(localKey, mergedData);
                } else {
                    // 靜態資料庫 (食譜)：以伺服器最新版為主
                    this.data[key] = serverData;
                    this.safeSetLocalStorage(localKey, serverData);
                }
            } else if (cachedData) {
                this.data[key] = cachedData;
            } else {
                this.data[key] = defaultValue;
            }
        } catch (e) {
            if (cachedData) {
                this.data[key] = cachedData;
            } else {
                this.data[key] = defaultValue;
            }
        }
        if (filename === 'ingredients.json') await hydrateIngredientPhotos(this.data[key], this.ingredientPhotoStore, { allowMissing: true });
    }

    async maybeAdoptOfficialArielIngredients() {
        if (!this.hasPersonalAccess() || this.personalScope !== 'ariel'
            || this.personalContext?.scopeId !== 'ariel') return;
        if (recoverArielOfficialReset()) {
            this.arielOfficialResetMessage = '樂樂食材已採用 GitHub 官方基準。';
            return;
        }
        // Ingredient caches are device-global, not scoped. Never silently reset
        // a device that also contains Bebe/Jason's household kitchen.
        if (localStorage.getItem('kitchen_v2_personal_state_household') !== null) {
            this.arielOfficialResetMessage = '這台裝置也有家庭資料，未自動覆寫共用食材快取。';
            return;
        }
        const pantry = this.data.pantryInventory || {};
        const usedIds = [
            ...Object.keys(pantry.foodStockStatus || {}),
            ...(pantry.shoppingList || []).map(item => item.targetId),
            ...(pantry.foodCart || []).map(item => item.targetId)
        ].filter(Boolean);
        if (usedIds.some(id => !this.officialIngredientById.has(id))) {
            this.arielOfficialResetMessage = '採買或庫存仍引用私房食材，為避免遺失關聯，未自動覆寫。';
            return;
        }
        const context = this.personalContext;
        const generation = this.personalScopeGeneration;
        const current = () => this.hasPersonalAccess() && this.personalContext === context
            && this.personalScope === 'ariel' && this.personalScopeGeneration === generation;
        try {
            const url = new URL('../../../src/data/ingredients.json', import.meta.url);
            const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw Error('無法讀取 GitHub 食材基準。');
            const official = await approvedIngredientBaseline(await response.text());
            if (!current()) return;
            const next = await applyArielOfficialReset(official, {
                photoStore: this.ingredientPhotoStore, isCurrent: current
            });
            if (!current()) return;
            if (next) {
                this.data.rawIngredients = next;
                this.officialIngredientById = new Map(
                    ['proteins','veggies','carbs','sauces'].flatMap(cat => next[cat])
                        .map(item => [item.id, item])
                );
            }
            this.arielOfficialResetMessage = '樂樂食材已採用 GitHub 官方 100 項基準，舊資料已備份。';
        } catch (error) {
            this.arielOfficialResetMessage = '樂樂食材尚未更新，原資料保留。請連網後重新開啟 FK。';
            if (error.requiresReload) throw error;
            console.warn('Ariel official ingredient update deferred:', error.message);
        }
    }

    // Read only the sparse verified overrides, after local custom/duplicate merging
    // and before building calculator ingredient lists. Do not rewrite device caches.
    // Supabase catalog is the only effective authority after successful verified load.
    // GitHub JSON remains a frozen bootstrap for offline/legacy recovery, not a
    // second nutrition value source. Never trust empty/partial server responses.
    async loadOfficialIngredientCatalog() {
        const context = this.personalContext;
        const generation = this.personalScopeGeneration;
        const owner = this.hasPersonalAccess() ? context?.userId : sessionCatalogOwner(this.auth);
        const current = () => this.personalScopeGeneration === generation
            && (context ? this.hasPersonalAccess() && this.personalContext === context
                : !this.hasPersonalAccess() && sessionCatalogOwner(this.auth) === owner);
        let rows, verifiedOnline = false, errorDetail = '';
        if (this.hasPersonalAccess()) {
            try {
                rows = await this.officialCatalogService.list();
                if (!current()) return false;
                verifiedOnline = true;
            } catch (error) { errorDetail = error.message; }
        } else errorDetail = '目前離線或未完成登入';
        if (!rows) {
            const snapshot = verifiedCatalogSnapshot(owner);
            if (!snapshot) {
                this.officialCatalogStatus = 'Supabase 官方食材尚未載入（' + errorDetail
                    + '）；保留舊快取而不覆寫。';
                return false;
            }
            rows = snapshot.rows;
        }
        try {
            const cloud = groupOfficialCatalogRows(rows);
            // Preserve ONLY device-local convenience metadata. Nutrition and identity
            // always come from the verified Supabase rows (or an explicit pending edit).
            const old = new Map(['proteins','veggies','carbs','sauces']
                .flatMap(cat => this.data.rawIngredients?.[cat] || []).map(i => [i.id,i]));
            const localFields = ['photoUrl','photo','localPhotoRefs','preferredStore',
                'preferredStores','price','priceUnit','storageZone','storageZones',
                'priorityTier','stock'];
            for (const category of ['proteins','veggies','carbs','sauces']) {
                cloud[category] = cloud[category].map(base => {
                    const oldItem = old.get(base.id), value = {...base};
                    if (oldItem) for (const key of localFields) {
                        if (Object.hasOwn(oldItem,key)) value[key] =
                            oldItem[key] === undefined ? undefined : JSON.parse(JSON.stringify(oldItem[key]));
                    }
                    return value;
                });
            }
            const rowMap = new Map(rows.map(r => [r.ingredient_id,r]));
            const queued = readOfficialOutbox();
            if (queued.ownerUserId && queued.ownerUserId !== owner) {
                throw Error('這台裝置有另一個帳號未同步的食材，已保留，不會混入目前帳號。');
            }
            let conflict = 0;
            const acknowledged = [];
            for (const [id, pending] of Object.entries(queued.entries)) {
                const latest = rowMap.get(id);
                if (!latest) throw Error('待同步食材已從官方庫消失；原資料保留，請核對。');
                if (latest.revision !== pending.revision) {
                    const nutrientFields = ['unitLabel','isCount','per100g','perServing',
                        'perUnit','servingSize','servingUnit','gramsPerPack','gramsPerUnit',
                        'weightBasis','weightBasisSource','nutritionEvidence',
                        'nutritionReviewRequired'];
                    // A previous PATCH may have succeeded but the acknowledgement
                    // failed to persist. Reconcile only when current cloud values
                    // already equal the complete desired nutrition snapshot.
                    const desired = canonicalNutritionItem(latest.ingredient,pending.item);
                    if (nutrientFields.every(key =>
                        JSON.stringify(latest.ingredient[key]) === JSON.stringify(desired[key]))) {
                        acknowledged.push({id,pending,latest});
                        continue;
                    }
                    conflict++;
                }
                const category = latest.ingredient.category;
                const index = cloud[category].findIndex(i => i.id === id);
                if (index < 0) throw Error('官方食材分類不符，未套用手機編輯。');
                // Only pending nutrition is allowed over cloud; local metadata stays.
                const changed = canonicalNutritionItem(latest.ingredient,pending.item);
                cloud[category][index] = {...cloud[category][index],
                    ...Object.fromEntries(['unitLabel','isCount','per100g','perServing',
                        'perUnit','servingSize','servingUnit','gramsPerPack','gramsPerUnit',
                        'weightBasis','weightBasisSource','nutritionEvidence',
                        'nutritionReviewRequired'].filter(k => Object.hasOwn(changed,k))
                        .map(k => [k,structuredClone(changed[k])]))};
            }
            // Strict data isolation: no Pantry/Shopping/Meals/Household State is read
            // or written here. Old custom ingredients are kept by the existing merge.
            const preserved = ['proteins','veggies','carbs','sauces'];
            for (const cat of preserved) for (const item of this.data.rawIngredients?.[cat] || []) {
                if (!rowMap.has(item.id) && !isRetiredOfficialIngredient(item.id)
                    && !preserved.some(other => cloud[other].some(base =>
                        base.id === item.id || normalizeIngredientName(base.name) === normalizeIngredientName(item.name)))) {
                    cloud[cat].push(item);
                }
            }
            // The browser gets a device-local backup BEFORE the authoritative
            // snapshot replaces the legacy merged cache.
            const original = localStorage.getItem(INGREDIENT_CACHE_KEY);
            if (original !== null && localStorage.getItem('kitchen_v2_official_catalog_precutover_backup') === null)
                localStorage.setItem('kitchen_v2_official_catalog_precutover_backup',original);
            if (verifiedOnline) localStorage.setItem(OFFICIAL_CATALOG_SNAPSHOT_KEY,
                JSON.stringify({ownerUserId:owner,rows}));
            localStorage.setItem(INGREDIENT_CACHE_KEY,serializeIngredientPhotos(cloud));
            // Acknowledge only after fresh cloud snapshot AND calculator cache
            // were both successfully stored.
            for (const record of acknowledged) {
                if (current() && verifiedOnline)
                    clearPublishedEntry(localStorage,owner,record.id,record.pending,record.latest);
            }
            if (!current()) return false;
            this.data.rawIngredients = cloud;
            this.officialIngredientById = new Map(rows.map(r => [r.ingredient_id,JSON.parse(JSON.stringify(r.ingredient))]));
            this.officialCatalogRows = rowMap;
            this.officialCatalogOwner = owner;
            this.officialCatalogActive = true;
            this.officialCatalogOffline = !verifiedOnline;
            this.officialCatalogStatus = conflict
                ? `Supabase 官方 100 項已載入；${conflict} 項本機修改有版本衝突，未覆寫雲端。`
                : `Supabase 官方 100 項已載入；${Object.keys(queued.entries).length} 項修改待同步。`;
            if (!verifiedOnline && !conflict)
                this.officialCatalogStatus = '離線使用曾驗證的 Supabase 100 項快取；'
                    + Object.keys(queued.entries).length + ' 項修改待同步。';
            // Do not block immediate calculator availability on queued PATCH.
            if (verifiedOnline && !conflict && Object.keys(queued.entries).length)
                this.syncOfficialIngredientEdits().catch(e => console.warn('Catalog queued sync unavailable:', e.message));
            return true;
        } catch (error) {
            this.officialCatalogActive = false;
            this.officialCatalogOffline = false;
            this.officialCatalogStatus = `無法確認 Supabase 官方資料（${error.message}），保留原手機食材；不會覆寫空白雲端。`;
            console.warn('Official catalog read unavailable:', error.message);
            return false;
        }
    }

    async syncOfficialIngredientEdits() {
        if (!this.officialCatalogActive || this.officialCatalogSyncing || !this.hasPersonalAccess()
            || this.personalContext?.userId !== this.officialCatalogOwner) return false;
        const identity = this.personalContext;
        const generation = this.personalScopeGeneration;
        this.officialCatalogSyncing = true;
        try {
            for (const [id,pending] of Object.entries(readOfficialOutbox().entries)) {
                if (!this.hasPersonalAccess() || this.personalContext !== identity
                    || this.personalScopeGeneration !== generation) return false;
                const row = this.officialCatalogRows.get(id);
                if (!row || row.revision !== pending.revision) {
                    this.officialCatalogStatus = '官方食材版本衝突，本機修改保留待人工核對，沒有覆寫雲端。';
                    return false;
                }
                try {
                    const published = await this.officialCatalogService.publish({
                        item:pending.item,expectedRevision:pending.revision
                    });
                    // Persist the confirmed cloud revision BEFORE clearing the outbox.
                    // If writing the snapshot fails, keep the outbox for safe retry.
                    const nextRows = [...this.officialCatalogRows.values()]
                        .map(r => r.ingredient_id === id ? published : r);
                    groupOfficialCatalogRows(nextRows);
                    localStorage.setItem(OFFICIAL_CATALOG_SNAPSHOT_KEY,
                        JSON.stringify({ownerUserId:identity.userId,rows:nextRows}));
                    const change=clearPublishedEntry(localStorage,identity.userId,id,pending,published);
                    this.officialCatalogRows.set(id,published);
                    if (change === 'rebase') {
                        this.officialCatalogStatus = '同一食材有新編輯，仍待同步。';
                        return false;
                    }
                } catch (error) {
                    this.officialCatalogStatus = `已在手機生效，但雲端尚未同步：${error.message}`;
                    return false;
                }
            }
            this.officialCatalogStatus = '已同步 Supabase 全家共用營養資料。';
            return true;
        } finally { this.officialCatalogSyncing = false; }
    }

    async loadSharedIngredientNutrition() {
        if (this.officialCatalogActive) {
            this.sharedNutritionRevision.clear();
            this.sharedNutritionLoaded = true;
            this.sharedNutritionMessage = this.officialCatalogStatus;
            return;
        }
        this.sharedNutritionRevision.clear();
        this.sharedNutritionLoaded = false;
        if (!this.hasPersonalAccess() || !this.officialIngredientById.size) {
            this.sharedNutritionMessage = '目前使用此裝置的食材資料；共用營養尚未確認。';
            return;
        }
        const context = this.personalContext;
        const generation = this.personalScopeGeneration;
        try {
            const rows = await this.sharedNutritionService.list();
            if (!this.hasPersonalAccess() || this.personalContext !== context
                || this.personalScopeGeneration !== generation) return;
            let applied = 0, skipped = 0;
            for (const row of rows) {
                if (isRetiredOfficialIngredient(row.ingredient_id)) continue;
                const official = this.officialIngredientById.get(row.ingredient_id);
                const local = ['proteins','veggies','carbs','sauces']
                    .flatMap(cat => this.data.rawIngredients?.[cat] || [])
                    .find(item => item.id === row.ingredient_id);
                if (local && applySharedNutrition(local,row,official)) {
                    this.sharedNutritionRevision.set(row.ingredient_id,Number(row.revision));
                    applied++;
                } else skipped++;
            }
            this.sharedNutritionLoaded = true;
            this.sharedNutritionMessage = skipped
                ? `GitHub 官方食材 ${this.officialIngredientById.size} 項已載入；有 ${skipped} 項共用修正不相容，未套用。`
                : `GitHub 官方食材 ${this.officialIngredientById.size} 項已載入；另套用 ${applied} 項共用營養修正。`;
        } catch (error) {
            this.sharedNutritionMessage = '共用營養暫時無法確認；目前使用此裝置的食材資料。請連網刷新。';
            console.warn('Shared nutrition read unavailable:', error.message);
        }
    }

    async repairFk14OfficialNutrition() {
        if (this.ingredientBaselineUpdating) throw Error('食材更新進行中。');
        if (!this.hasPersonalAccess() || this.personalScope !== 'household'
            || this.personalContext?.scopeId !== 'household')
            throw Error('此修復僅適用 Bebe 家庭裝置，請先確認登入。');
        this.ingredientBaselineUpdating = true;
        const context = this.personalContext, generation = this.personalScopeGeneration;
        const current = () => this.hasPersonalAccess() && this.personalContext === context
            && this.personalScopeGeneration === generation && this.personalScope === 'household';
        try {
            const source = [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => localStorage.getItem(key));
            const active = JSON.stringify(this.data.ingredients);
            if (!isFk14KnownNutritionDifference(await auditIngredientNutrition(this)))
                throw Error('食材差異已改變，不符合這次雪白菇修復；請重新檢查。');
            const url = new URL('../../../src/data/ingredients.json', import.meta.url);
            const response = await fetch(url, {cache:'no-store', signal:AbortSignal.timeout(10000)});
            if (!response.ok) throw Error('無法下載官方食材，原資料保留。');
            const official = await approvedIngredientBaseline(await response.text());
            if (!current()) throw Error('登入狀態已改變，原資料保留。');
            const rows = await this.sharedNutritionService.list();
            if (!current() || !Array.isArray(rows) || rows.length !== 0)
                throw Error('共用營養狀態已變更，請先重新檢查。');
            const updated = await applyFk14OfficialRepair(official, {
                photoStore:this.ingredientPhotoStore, isCurrent:() => current()
                    && JSON.stringify(this.data.ingredients) === active
                    && [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].every((key,index) => localStorage.getItem(key) === source[index])
            });
            if (!current()) throw Error('修復完成但登入已變更，請重新開啟。');
            return updated !== null;
        } finally {
            this.ingredientBaselineUpdating = false;
        }
    }

    async adoptIngredientBaseline() {
        if (this.ingredientBaselineUpdating) throw new Error('食材更新進行中。');
        this.ingredientBaselineUpdating = true;
        try {
            if (recoverIngredientBaseline()) {
                this.data.ingredientBaselineApplied = true;
                return false;
            }
            const url = new URL('../../../src/data/ingredients.json', import.meta.url);
            const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error('無法取得食材基準，原資料未更動。');
            const official = await approvedIngredientBaseline(await response.text());
            const entries = ['proteins','veggies','carbs','sauces'].flatMap(cat => official[cat] || []);
            if (entries.length !== 100 || entries.some(item => isRetiredOfficialIngredient(item.id)))
                throw Error('官方清單仍是舊版，未重新加入已移除的可可粉；請稍後刷新。');
            const source = Object.fromEntries([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => [key, localStorage.getItem(key)]));
            const cached = JSON.parse(source[INGREDIENT_CACHE_KEY] || '{}');
            const custom = JSON.parse(source[CUSTOM_INGREDIENT_KEY] || '[]');
            if (['proteins','veggies','carbs','sauces'].flatMap(cat => cached[cat] || []).concat(custom)
                .some(item => isRetiredOfficialIngredient(item?.id)))
                throw Error('舊可可粉資料再次出現，請重新開啟 FK 先完成備份停用。');
            const prepared = await prepareIngredientPhotoBackup(source, this.ingredientPhotoStore);
            const updated = applyIngredientBaseline(official, localStorage, prepared);
            this.data.ingredientBaselineApplied = true;
            if (!updated) return false;
            await hydrateIngredientPhotos(updated, this.ingredientPhotoStore);
            this.data.rawIngredients = updated;
            this.data.ingredients = ['proteins', 'veggies', 'carbs', 'sauces'].flatMap(cat => updated[cat]);
            return true;
        } finally {
            this.ingredientBaselineUpdating = false;
        }
    }

    // Gemini credentials must never remain in a general-purpose JSON cache or get
    // sent to the local dev server. Preserve an existing browser key on migration.
    protectLocalGeminiKey() {
        const cacheKey = 'kitchen_v2_config.json';
        let oldConfig = null;
        try { oldConfig = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) {}
        const legacyKey = oldConfig?.geminiApiKey || oldConfig?.gemini_api_key;
        try {
            const storageKeys = ['family_kitchen_gemini_key', 'kitchen_v2_gemini_api_key', 'gemini_api_key', 'GEMINI_API_KEY'];
            const hasKey = storageKeys.some(key => !!localStorage.getItem(key));
            if (!hasKey && typeof legacyKey === 'string' && legacyKey.trim() &&
                !KitchenEngine.isRevokedLegacyKey(legacyKey.trim())) {
                localStorage.setItem('family_kitchen_gemini_key', legacyKey.trim());
            }
        } catch (e) {
            // If browser storage is unavailable, do not silently claim migration succeeded.
            console.warn('[FK] Local Gemini Key migration unavailable');
        }
        const safeConfig = { ...(this.data.config || {}) };
        delete safeConfig.geminiApiKey;
        delete safeConfig.gemini_api_key;
        this.data.config = safeConfig;
        this.safeSetLocalStorage(cacheKey, safeConfig);
    }

    /**
     * 🛡️ 安全防護：比對已作廢的歷史外洩測試金鑰指紋（不儲存完整金鑰字面值）
     * 該舊金鑰已於 Google AI Studio 廢止。此處結合長度、公開後綴與 32-bit FNV-1a 指紋，
     * 大幅降低誤判風險，供 legacy client 清理本地舊快取使用（非密碼學抗碰撞保證）。
     * @param {string} key
     * @returns {boolean}
     */
    static isRevokedLegacyKey(key) {
        if (!key || typeof key !== 'string') return false;
        // 快速特徵比對：長度 39 且後綴符合已作廢之公開標記
        if (key.length !== 39 || !key.endsWith('wMZQ')) return false;
        // FNV-1a 32-bit hash 指紋校驗 (雜湊值：efceaf35)
        let hash = 2166136261;
        for (let i = 0; i < key.length; i++) {
            hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
        }
        return hash.toString(16) === 'efceaf35';
    }

    // 智慧增量合併使用者狀態
    mergeUserState(filename, localData, serverData) {
        if (filename === 'pantry_inventory.json') {
            const merged = { ...serverData, ...localData };
            // 保留使用者手機的 foodStockStatus 打勾狀態
            merged.foodStockStatus = {
                ...(serverData?.foodStockStatus || {}),
                ...(localData?.foodStockStatus || {})
            };
            merged.supplyStockStatus = {
                ...(serverData?.supplyStockStatus || {}),
                ...(localData?.supplyStockStatus || {})
            };
            // 採買清單以本地為準，但空快取不得蓋掉非空的雲端／版本資料。
            // 否則新裝置或舊快取會讓使用者看見整張清單瞬間消失。
            const localShoppingList = Array.isArray(localData?.shoppingList) ? localData.shoppingList : [];
            const serverShoppingList = Array.isArray(serverData?.shoppingList) ? serverData.shoppingList : [];
            merged.shoppingList = localShoppingList.length === 0 && serverShoppingList.length > 0
                ? serverShoppingList
                : localShoppingList;

            const localFoodCart = Array.isArray(localData?.foodCart) ? localData.foodCart : [];
            const serverFoodCart = Array.isArray(serverData?.foodCart) ? serverData.foodCart : [];
            merged.foodCart = localFoodCart.length === 0 && serverFoodCart.length > 0
                ? serverFoodCart
                : localFoodCart;
            return merged;
        } else if (filename === 'ingredients.json') {
            // 🛡️ 保留使用者在本地修改過的食材通路與自訂規格
            if (!serverData || !Object.values(serverData).some(value => Array.isArray(value) && value.length)) return localData || serverData;
            const merged = { ...serverData };
            let customList = [];
            try { customList = JSON.parse(localStorage.getItem('kitchen_v2_custom_ingredients') || '[]'); } catch (e) {}
            const customMap = new Map((Array.isArray(customList) ? customList : []).map(i => [i.id, i]));
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                const incoming = serverData[cat] || [];
                const customCollides = base => [...customMap.values()].some(custom => custom.id !== base.id
                    && normalizeIngredientName(custom.name || '') === normalizeIngredientName(base.name || ''));
                // A renamed official item must not silently absorb a previously distinct
                // custom food with its new name. Keep the legacy title until the user resolves it.
                const priorNames = { brown_rice: '現煮米飯/糙米飯', beech_mushroom: '鴻喜菇/雪白菇' };
                const safeIncoming = incoming.map(base => priorNames[base.id] && customCollides(base)
                    ? { ...base, name: priorNames[base.id] } : base);
                const protectedNewIds = new Set(['white_rice', 'snow_white_mushroom']);
                const serverList = safeIncoming.filter(base => !protectedNewIds.has(base.id)
                    || !customCollides(base));
                const localList = localData?.[cat] || [];
                const localMap = new Map(localList.map(i => [i.id, i]));
                merged[cat] = serverList.map(sIng => {
                    const lIng = localMap.get(sIng.id);
                    return mergeIngredientNutrition(sIng, lIng, customMap.get(sIng.id));
                });
                // 加入使用者自訂的新食材 (🛡️ 嚴格防呆：若母庫中已存在同名食材，絕不把本地舊雙胞胎重複加進去)
                localList.forEach(lIng => {
                    const normLocalName = normalizeIngredientName(lIng.name || '');
                    const isIdExist = merged[cat].some(i => i.id === lIng.id);
                    const isNameExist = merged[cat].some(i => normalizeIngredientName(i.name || '') === normLocalName);
                    if (!isIdExist && !isNameExist) {
                        merged[cat].push(lIng);
                    }
                });
            });
            return merged;
        } else if (filename === 'household_supplies.json') {
            if (!serverData || !localData) return localData || serverData;
            const merged = { ...serverData };
            const serverList = serverData.supplies || [];
            const localList = localData.supplies || [];
            const localMap = new Map(localList.map(s => [s.id, s]));
            merged.supplies = serverList.map(sSup => {
                const lSup = localMap.get(sSup.id);
                return lSup ? { ...sSup, ...lSup } : sSup;
            });
            localList.forEach(lSup => {
                if (!merged.supplies.some(s => s.id === lSup.id)) {
                    merged.supplies.push(lSup);
                }
            });
        } else if (filename === 'daily_logs.json') {
            // 🛡️ 飲食記錄合流：使用深度智慧合流，且絕對遵守墓碑機制
            if (this.cloudSync && typeof this.cloudSync.mergeDailyLogs === 'function') {
                return this.cloudSync.mergeDailyLogs(localData, serverData, this.deletedMealIds);
            }
            return { ...(serverData || {}), ...(localData || {}) };
        } else if (filename === 'config.json') {
            const merged = { ...(serverData || {}), ...(localData || {}) };
            if (KitchenEngine.isRevokedLegacyKey(merged.gemini_api_key)) {
                merged.gemini_api_key = '';
            }
            return merged;
        } else if (filename === 'dishes.json') {
            if (!serverData || !localData) return localData || serverData;
            const merged = { ...serverData };
            const serverDishes = serverData.dishes || [];
            const localDishes = localData.dishes || [];
            const localMap = new Map(localDishes.map(d => [d.id, d]));

            merged.dishes = serverDishes.map(sDish => {
                const lDish = localMap.get(sDish.id);
                if (!lDish) return sDish;

                // 增量合併各食材分類
                const mergedDish = { ...sDish, ...lDish };
                ['recommendedProteins', 'recommendedVeggies', 'recommendedCarbs', 'recommendedSauces'].forEach(prop => {
                    const combined = Array.from(new Set([...(sDish[prop] || []), ...(lDish[prop] || [])]));
                    mergedDish[prop] = combined;
                });

                // 合併 defaultIngredients
                const defMap = new Map((sDish.defaultIngredients || []).map(i => [i.id, i]));
                (lDish.defaultIngredients || []).forEach(i => defMap.set(i.id, i));
                mergedDish.defaultIngredients = Array.from(defMap.values());

                // 合併 memberPortions
                mergedDish.memberPortions = { ...(sDish.memberPortions || {}) };
                if (lDish.memberPortions) {
                    ['bebe', 'ariel', 'jason'].forEach(m => {
                        const sList = sDish.memberPortions?.[m] || [];
                        const lList = lDish.memberPortions?.[m] || [];
                        const mMap = new Map(sList.map(i => [i.id, i]));
                        lList.forEach(i => mMap.set(i.id, i));
                        mergedDish.memberPortions[m] = Array.from(mMap.values());
                    });
                }

                return mergedDish;
            });

            // 加入使用者自建的全新料理
            localDishes.forEach(lDish => {
                if (!merged.dishes.some(d => d.id === lDish.id)) {
                    merged.dishes.push(lDish);
                }
            });

            return merged;
        }
        return localData || serverData;
    }

    // 🛡️ 徹底清洗 rawIngredients 中與官方底層完全同名的歷史雙胞胎 (例如重複洋蔥)
    cleanDuplicateIngredients() {
        if (!this.data.rawIngredients) return;

        let hasCleanedRaw = false;
        const removedCustomIds = new Map(); // customId -> canonicalIng

        ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
            const list = this.data.rawIngredients[cat] || [];
            const seenCanonical = new Map(); // normName -> canonicalIng
            const cleanList = [];

            // 第一輪：先記錄官方標準底層食材 (非 'ing_' 開頭的標準 ID 優先)
            list.forEach(ing => {
                const normName = normalizeIngredientName(ing.name || '');
                const isBase = !ing.id.startsWith('ing_') && !ing.id.startsWith('custom_');
                if (isBase && !seenCanonical.has(normName)) {
                    seenCanonical.set(normName, ing);
                }
            });

            // 第二輪：徹底剔除重複同名的自訂食材 (例如重名的洋蔥)
            list.forEach(ing => {
                const normName = normalizeIngredientName(ing.name || '');
                const canonical = seenCanonical.get(normName);

                if (canonical && canonical.id !== ing.id) {
                    console.log(`[cleanDuplicateIngredients] 剔除重複食材【${ing.name}】(${ing.id})，保留官方底層【${canonical.name}】(${canonical.id})`);
                    removedCustomIds.set(ing.id, canonical);
                    hasCleanedRaw = true;
                } else {
                    if (!seenCanonical.has(normName)) {
                        seenCanonical.set(normName, ing);
                    }
                    cleanList.push(ing);
                }
            });

            this.data.rawIngredients[cat] = cleanList;
        });

        if (hasCleanedRaw) {
            // 1. 將清洗後的 rawIngredients 寫入本機快取
            this.safeSetLocalStorage('kitchen_v2_ingredients.json', this.data.rawIngredients);

            // 2. 清洗 custom_ingredients 快取
            try {
                const customKey = 'kitchen_v2_custom_ingredients';
                const customStr = localStorage.getItem(customKey);
                if (customStr) {
                    const customList = JSON.parse(customStr);
                    if (Array.isArray(customList)) {
                        const filtered = customList.filter(c => !removedCustomIds.has(c.id));
                        this.safeSetLocalStorage(customKey, filtered);
                    }
                }
            } catch (e) {}

            // 3. 安全轉移庫存狀態與採買清單 (此時 this.data.pantryInventory 已由 initializePersonalKitchenState 載入真實資料)
            let inventoryChanged = false;
            if (this.data.pantryInventory) {
                // 轉移採買清單中的 targetId
                if (Array.isArray(this.data.pantryInventory.shoppingList)) {
                    this.data.pantryInventory.shoppingList.forEach(s => {
                        if (removedCustomIds.has(s.targetId)) {
                            const canonical = removedCustomIds.get(s.targetId);
                            s.targetId = canonical.id;
                            s.name = canonical.name;
                            inventoryChanged = true;
                        }
                    });
                }
                // 轉移庫存勾選
                if (this.data.pantryInventory.foodStockStatus) {
                    removedCustomIds.forEach((canonical, customId) => {
                        if (this.data.pantryInventory.foodStockStatus[customId] !== undefined) {
                            if (this.data.pantryInventory.foodStockStatus[customId]) {
                                this.data.pantryInventory.foodStockStatus[canonical.id] = true;
                            }
                            delete this.data.pantryInventory.foodStockStatus[customId];
                            inventoryChanged = true;
                        }
                    });
                }
                if (inventoryChanged) {
                    this.persistPersonalKitchenState();
                }
            }
        }
    }

    // 保留使用者手動新增的真正私房自訂食材
    mergeCustomUserIngredients() {
        const customKey = 'kitchen_v2_custom_ingredients';
        const customStr = localStorage.getItem(customKey);
        if (!customStr) return;
        try {
            const customList = JSON.parse(customStr);
            if (Array.isArray(customList) && this.data.rawIngredients) {
                const filteredCustomList = [];

                customList.forEach(customIng => {
                    const cat = customIng.category || 'veggies';
                    if (!this.data.rawIngredients[cat]) this.data.rawIngredients[cat] = [];

                    const normCustomName = normalizeIngredientName(customIng.name || '');
                    let matchingBaseIng = null;

                    ['proteins', 'veggies', 'carbs', 'sauces'].forEach(c => {
                        const found = (this.data.rawIngredients[c] || []).find(base => {
                            if (base.id === customIng.id) return false;
                            return normalizeIngredientName(base.name || '') === normCustomName;
                        });
                        if (found) matchingBaseIng = found;
                    });

                    // 雙胞胎已被 cleanDuplicateIngredients 剔除，不再混入
                    if (matchingBaseIng) {
                        return;
                    }

                    // 正常自訂食材：檢查自身 ID 是否已在 rawIngredients
                    const existing = this.data.rawIngredients[cat].find(i => i.id === customIng.id);
                    if (!existing) {
                        this.data.rawIngredients[cat].push(customIng);
                    } else if (!existing.photoUrl && !existing.photo && !existing.localPhotoRefs?.photoUrl
                        && !existing.localPhotoRefs?.photo) {
                        // A stale catalog cache can have the same ID without its saved photo.
                        for (const field of ['photoUrl', 'photo']) {
                            const url = customIng[field];
                            if (typeof url === 'string' && /^https?:\/\//i.test(url)) existing[field] = url;
                            else if (customIng.localPhotoRefs?.[field]) {
                                existing.localPhotoRefs = { ...existing.localPhotoRefs, [field]: customIng.localPhotoRefs[field] };
                            }
                        }
                    }
                    filteredCustomList.push(customIng);
                });

                this.safeSetLocalStorage(customKey, filteredCustomList);
            }
        } catch (e) {
            console.warn("Error merging custom user ingredients", e);
        }
    }

    safeSetLocalStorage(key, dataObj) {
        try {
            let targetObj = dataObj;
            let jsonStr = [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].includes(key)
                ? serializeIngredientPhotos(targetObj) : JSON.stringify(targetObj);
            // 🛡️ 雙重安全閥：若飲食紀錄物件異常膨脹（> 500KB），主動過濾殘存的 Base64 照片字串
            if (key === 'kitchen_v2_daily_logs.json' && jsonStr.length > 500 * 1024) {
                console.warn(`[SafeStorage] daily_logs 物件過大 (${jsonStr.length} bytes)，啟動自動清洗...`);
                try {
                    const cleaned = JSON.parse(jsonStr);
                    if (cleaned && cleaned.logs) {
                        cleaned.logs.forEach(log => {
                            if (log.diners) {
                                Object.values(log.diners).forEach(diner => {
                                    if (diner.meals) {
                                        diner.meals.forEach(m => {
                                            if (m.photoUrl && typeof m.photoUrl === 'string' && m.photoUrl.startsWith('data:')) {
                                                m.photoUrl = null;
                                            }
                                        });
                                    }
                                });
                            }
                        });
                        targetObj = cleaned;
                        jsonStr = JSON.stringify(targetObj);
                    }
                } catch (cErr) {
                    console.warn('[SafeStorage] 自動清洗失敗:', cErr);
                }
            }
            if (jsonStr.length > 1024 * 1024) {
                console.warn(`Object for ${key} is large (${jsonStr.length} bytes), applying safe storage.`);
            }
            localStorage.setItem(key, jsonStr);
        } catch (e) {
            console.warn(`LocalStorage write skipped or quota reached for ${key}:`, e);
        }
    }

    async syncWithCloud(date, member) {
        const synced = await this.syncMealDrafts();
        if (date && member) return (await this.fetchMealsFromSupabase(date, member)) && synced;
        return synced;
    }

    async saveJson(filename, dataObj) {
        if (filename === 'daily_logs.json') throw new Error('餐點須使用已驗證帳號的餐點儲存入口。');
        // Defense in depth: callers may still pass legacy config objects containing an API key.
        if (filename === 'config.json') {
            const safeConfig = { ...(dataObj || {}) };
            delete safeConfig.geminiApiKey;
            delete safeConfig.gemini_api_key;
            dataObj = safeConfig;
            this.data.config = safeConfig;
        }
        const localKey = 'kitchen_v2_' + filename;
        // 個人資料只寫入目前資料空間；不可再覆寫舊版共用本機快取或靜態 JSON 檔。
        if (filename === 'pantry_inventory.json' || filename === 'household_supplies.json') {
            if (!this.persistPersonalKitchenState()) return false;
            this.syncPersonalKitchenState().catch(error => console.warn('Personal kitchen sync unavailable:', error.message));
            return true;
        }

        // Recipe edits are globally shared and journaled separately from Pantry.
        if (filename === 'dishes.json') return this.recipeSync.save(dataObj);
        if (filename === 'favorite_foods.json')
            return this.favoriteFoodSync.saveLocal(dataObj?.favorites);

        // 1. 本地即時存檔 (0 秒離線優先)
        this.safeSetLocalStorage(localKey, dataObj);

        // 2. ☁️ 僅當飲食紀錄更新時，自動推播至全家雲端同步中樞
        if (this.cloudSync && filename === 'daily_logs.json') {
            this.cloudSync.pushToCloud(filename, dataObj);
        }

        // 3. 後端伺服器 (僅在本地 dev server 模式，線上跳過避免 404)
        const isLocalServer = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (isLocalServer) {
            try {
                const serverPayload = filename === 'ingredients.json'
                    ? JSON.parse(JSON.stringify(JSON.parse(serializeIngredientPhotos(dataObj)), (key, value) =>
                        ['nutritionCache', 'nutritionReviewRequired', 'localPhotoRefs'].includes(key) ? undefined : value))
                    : dataObj;
                const response = await fetch(`/api/data/${filename}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverPayload)
                });
                if (!response.ok) {
                    console.log(`Cloud mode: persisted ${filename} to localStorage.`);
                }
            } catch (e) {
                console.log(`Cloud mode: persisted ${filename} to localStorage.`);
            }
        }
    }

    // --- Data Access Methods ---
    
    getIngredientsByCategory(category) {
        // category matches the keys in rawIngredients (proteins, vegetables, carbs, seasonings)
        return this.data.rawIngredients[category] || [];
    }
    
    getIngredientById(id) {
        if (!id) return null;
        // 1. 精準 ID 匹配
        let found = this.data.ingredients.find(ing => ing.id === id);
        if (found) return withNutritionEvidence(found);
        
        // 2. 智慧名稱匹配 (例如 id='shin_ramen' 但庫存裡有名稱為 '辛拉麵')
        const normalized = id.toLowerCase().replace(/[-_]/g, '');
        found = this.data.ingredients.find(ing => {
            const ingIdNorm = ing.id.toLowerCase().replace(/[-_]/g, '');
            const ingNameNorm = (ing.name || '').toLowerCase().replace(/[\s\(\)（）\-_]/g, '');
            return ingIdNorm === normalized || ingNameNorm === normalized || ing.name === id;
        });
        if (found) return withNutritionEvidence(found);
        
        // 3. 常見別名字典 (Alias Map)
        const aliasMap = {
            'shin_ramen': ['辛拉麵', '農心 非油炸辛拉麵', '農心非油炸辛拉麵', '辛拉麵(非油炸)', 'shin_ramen_light'],
            'taro_meatball': ['芋頭貢丸'],
            'mushroom_meatball': ['香菇貢丸'],
            'angel_hair_pasta': ['義大利（天使）', '義大利麵', '天使麵'],
            'horseradish_mayo': ['辣根蛋黃醬'],
            'sugar_free_peanut_butter': ['無糖花生醬'],
            'bibimbap_secret': ['韓式辣醬', '自製韓式拌飯醬']
        };
        for (const [canonicalId, aliases] of Object.entries(aliasMap)) {
            if (id === canonicalId || aliases.includes(id)) {
                found = this.data.ingredients.find(ing => ing.id === canonicalId || aliases.includes(ing.name) || aliases.includes(ing.id));
                if (found) return withNutritionEvidence(found);
            }
        }
        return null;
    }

    checkStock(id) {
        return this.data.pantryInventory.foodStockStatus?.[id] === true;
    }
    
    checkSupplyStock(id) {
        return this.data.pantryInventory.supplyStockStatus?.[id] === true;
    }

    isInShoppingList(targetId) {
        if (!this.data.pantryInventory.shoppingList) return false;
        return this.data.pantryInventory.shoppingList.some(s => s.targetId === targetId && !s.isPurchased);
    }

    async saveIngredient(ingData, { replaceId = null } = {}) {
        if (!ingData || !ingData.id) return;
        const scope = this.personalScope;
        const context = this.personalContext;
        const currentOwner = this.hasPersonalAccess() ? context?.userId
            : this.officialCatalogOffline && this.officialCatalogActive
                ? sessionCatalogOwner(this.auth) : null;
        const pendingOwner = readOfficialOutbox().ownerUserId;
        if (replaceId && (ingData.id !== replaceId || !this.data.ingredients.some(item => item.id === replaceId))) {
            throw new Error('取代目標不存在或 ID 不符，原資料保留。');
        }
        if (isRetiredOfficialIngredient(ingData.id || replaceId)) throw Error('可可粉已由全家共用食材庫移除，不能再儲存此舊項目。');
        const category = ingData.category || 'proteins';

        // 🛡️ 防呆：檢查是否已有完全同名之食材 (防止重複建立雙胞胎 ID)
        const normNewName = normalizeIngredientName(ingData.name || '');
        let existingSameName = null;
        ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
            const found = (this.data.rawIngredients?.[cat] || []).find(i => {
                if (i.id === ingData.id) return false;
                return normalizeIngredientName(i.name || '') === normNewName;
            });
            if (found) existingSameName = found;
        });

        if (existingSameName && replaceId) throw new Error('新名稱與其他食材完全同名，為避免誤覆寫，請先修改名稱或重新選擇目標。');

        if (existingSameName) {
            console.log(`[saveIngredient] 發現已有完全同名食材【${existingSameName.name}】(${existingSameName.id})，更新既有食材而非建立雙胞胎。`);
            ingData.id = existingSameName.id;
        }

        const previous = this.getIngredientById(ingData.id);
        // The outbox is owner-specific, but private ingredients and photo/price
        // edits are not part of it. Never block unrelated local-only metadata.
        if (pendingOwner && pendingOwner !== currentOwner
            && (this.officialCatalogRows.has(ingData.id) || this.officialIngredientById.has(ingData.id))
            && (!previous || !sameNutrition(previous,ingData))) {
            throw Error('這台裝置有其他登入者尚未同步的官方食材，不能混合兩個帳號的營養修改。');
        }
        const before = Object.fromEntries([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => [key, localStorage.getItem(key)]));
        const backup = await prepareIngredientPhotoBackup(before, this.ingredientPhotoStore);
        if ([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].some(key => localStorage.getItem(key) !== before[key])) {
            throw new Error('備份期間食材已變更，原資料保留，請重開編輯。');
        }
        if (replaceId) for (const key of [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY]) {
            if (backup.before[key] !== null) backup.before[key] = serializeIngredientPhotos(JSON.parse(backup.before[key]));
        }
        localStorage.setItem('kitchen_v2_nutrition_edit_backup', JSON.stringify({before:backup.before, savedAt:new Date().toISOString()}));
        ingData = { ...previous, ...ingData };
        for (const field of ['photoUrl', 'photo']) {
            const originalField = typeof ingData[field] === 'string' && ingData[field].startsWith('blob:')
                && ['photoUrl', 'photo'].find(key => previous?.[key] === ingData[field] && previous?.localPhotoRefs?.[key]);
            if (originalField) ingData.localPhotoRefs = { ...ingData.localPhotoRefs, [field]: previous.localPhotoRefs[originalField] };
            else if (ingData[field] !== previous?.[field] && ingData.localPhotoRefs?.[field]) {
                ingData.localPhotoRefs = { ...ingData.localPhotoRefs };
                delete ingData.localPhotoRefs[field];
            }
        }
        if (previous?.nutritionCache) {
            ingData.nutritionCache = { ...previous.nutritionCache,
                edited: previous.nutritionCache.edited || !sameNutrition(previous, ingData) };
        }
        if (previous && (!sameNutrition(previous, ingData) || previous.name !== ingData.name || (previous.brand || '') !== (ingData.brand || ''))) {
            if (ingData.nutritionEvidence === previous.nutritionEvidence) ingData.nutritionEvidence = { kind: 'missing', status: 'pending' };
            ingData.nutritionReviewRequired = replaceId ? ingData.nutritionEvidence?.status !== 'verified' : false;
            ingData.weightBasisSource = '';
        }

        if (!ingData.nutritionEvidence) ingData.nutritionEvidence = { kind: 'missing', status: 'pending' };

        // 🛡️ 鐵律守門：若食材包含 Base64 照片，上傳圖床；失敗則清空 photoUrl，絕不存入資料庫
        if (ingData.photoUrl && ingData.photoUrl.startsWith('data:')) {
            let uploadedUrl = null;
            if (this.supabase) {
                try {
                    uploadedUrl = await this.supabase.uploadIngredientPhoto(ingData.photoUrl);
                } catch (e) {}
            }
            ingData.photoUrl = uploadedUrl || null;
        }

        if (replaceId && (this.personalScope !== scope || this.personalContext !== context
            || [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].some(key => localStorage.getItem(key) !== before[key])
            || !this.data.ingredients.some(item => item.id === replaceId))) {
            throw new Error('儲存期間資料或資料空間已變更，原食材保留，請重新確認。');
        }

        if (this.officialCatalogActive && this.officialCatalogRows.has(ingData.id)) {
            const cloudRow = this.officialCatalogRows.get(ingData.id);
            const canonicalBefore = cloudRow.ingredient; // Some 100-item seeds still lack nutrition panels.
            const canonicalNext = canonicalNutritionItem(cloudRow.ingredient, ingData);
            const nutrientFields = ['unitLabel','isCount','per100g','perServing','perUnit',
                'servingSize','servingUnit','gramsPerPack','gramsPerUnit','weightBasis',
                'weightBasisSource','nutritionEvidence','nutritionReviewRequired'];
            const changed = nutrientFields.some(key =>
                JSON.stringify(canonicalBefore[key]) !== JSON.stringify(canonicalNext[key]));
            if (changed) {
                // Explicitly stage a LOCAL durable edit first. Network is never a
                // prerequisite for the user's updated calculator value.
                if (this.officialCatalogOwner !== currentOwner
                    || !(this.hasPersonalAccess() || this.officialCatalogOffline))
                    throw Error('請先確認目前登入身分再儲存官方營養，避免把修改寫到別人的共用資料。');
                const queued = stageOfficialEdit(localStorage,{
                    ownerUserId:currentOwner,baseRevision:cloudRow.revision,
                    baseItem:cloudRow.ingredient,editedItem:ingData
                });
                const categories=['proteins','veggies','carbs','sauces'];
                const nextRaw = Object.fromEntries(categories.map(cat => [
                    cat,(this.data.rawIngredients?.[cat] || [])
                        .filter(i => i.id !== ingData.id).map(i => JSON.parse(JSON.stringify(i)))
                ]));
                nextRaw[category].push(JSON.parse(JSON.stringify(ingData)));
                const allCustom = JSON.parse(before[CUSTOM_INGREDIENT_KEY] || '[]');
                if (!Array.isArray(allCustom))
                    throw Error('私房食材記錄異常，官方營養未儲存。');
                const nextCustom = allCustom.filter(i => i.id !== ingData.id);
                const prepared = await prepareIngredientPhotoBackup({
                    [INGREDIENT_CACHE_KEY]:JSON.stringify(nextRaw),
                    [CUSTOM_INGREDIENT_KEY]:JSON.stringify(nextCustom)
                },this.ingredientPhotoStore);
                if (this.personalScope !== scope || this.personalContext !== context
                    || (this.hasPersonalAccess() ? context?.userId !== currentOwner
                        : !this.officialCatalogOffline || sessionCatalogOwner(this.auth) !== currentOwner)
                    || [INGREDIENT_CACHE_KEY,CUSTOM_INGREDIENT_KEY].some(key => localStorage.getItem(key)!==before[key]))
                    throw Error('備份時登入或食材已變更，尚未儲存。');
                persistOfficialCatalogEdit(localStorage,{
                    newCatalogBytes:serializeIngredientPhotos(JSON.parse(prepared.before[INGREDIENT_CACHE_KEY])),
                    newCustomBytes:serializeIngredientPhotos(JSON.parse(prepared.before[CUSTOM_INGREDIENT_KEY])),
                    newQueue:queued.bytes
                });
                this.data.rawIngredients = nextRaw;
                this.data.ingredients = this.data.ingredients.filter(i => i.id !== ingData.id);
                this.data.ingredients.push(ingData);
                this.officialCatalogStatus = '手機已立即使用新營養值，等待 Supabase 同步。';
                this.sharedNutritionMessage = this.officialCatalogStatus;
                this.syncOfficialIngredientEdits().catch(e => {
                    this.officialCatalogStatus = `本機已儲存，雲端待同步：${e.message}`;
                    this.sharedNutritionMessage = this.officialCatalogStatus;
                });
                return ingData;
            }
            // Identity is canonical even for metadata-only edits. A renamed or
            // rebranded food must have a distinct, user-approved private ID.
        }

        // No second writable authority: a canonical ingredient can only be
        // edited against a previously verified Supabase catalog revision.
        // The GitHub seed and old sparse override table are historical/readonly.
        if (!this.officialCatalogActive && this.officialIngredientById.has(ingData.id)
            && (!previous || !sameNutrition(previous,ingData))) {
            throw Error('Supabase 官方食材尚未載入，這次營養修改不能安全共享。請先連線載入一次官方食材，之後可離線編輯。');
        }
        // Metadata-only edits remain local. Private IDs are not promoted to
        // the family catalog without a separate explicit product decision.

        if (replaceId) {
            // Stage both local ingredient records before publishing the replacement in memory.
            const nextRaw = Object.fromEntries(Object.entries(this.data.rawIngredients).map(([key, list]) =>
                [key, list.filter(item => item.id !== replaceId)]));
            (nextRaw[category] ||= []).push(ingData);
            const custom = JSON.parse(before[CUSTOM_INGREDIENT_KEY] || '[]');
            if (!Array.isArray(custom)) throw new Error('本機私房食材格式不正確，原資料保留。');
            const nextCustom = [...custom.filter(item => item.id !== replaceId), ingData];
            const staged = await prepareIngredientPhotoBackup({
                [INGREDIENT_CACHE_KEY]: JSON.stringify(nextRaw),
                [CUSTOM_INGREDIENT_KEY]: JSON.stringify(nextCustom)
            }, this.ingredientPhotoStore);
            if (this.personalScope !== scope || this.personalContext !== context
                || [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].some(key => localStorage.getItem(key) !== before[key])) {
                throw new Error('備份期間資料已變更，原食材保留，請重新確認。');
            }
            const cache = serializeIngredientPhotos(JSON.parse(staged.before[INGREDIENT_CACHE_KEY]));
            const customCache = serializeIngredientPhotos(JSON.parse(staged.before[CUSTOM_INGREDIENT_KEY]));
            localStorage.setItem(INGREDIENT_CACHE_KEY, cache);
            try { localStorage.setItem(CUSTOM_INGREDIENT_KEY, customCache); }
            catch (error) {
                // Restore photo-safe records; historical encoded photos remain in binary backup.
                if (backup.before[INGREDIENT_CACHE_KEY] === null) localStorage.removeItem(INGREDIENT_CACHE_KEY);
                else localStorage.setItem(INGREDIENT_CACHE_KEY, backup.before[INGREDIENT_CACHE_KEY]);
                throw new Error('無法儲存私房食材，已保留原食材與備份。請釋出儲存空間後重試。');
            }
            this.data.rawIngredients = nextRaw;
            this.data.ingredients = [...this.data.ingredients.filter(item => item.id !== replaceId), ingData];
            this.customIngredientSync.noteSavedItem(ingData);
            return ingData;
        }

        // 1. Ensure rawIngredients has the category array
        if (!this.data.rawIngredients) {
            this.data.rawIngredients = { proteins: [], veggies: [], carbs: [], sauces: [] };
        }
        if (!this.data.rawIngredients[category]) {
            this.data.rawIngredients[category] = [];
        }

        // 2. Remove old entry if exists across all categories in rawIngredients
        ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
            if (this.data.rawIngredients[cat]) {
                this.data.rawIngredients[cat] = this.data.rawIngredients[cat].filter(i => i.id !== ingData.id);
            }
        });

        // 3. Add to the specified category
        this.data.rawIngredients[category].push(ingData);

        // 4. Update the flattened this.data.ingredients array
        this.data.ingredients = this.data.ingredients.filter(i => i.id !== ingData.id);
        this.data.ingredients.push(ingData);

        // 5. Persist to ingredients.json
        await this.saveJson('ingredients.json', this.data.rawIngredients);

        // 6. 同步更新採買清單中已存在的該品項通路
        if (this.data.pantryInventory?.shoppingList) {
            let shoppingUpdated = false;
            this.data.pantryInventory.shoppingList.forEach(s => {
                if (s.targetId === ingData.id) {
                    s.preferredStores = [...(ingData.preferredStores || [ingData.preferredStore || '全聯'])];
                    s.store = ingData.preferredStore || s.preferredStores[0] || '全聯';
                    shoppingUpdated = true;
                }
            });
            if (shoppingUpdated) {
                await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
            }
        }

        // 7. Also sync custom ingredients to LocalStorage
        try {
            const customKey = 'kitchen_v2_custom_ingredients';
            let customList = [];
            try {
                const stored = localStorage.getItem(customKey);
                if (stored) customList = JSON.parse(stored);
            } catch (e) {}
            customList = customList.filter(i => i.id !== ingData.id);
            customList.push(ingData);
            this.safeSetLocalStorage(customKey, customList);
        } catch (e) {}
        // Uses the established saveIngredient duplicate / photo guards.
        // In the absence of verified cloud ownership, the next login discovers
        // this local record and stages it, without losing its existing ID.
        this.customIngredientSync.noteSavedItem(ingData);
        return ingData;
    }

    async updateStock(id, hasStock) {
        return this.toggleStock(id, hasStock);
    }

    async deleteIngredient(id) {
        // Remove from ingredients array
        this.data.ingredients = this.data.ingredients.filter(ing => ing.id !== id);
        // Remove from rawIngredients categories
        if (this.data.rawIngredients) {
            ['proteins', 'veggies', 'carbs', 'sauces'].forEach(cat => {
                if (this.data.rawIngredients[cat]) {
                    this.data.rawIngredients[cat] = this.data.rawIngredients[cat].filter(ing => ing.id !== id);
                }
            });
            await this.saveJson('ingredients.json', this.data.rawIngredients);
        }
        // Remove stock & cart references
        if (this.data.pantryInventory.foodStockStatus) {
            delete this.data.pantryInventory.foodStockStatus[id];
        }
        if (this.data.pantryInventory.shoppingList) {
            this.data.pantryInventory.shoppingList = this.data.pantryInventory.shoppingList.filter(s => s.targetId !== id);
        }
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleShoppingList(itemOrId) {
        if (!this.hasPersonalAccess()) return false;
        if (!this.data.pantryInventory.shoppingList) {
            this.data.pantryInventory.shoppingList = [];
        }
        let targetId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.targetId;
        let item = typeof itemOrId === 'object' ? itemOrId : null;
        if (!item && targetId) {
            const ing = this.getIngredientById(targetId);
            item = {
                targetId: targetId,
                name: ing?.name || targetId,
                type: 'food',
                preferredStores: ing?.preferredStores || (ing?.preferredStore ? [ing.preferredStore] : ['全聯']),
                store: ing?.preferredStore || '全聯'
            };
        }
        if (!targetId || !item) return;

        const index = this.data.pantryInventory.shoppingList.findIndex(s => s.targetId === targetId && !s.isPurchased);
        if (index !== -1) {
            this.data.pantryInventory.shoppingList.splice(index, 1);
        } else {
            let defaultStore = null;
            if (item.type === 'supply') {
                const sup = this.data.householdSupplies?.supplies?.find(s => s.id === targetId);
                defaultStore = sup?.preferredStores?.[0] || sup?.store || item.store || (item.name.includes('紙巾') || item.name.includes('洗碗') ? 'Costco' : '全聯');
            } else {
                const ing = this.getIngredientById(targetId);
                if (ing?.preferredStores && ing.preferredStores.length > 0) {
                    defaultStore = ing.preferredStores[0];
                } else if (ing?.preferredStore) {
                    defaultStore = ing.preferredStore;
                } else if (item.store) {
                    defaultStore = item.store;
                } else if (ing?.brand?.includes('義美') || item.name?.includes('義美') || item.name?.includes('豆奶') || item.name?.includes('芝麻粉')) {
                    defaultStore = '義美';
                } else if (['beef_slice', 'chicken_thigh', 'tuna', 'frozen_berry', 'greek_yogurt', 'pork_shoulder', 'salmon', 'avocado_mash', 'avocado_oil', 'unsalted_butter', 'corn'].includes(targetId)) {
                    defaultStore = 'Costco';
                } else {
                    defaultStore = '全聯';
                }
            }
            defaultStore = normalizeStoreName(defaultStore);
            const rawStores = item.preferredStores || (defaultStore ? [defaultStore] : ['全聯']);
            const stores = normalizeStoreList(rawStores);
            this.data.pantryInventory.shoppingList.push({
                id: 'shop_' + Date.now(),
                type: item.type || 'food',
                targetId: targetId,
                name: item.name,
                sourceDish: item.sourceDish || '常備食材',
                store: defaultStore || '全聯',
                preferredStores: stores,
                isPurchased: false
            });
        }
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleStock(id, hasStock) {
        if (!this.hasPersonalAccess()) return false;
        if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
        this.data.pantryInventory.foodStockStatus[id] = hasStock;
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleSupplyStock(id, hasStock) {
        if (!this.hasPersonalAccess()) return false;
        if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
        this.data.pantryInventory.supplyStockStatus[id] = hasStock;
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async toggleShoppingItemPurchased(id) {
        if (!this.hasPersonalAccess()) return false;
        const list = this.data.pantryInventory.shoppingList || [];
        const item = list.find(s => s.id === id);
        if (item) {
            item.isPurchased = !item.isPurchased;
            await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
        }
    }

    async deleteShoppingItem(id) {
        if (!this.hasPersonalAccess()) return false;
        if (!this.data.pantryInventory.shoppingList) return;
        this.data.pantryInventory.shoppingList = this.data.pantryInventory.shoppingList.filter(s => s.id !== id);
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async clearPurchasedShoppingList() {
        if (!this.hasPersonalAccess()) return false;
        if (!this.data.pantryInventory.shoppingList) return;
        const list = this.data.pantryInventory.shoppingList;
        
        // Auto restock in inventory
        list.forEach(item => {
            if (item.isPurchased) {
                if (item.type === 'supply') {
                    if (!this.data.pantryInventory.supplyStockStatus) this.data.pantryInventory.supplyStockStatus = {};
                    this.data.pantryInventory.supplyStockStatus[item.targetId] = true;
                } else {
                    if (!this.data.pantryInventory.foodStockStatus) this.data.pantryInventory.foodStockStatus = {};
                    this.data.pantryInventory.foodStockStatus[item.targetId] = true;
                }
            }
        });

        // Filter out purchased items
        this.data.pantryInventory.shoppingList = list.filter(s => !s.isPurchased);
        await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
    }

    async deleteSupply(id) {
        if (!this.hasPersonalAccess()) return false;
        if (this.data.householdSupplies && this.data.householdSupplies.supplies) {
            this.data.householdSupplies.supplies = this.data.householdSupplies.supplies.filter(s => s.id !== id);
            await this.saveJson('household_supplies.json', this.data.householdSupplies);
        }
        if (this.data.pantryInventory.supplyStockStatus) {
            delete this.data.pantryInventory.supplyStockStatus[id];
            await this.saveJson('pantry_inventory.json', this.data.pantryInventory);
        }
    }

    // --- Calculation Methods ---
    getNutritionIssues(ingredients) {
        return ingredients.map(req => ingredientNutritionIssue(this.getIngredientById(req.id), req)).filter(Boolean);
    }

    calculateNutritionForMember(ingredients, memberKey) {
        // ingredients format: [{ id: 'tuna', amount: 80 }, ...]
        let total = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        
        ingredients.forEach(req => {
            const ingData = this.getIngredientById(req.id);
            if (ingData) {
                const basis = ingredientNutritionBasis(ingData, req);
                if (ingredientNutritionIssue(ingData, req) || (!basis && Number(req.amount) > 0)) {
                    Object.keys(total).forEach(key => { total[key] = NaN; });
                } else if (basis) {
                    const ratio = (Number(req.amount) || 0) / basis.divisor;
                    const n = basis.nutrients;
                    total.kcal += (n.kcal || 0) * ratio;
                    total.protein += (n.protein || 0) * ratio;
                    total.carbs += (n.carbs || 0) * ratio;
                    total.fat += (n.fat || 0) * ratio;
                    total.sodium += (n.sodium || 0) * ratio;
                }
            } else if (Number(req.amount) !== 0) {
                Object.keys(total).forEach(key => { total[key] = NaN; });
            }
        });

        // Round to 1 decimal place
        Object.keys(total).forEach(k => {
            total[k] = Math.round(total[k] * 10) / 10;
        });

        return total;
    }
    
    getMemberStatusColor(memberKey, currentTotal) {
        const target = this.profiles[memberKey];
        // 🟢 (Safe & Achieved): > 90% and < 100% of target? Or just < target?
        // Let's define simple logic: < 100% is safe/under. > 100% is over.
        // Actually PRD says:
        // 🟢 綠色 (Safe & Achieved)：數值在全天總預算合理安全區間內（未爆表/已達標）。
        // ⚫️ 黑色 (Under Target)：單餐累積數值未達到全天目標。
        // 🔴 紅色 (Over Budget)：全天總累積熱量/營養素超過全天上限。
        
        let statuses = {};
        const check = (val, max) => {
            if (val > max) return 'over';
            if (val > max * 0.8) return 'safe'; // 80%-100% is safe
            return 'under'; // <80%
        };
        
        statuses.kcal = check(currentTotal.kcal, target.targetKcal);
        statuses.protein = check(currentTotal.protein, target.targetProtein);
        statuses.carbs = check(currentTotal.carbs, target.targetCarbs);
        statuses.fat = check(currentTotal.fat, target.targetFat);
        statuses.sodium = check(currentTotal.sodium, target.targetSodium);
        
        return statuses;
    }

    // --- Verified meal logs; the old shared cache is preserved for a separate migration. ---
    clearMealLogs() {
        this.mealAccess = null;
        this.mealState = emptyMealState();
        this.mealMutation += 1;
        this.data.dailyLogs = { logs: [] };
        this.data.mealSyncMessage = '請登入並確認餐點權限。本機草稿仍保留。';
    }

    hasMealAccess() {
        return Boolean(this.mealAccess && this.auth.isCurrentContext(this.mealAccess.identity));
    }

    canAccessMeal(member) {
        return this.hasMealAccess() && ['bebe', 'ariel', 'jason'].includes(member)
            && (this.mealAccess.isManager || this.mealAccess.member === member);
    }

    requireMealAccess(member) {
        if (!this.canAccessMeal(member)) throw new Error('請登入並確認這位成員的餐點權限。');
        return this.mealAccess;
    }

    async initializeMealLogs() {
        this.clearMealLogs();
        const identity = this.auth.getPersonalContext();
        if (!identity) return false;
        try {
            const access = await this.supabase.getMealAccess();
            if (!this.auth.isCurrentContext(identity) || access.identity !== identity) return false;
            const state = readMealState(identity.userId);
            this.mealAccess = access;
            this.applyMealState(state);
            this.data.mealSyncMessage = state.pending.length ? '餐點有本機草稿，等待同步。'
                : (localStorage.getItem('kitchen_v2_daily_logs.json') !== null ? '舊裝置餐點已保留，待確認歸屬；不會自動上傳。' : '');
            return true;
        } catch (error) {
            if (this.auth.isCurrentContext(identity)) this.data.mealSyncMessage = error.message;
            return false;
        }
    }

    applyMealState(state) {
        this.mealState = state;
        this.data.dailyLogs = { logs: state.logs.map(day => ({ ...day,
            diners: Object.fromEntries(Object.entries(day.diners || {}).filter(([member]) => this.canAccessMeal(member))) })) };
    }

    persistMealState(state) {
        if (!this.hasMealAccess()) throw new Error('登入已變更，餐點未儲存。');
        writeMealState(this.mealAccess.identity.userId, state);
        this.mealMutation += 1;
        this.applyMealState(state);
    }

    setMealDay(state, date, member, meals) {
        let day = state.logs.find(row => row.date === date);
        if (!day) { day = { date, diners: {} }; state.logs.push(day); }
        const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        meals.forEach(meal => Object.keys(totals).forEach(key => { totals[key] += Number((meal.nutrients || meal.nutrition)?.[key]) || 0; }));
        Object.keys(totals).forEach(key => { totals[key] = Math.round(totals[key] * 10) / 10; });
        day.diners[member] = { totals, meals };
    }

    getDailyLog(date, member) {
        if (this.canAccessMeal(member)) {
            const day = this.data.dailyLogs.logs.find(row => row.date === date);
            if (day?.diners?.[member]) return day.diners[member];
        }
        return { totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }, meals: [] };
    }

    async fetchMealsFromSupabase(date, member) {
        if (!this.canAccessMeal(member)) return false;
        const access = this.mealAccess;
        const mutation = this.mealMutation;
        const key = date + '/' + member;
        const sequence = (this.mealReadSequence.get(key) || 0) + 1;
        this.mealReadSequence.set(key, sequence);
        try {
            const cloud = await this.supabase.getMealsByDate(date, member);
            if (!this.hasMealAccess() || access !== this.mealAccess || mutation !== this.mealMutation || sequence !== this.mealReadSequence.get(key)) return false;
            if (!Array.isArray(cloud)) throw new Error('餐點雲端讀取失敗，保留本機資料。');
            const meals = new Map(cloud.map(meal => [meal.id, meal]));
            this.mealState.pending.filter(item => item.date === date && item.member === member).forEach(item => {
                if (item.operation === 'delete') meals.delete(item.id);
                else meals.set(item.id, item.meal);
            });
            const next = JSON.parse(JSON.stringify(this.mealState));
            this.setMealDay(next, date, member, [...meals.values()]);
            this.persistMealState(next);
            return true;
        } catch (error) {
            if (access === this.mealAccess && this.auth.isCurrentContext(access.identity)) this.data.mealSyncMessage = error.message;
            return false;
        }
    }

    async syncMealDrafts() {
        if (!this.hasMealAccess()) return false;
        if (this.mealSyncPromise) return this.mealSyncPromise;
        const access = this.mealAccess;
        const operation = (async () => {
            try {
                while (this.mealState.pending.length) {
                    if (!this.hasMealAccess() || this.mealAccess !== access) return false;
                    const item = JSON.parse(JSON.stringify(this.mealState.pending[0]));
                    this.requireMealAccess(item.member);
                    const saved = item.operation === 'delete'
                        ? await this.supabase.deleteMeal(item.id, item.date, item.member)
                        : await this.supabase.saveMeal(item.date, item.member, item.meal);
                    if (!this.hasMealAccess() || this.mealAccess !== access) return false;
                    if (saved !== true) throw new Error('餐點未收到雲端確認。');
                    const next = JSON.parse(JSON.stringify(this.mealState));
                    next.pending = next.pending.filter(pending => pending.mutationId !== item.mutationId);
                    this.persistMealState(next);
                }
                this.data.mealSyncMessage = '餐點已同步。';
                return true;
            } catch (error) {
                if (access === this.mealAccess) this.data.mealSyncMessage = `餐點已保留於本機，尚未同步。${error.message}`;
                return false;
            }
        })();
        this.mealSyncPromise = operation;
        try { return await operation; }
        finally { if (this.mealSyncPromise === operation) this.mealSyncPromise = null; }
    }

    async recordMeal(date, member, meal) {
        const access = this.requireMealAccess(member);
        if (!meal.id) meal.id = 'meal_' + crypto.randomUUID();
        const draft = JSON.parse(JSON.stringify(meal));
        if (draft.photoUrl?.startsWith('data:')) {
            draft.photoUrl = await this.supabase.uploadMealPhoto(draft.photoUrl, member).catch(() => null);
        }
        if (!this.hasMealAccess() || access !== this.mealAccess) throw new Error('登入已變更，請確認餐點帳號。');
        const next = JSON.parse(JSON.stringify(this.mealState));
        if (next.logs.some(day => Object.entries(day.diners || {}).some(([person, log]) =>
            (day.date !== date || person !== member) && log.meals.some(row => row.id === draft.id)))) {
            throw new Error('餐點 ID 已屬於其他日期或成員，請保留原紀錄。');
        }
        const meals = [...this.getDailyLog(date, member).meals.filter(row => row.id !== draft.id), draft];
        this.setMealDay(next, date, member, meals);
        next.pending = next.pending.filter(item => item.id !== draft.id);
        next.pending.push({ operation: 'save', id: draft.id, date, member, meal: draft, mutationId: crypto.randomUUID() });
        this.persistMealState(next);
        this.data.mealSyncMessage = '餐點已保留於本機，等待同步。';
        return this.syncMealDrafts();
    }

    async deleteMeal(date, member, mealId) {
        this.requireMealAccess(member);
        const next = JSON.parse(JSON.stringify(this.mealState));
        const original = this.getDailyLog(date, member).meals.find(meal => meal.id === mealId);
        if (!original) return false;
        this.setMealDay(next, date, member, this.getDailyLog(date, member).meals.filter(meal => meal.id !== mealId));
        next.pending = next.pending.filter(item => item.id !== mealId);
        next.pending.push({ operation: 'delete', id: mealId, date, member, meal: original, mutationId: crypto.randomUUID() });
        this.persistMealState(next);
        return this.syncMealDrafts();
    }

    // --- Favorite Foods Methods ---
    getFavoriteFoods() {
        return this.data.favoriteFoods || [];
    }

    async saveFavoriteFood(foodItem) {
        if (!this.data.favoriteFoods) this.data.favoriteFoods = [];
        const existingIndex = this.data.favoriteFoods.findIndex(f => f.name === foodItem.name);
        if (existingIndex >= 0) {
            this.data.favoriteFoods[existingIndex] = foodItem;
        } else {
            this.data.favoriteFoods.push(foodItem);
        }
        await this.saveJson('favorite_foods.json', { favorites: this.data.favoriteFoods });
    }

    async deleteFavoriteFood(id) {
        if (!this.data.favoriteFoods) return;
        this.data.favoriteFoods = this.data.favoriteFoods.filter(f => f.id !== id && f.name !== id);
        await this.saveJson('favorite_foods.json', { favorites: this.data.favoriteFoods });
    }

    /**
     * 🧠 3層巨量營養素主導自動分類法則 (Macro Dominance Auto Categorization)
     * @param {string} name - 食材名稱
     * @param {object} nutrients - { kcal, protein, carbs, fat, sodium }
     * @returns {string} - 'proteins' | 'veggies' | 'carbs' | 'sauces'
     */
    detectNutrientCategory(name = '', nutrients = {}) {
        const n = (name || '').trim().toLowerCase();
        const kcal = Number(nutrients.kcal) || 0;
        const p = Number(nutrients.protein) || 0;
        const c = Number(nutrients.carbs) || 0;
        const f = Number(nutrients.fat) || 0;

        // 【第 1 層：微量品、調味料與零卡/微量飲品】
        const seasoningKeywords = ['鹽', '胡椒', '香料', '醋', '油', '醬', '咖啡', '茶', '可可', '抹醬', '糖漿', '肉桂', '巴薩米克'];
        if (seasoningKeywords.some(k => n.includes(k)) || (kcal < 15 && p < 1 && f < 1 && c < 2)) {
            return 'sauces'; // 歸入 🧂 油脂/調味/其他
        }

        // 【第 2 層：蔬菜水果防護 (低卡高纖蔬果)】
        const veggieKeywords = ['菜', '葉', '菇', '筍', '瓜', '茄', '番茄', '洋蔥', '蔥', '蒜', '薑', '椒', '蘿蔔', '木耳', '蘋果', '莓', '果', '芹', '芽'];
        if (veggieKeywords.some(k => n.includes(k)) && kcal <= 45) {
            return 'veggies'; // 穩穩留在 🥦 蔬菜水果
        }

        // 【第 3 層：實質巨量營養素主導】
        if (f >= p && f >= c && f > 0) {
            return 'sauces'; // 脂肪最高 ➔ 🧂 油脂/調味/其他 (黑芝麻粉、花生醬、奇亞籽、堅果、沙拉油)
        }
        if (p >= f && p >= c && p > 0) {
            return 'proteins'; // 蛋白質最高 ➔ 🥩 蛋白質 (豌豆蛋白飲、乳清蛋白粉、雞肉、蝦仁、蛋、豆腐)
        }
        if (c >= p && c >= f && c > 0) {
            return 'carbs'; // 碳水最高 ➔ 🍚 碳水主食 (糙米、燕麥、地瓜、義大利麵、馬鈴薯)
        }

        return 'sauces'; // 預設歸入 油脂/調味/其他
    }
}
