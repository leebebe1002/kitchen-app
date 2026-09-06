/**
 * 個人廚房狀態的本機入口。
 *
 * Bebe 與 Jason 使用 household；樂樂使用 ariel。這個分層先在本機
 * 生效，之後 Supabase 會沿用同一個 scope id，因此不需要再次搬動 UI 資料。
 */
const STORAGE_PREFIX = 'kitchen_v2_personal_state_';
const ACTIVE_SCOPE_KEY = 'kitchen_v2_active_storage_scope';

export const PERSONAL_SCOPES = {
    household: {
        id: 'household',
        label: '我和 Jason',
        members: ['bebe', 'jason']
    },
    ariel: {
        id: 'ariel',
        label: '樂樂',
        members: ['ariel']
    }
};

export function getActivePersonalScope() {
    const saved = localStorage.getItem(ACTIVE_SCOPE_KEY);
    return PERSONAL_SCOPES[saved] ? saved : 'household';
}

export function setActivePersonalScope(scopeId) {
    if (!PERSONAL_SCOPES[scopeId]) return;
    localStorage.setItem(ACTIVE_SCOPE_KEY, scopeId);
}

export function emptyPersonalKitchenState() {
    return {
        pantryInventory: {
            foodStockStatus: {},
            supplyStockStatus: {},
            shoppingList: [],
            foodCart: []
        },
        householdSupplies: { supplies: [] },
        version: 1,
        updatedAt: null
    };
}

export function hasPersonalKitchenData(state) {
    const pantry = state?.pantryInventory || {};
    const supplies = state?.householdSupplies?.supplies || [];
    return Object.keys(pantry.foodStockStatus || {}).length > 0
        || Object.keys(pantry.supplyStockStatus || {}).length > 0
        || (pantry.shoppingList || []).length > 0
        || (pantry.foodCart || []).length > 0
        || supplies.length > 0;
}

export function readPersonalKitchenState(scopeId) {
    try {
        const saved = localStorage.getItem(STORAGE_PREFIX + scopeId);
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.warn('Unable to read personal kitchen state:', error);
        return null;
    }
}

export function writePersonalKitchenState(scopeId, state, { preserveUpdatedAt = false } = {}) {
    if (!PERSONAL_SCOPES[scopeId]) return;
    localStorage.setItem(STORAGE_PREFIX + scopeId, JSON.stringify({
        ...state,
        updatedAt: preserveUpdatedAt && state?.updatedAt ? state.updatedAt : new Date().toISOString()
    }));
}
