import { nutritionSnapshot } from './IngredientNutritionCache.js?v=20261109_FK21_THREE_FOODS_V2';
import { normalizeIngredientName } from './IngredientMatcher.js?v=20260918_FIX_STATE_V2';
import { hasEmbeddedIngredientPhoto } from './IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';

export const BASELINE_UPDATE_KEY = 'kitchen_v2_ingredient_baseline_20261103';
export const INGREDIENT_CACHE_KEY = 'kitchen_v2_ingredients.json';
export const CUSTOM_INGREDIENT_KEY = 'kitchen_v2_custom_ingredients';
const categories = ['proteins', 'veggies', 'carbs', 'sauces'];
const fields = ['unitLabel', 'isCount', 'per100g', 'perServing', 'perUnit', 'servingSize', 'servingUnit',
    'gramsPerPack', 'weightBasis', 'weightBasisSource', 'nutritionReviewRequired'];

export async function approvedIngredientBaseline(text) {
    // Historical baselines remain pinned for recovery; the current catalog has 100 items.
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    if (!new Set(['f811fcb2bd58330a0bc58ad13ce0e095a17b5a54a7d6ab56fd972599c75ebfe0',
        '58be5cb2d13ca65a14468ccb9782aaaffdbf0405994c21686570d68a4e407e20',
        '6f6f96caaf61a12f3d216806052ff86b408dd1c05ed04d4ee4e972563048add5']).has(hex)) {
        throw new Error('食材基準未經版本核准（99／100／101 項），原資料未更動。');
    }
    return JSON.parse(text);
}

function readUpdate(storage) {
    const raw = storage.getItem(BASELINE_UPDATE_KEY);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    const validSnapshot = value => value && [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY]
        .every(key => value[key] === null || typeof value[key] === 'string');
    if (!['pending', 'complete', 'rolledBack'].includes(record?.status)
        || !validSnapshot(record.before) || !validSnapshot(record.original)) {
        throw new Error('食材更新備份格式不正確，請先保留資料並停止編輯。');
    }
    return record;
}

export function recoverIngredientBaseline(storage = localStorage) {
    const record = readUpdate(storage);
    if (record?.status !== 'pending') return record?.status === 'complete';
    // An interrupted multi-key write must be rolled back before the loader reads either key.
    for (const key of [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY]) {
        if (record.before[key] === null) storage.removeItem(key);
        else storage.setItem(key, record.before[key]);
    }
    storage.setItem(BASELINE_UPDATE_KEY, JSON.stringify({ ...record, status: 'rolledBack' }));
    return false;
}

function validateEntries(list) {
    if (!Array.isArray(list) || list.some(item => !item || typeof item.id !== 'string' || !item.id)
        || new Set(list.map(item => item.id)).size !== list.length) {
        throw new Error('本機食材格式或 ID 有衝突，原資料未更動。');
    }
    return list;
}

export function applyIngredientBaseline(official, storage = localStorage, prepared = null) {
    if (recoverIngredientBaseline(storage)) return null;
    const source = Object.fromEntries([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => [key, storage.getItem(key)]));
    if (prepared && Object.keys(source).some(key => source[key] !== prepared.source[key])) {
        throw new Error('備份期間食材已變更，請關閉其他 FK 分頁後重試；原資料已保留。');
    }
    const before = prepared?.before || source;
    if (Object.values(before).some(value => value && hasEmbeddedIngredientPhoto(JSON.parse(value)))) {
        throw new Error('食材內仍有暫存照片，無法安全建立備份；原資料未更動。');
    }
    const cached = before[INGREDIENT_CACHE_KEY] === null ? {} : JSON.parse(before[INGREDIENT_CACHE_KEY]);
    if (!cached || typeof cached !== 'object' || Array.isArray(cached)
        || categories.some(cat => cached[cat] !== undefined && !Array.isArray(cached[cat]))) {
        throw new Error('本機食材格式不正確，原資料未更動。');
    }
    const custom = validateEntries(before[CUSTOM_INGREDIENT_KEY] === null ? [] : JSON.parse(before[CUSTOM_INGREDIENT_KEY]));
    const customMap = new Map(custom.map(item => [item.id, item]));
    const local = validateEntries(categories.flatMap(cat => cached[cat] || []));
    const officialMap = new Map(categories.flatMap(cat => official[cat]).map(item => [item.id, item]));
    const patch = item => {
        const base = officialMap.get(item.id);
        if (!base) return item;
        const next = { ...item };
        for (const field of ['photoUrl', 'photo']) if (!next[field] && !next.localPhotoRefs?.[field]
            && customMap.get(item.id)?.localPhotoRefs?.[field]) {
            next.localPhotoRefs = { ...next.localPhotoRefs, [field]: customMap.get(item.id).localPhotoRefs[field] };
        }
        for (const field of fields) {
            delete next[field];
            if (base[field] !== undefined) next[field] = base[field];
        }
        next.nutritionCache = { base: nutritionSnapshot(base), edited: false, acceptedBaseline: '20261103' };
        return next;
    };
    const updated = Object.fromEntries(categories.map(cat => [cat, (cached[cat] || []).map(patch)]));
    const seen = new Set(local.map(item => item.id));
    // Keep custom-only private ingredients without renaming IDs or touching their references.
    for (const item of custom) if (!seen.has(item.id)) {
        const cat = categories.includes(item.category) ? item.category : 'veggies';
        updated[cat].push(patch(item));
        seen.add(item.id);
    }
    for (const cat of categories) for (const item of official[cat]) if (!seen.has(item.id)) {
        updated[cat].push(patch(item));
        seen.add(item.id);
    }
    const names = categories.flatMap(cat => updated[cat]).map(item => normalizeIngredientName(item.name));
    if (names.some(name => !name) || new Set(names).size !== names.length) {
        throw new Error('本機食材有同名或名稱缺失，請先核對；原資料未更動。');
    }
    const nextCache = JSON.stringify({ ...cached, ...updated });
    const nextCustom = before[CUSTOM_INGREDIENT_KEY] === null ? null : JSON.stringify(custom.map(patch));
    const previous = readUpdate(storage);
    const record = { status: 'pending', original: previous?.original || before, before };
    // This durable journal is also the backup. A failed backup cannot change the ingredient keys.
    storage.setItem(BASELINE_UPDATE_KEY, JSON.stringify(record));
    try {
        if (nextCustom !== null) storage.setItem(CUSTOM_INGREDIENT_KEY, nextCustom);
        storage.setItem(INGREDIENT_CACHE_KEY, nextCache);
        storage.setItem(BASELINE_UPDATE_KEY, JSON.stringify({ ...record, status: 'complete' }));
    } catch (error) {
        try { recoverIngredientBaseline(storage); }
        catch { throw Object.assign(new Error('更新未完成，備份已保留；請重新開啟 FK 完成復原後再編輯。'), { requiresReload: true }); }
        throw new Error('更新未完成，已保留原食材資料。請確認裝置儲存空間後重試。');
    }
    return JSON.parse(nextCache);
}
