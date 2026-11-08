import { INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY } from './IngredientBaselineUpdate.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';
import { prepareIngredientPhotoBackup, serializeIngredientPhotos } from './IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';

// A one-time, device-local adoption for Ariel's explicitly discarded OLD ingredient data.
// Never touch Personal Kitchen State, meals, the official GitHub file, or Bebe's device.
export const ARIEL_OFFICIAL_RESET_KEY = 'kitchen_v2_ariel_ingredients_official_20261108';
const ingredientKeys = [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY];

function journal(storage) {
    const raw = storage.getItem(ARIEL_OFFICIAL_RESET_KEY);
    if (raw === null) return null;
    const entry = JSON.parse(raw);
    if (entry?.scope !== 'ariel' || !['pending', 'complete', 'rolledBack'].includes(entry.status)
        || !entry.before || ingredientKeys.some(key => entry.before[key] !== null && typeof entry.before[key] !== 'string')) {
        throw Error('樂樂食材更新備份格式不正確，原資料已保留。');
    }
    return entry;
}

export function recoverArielOfficialReset(storage = localStorage) {
    const record = journal(storage);
    if (record?.status !== 'pending') return record?.status === 'complete';
    // Finish restoring an interrupted two-key write BEFORE either key is read by FK.
    for (const key of ingredientKeys) {
        if (record.before[key] === null) storage.removeItem(key);
        else storage.setItem(key, record.before[key]);
    }
    storage.setItem(ARIEL_OFFICIAL_RESET_KEY, JSON.stringify({ ...record, status: 'rolledBack' }));
    return false;
}

export async function applyArielOfficialReset(official, {
    storage = localStorage, photoStore, isCurrent = () => true
} = {}) {
    if (recoverArielOfficialReset(storage)) return null;
    const entries = ['proteins', 'veggies', 'carbs', 'sauces']
        .flatMap(cat => Array.isArray(official?.[cat]) ? official[cat] : []);
    if (entries.length !== 101 || new Set(entries.map(item => item.id)).size !== 101)
        throw Error('GitHub 食材基準不完整，未覆寫樂樂資料。');
    // Official content is hash-approved by the caller. Durable source must not contain photos as data URLs.
    const nextCache = serializeIngredientPhotos(official);
    const original = Object.fromEntries(ingredientKeys.map(key => [key, storage.getItem(key)]));
    const prepared = await prepareIngredientPhotoBackup(original, photoStore);
    if (!isCurrent() || ingredientKeys.some(key => storage.getItem(key) !== original[key]))
        throw Error('登入或本機食材已變更，沒有覆寫資料。');
    const before = Object.fromEntries(ingredientKeys.map(key =>
        [key, prepared.before[key] === null ? null : serializeIngredientPhotos(JSON.parse(prepared.before[key]))]));
    const record = { scope: 'ariel', status: 'pending', before };
    // Keep the only full backup in the journal; any failed write restores original keys.
    storage.setItem(ARIEL_OFFICIAL_RESET_KEY, JSON.stringify(record));
    try {
        storage.setItem(CUSTOM_INGREDIENT_KEY, '[]');
        storage.setItem(INGREDIENT_CACHE_KEY, nextCache);
        storage.setItem(ARIEL_OFFICIAL_RESET_KEY, JSON.stringify({ ...record, status: 'complete' }));
    } catch (error) {
        try { recoverArielOfficialReset(storage); }
        catch { throw Object.assign(Error('樂樂食材更新未完成，備份已保留；請重新開啟 FK 修復。'), { requiresReload: true }); }
        throw Error('樂樂食材更新未完成，已還原舊資料。');
    }
    return JSON.parse(nextCache);
}
