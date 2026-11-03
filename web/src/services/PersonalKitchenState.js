/**
 * 個人廚房狀態的本機入口。
 *
 * Bebe 與 Jason 使用 household；樂樂使用 ariel。這個分層先在本機
 * 生效，之後 Supabase 會沿用同一個 scope id，因此不需要再次搬動 UI 資料。
 */
const STORAGE_PREFIX = 'kitchen_v2_personal_state_';

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
        updatedAt: null,
        revision: null,
        syncStatus: null,
        dirty: false
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

// Missing keys are the only first-use signal; I/O and malformed data must fail closed.
export function validatePersonalKitchenState(scopeId, state) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!Object.hasOwn(PERSONAL_SCOPES, scopeId) || !object(state)
        || (state.scopeId && state.scopeId !== scopeId)
        || !object(state.pantryInventory) || !object(state.householdSupplies)) {
        throw new Error('本機庫存資料或資料空間不正確，原資料已保留。');
    }
    const pantry = state.pantryInventory;
    if (['foodStockStatus', 'supplyStockStatus'].some(key => pantry[key] !== undefined && !object(pantry[key]))
        || ['shoppingList', 'foodCart'].some(key => pantry[key] !== undefined && !Array.isArray(pantry[key]))
        || (state.householdSupplies.supplies !== undefined && !Array.isArray(state.householdSupplies.supplies))) {
        throw new Error('本機庫存資料格式不正確，原資料已保留。');
    }
    return state;
}

export function readPersonalKitchenState(scopeId) {
    if (!Object.hasOwn(PERSONAL_SCOPES, scopeId)) throw new Error('未知的庫存資料空間。');
    const saved = localStorage.getItem(STORAGE_PREFIX + scopeId);
    return saved === null ? null : validatePersonalKitchenState(scopeId, JSON.parse(saved));
}

export function restorePersonalKitchenStateBackup(scopeId) {
    if (!Object.hasOwn(PERSONAL_SCOPES, scopeId)) throw new Error('請指定有效的庫存資料空間。');
    const backup = localStorage.getItem(STORAGE_PREFIX + scopeId + '_backup');
    if (backup === null) return null;
    const state = validatePersonalKitchenState(scopeId, JSON.parse(backup));
    // Restore is a local draft, never an acknowledgment of a remote revision.
    return writePersonalKitchenState(scopeId, state);
}

export function writePersonalKitchenState(scopeId, state, { preserveUpdatedAt = false } = {}) {
    validatePersonalKitchenState(scopeId, state);
    const current = localStorage.getItem(STORAGE_PREFIX + scopeId);
    const next = {
        ...state,
        scopeId,
        dirty: preserveUpdatedAt ? Boolean(state.dirty) : true,
        updatedAt: preserveUpdatedAt ? (state.updatedAt || null) : new Date().toISOString()
    };
    const serialized = JSON.stringify(next);
    if (current !== null) {
        validatePersonalKitchenState(scopeId, JSON.parse(current));
        localStorage.setItem(STORAGE_PREFIX + scopeId + '_backup', current);
    }
    localStorage.setItem(STORAGE_PREFIX + scopeId, serialized);
    return next;
}
