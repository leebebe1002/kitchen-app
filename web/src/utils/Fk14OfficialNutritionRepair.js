import { INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY } from './IngredientBaselineUpdate.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';
import { nutritionSnapshot } from './IngredientNutritionCache.js?v=20261105_DEFAULT_ESTIMATES_V1';
import { normalizeIngredientName } from './IngredientMatcher.js?v=20260918_FIX_STATE_V2';
import { prepareIngredientPhotoBackup, serializeIngredientPhotos } from './IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';

// User-triggered, one-time, device-local repair of the two differences found by
// Bebe's read-only 101-item audit. No Supabase or Personal Kitchen State writes.
export const FK14_OFFICIAL_REPAIR_KEY = 'kitchen_v2_fk14_official_nutrition_repair_20261108';
const keys = [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY];
const categories = ['proteins', 'veggies', 'carbs', 'sauces'];
const nutritionFields = ['unitLabel', 'isCount', 'per100g', 'perServing', 'perUnit',
    'servingSize', 'servingUnit', 'gramsPerPack', 'gramsPerUnit', 'weightBasis',
    'weightBasisSource', 'nutritionReviewRequired', 'nutritionEvidence', 'nutritionCache'];

// Only the exact observed legacy values qualify for this targeted repair.
export function isFk14KnownNutritionDifference(report) {
    if (report?.scope !== 'household' || report.officialCount !== 101
        || report.matched !== 99 || report.different !== 2 || report.missing !== 1
        || report.duplicates !== 0 || report.privateCount !== 0 || report.sharedCount !== 0
        || !Array.isArray(report.differences) || report.differences.length !== 2) return false;
    const snow = report.differences.find(item => item.id === 'snow_white_mushroom');
    const cocoa = report.differences.find(item => item.id === 'cocoa_powder');
    if (snow?.reason !== '手機計算清單缺少這項官方食材' || snow.fields?.length !== 0
        || cocoa?.reason !== '與 GitHub 官方基準不同' || !Array.isArray(cocoa.fields)) return false;
    const required = {
        'per100g.kcal': ['416.67','228'], 'per100g.protein': ['33.33','19.6'],
        'per100g.carbs': ['50','57.9'], 'per100g.fat': ['8.33','13.7'],
        'per100g.sodium': ['0','21'], 'perServing.kcal': ['25','未設定'],
        'perServing.protein': ['2','未設定'], 'perServing.carbs': ['3','未設定'],
        'perServing.fat': ['0.5','未設定'], 'perServing.sodium': ['0','未設定'],
        servingSize: ['6','未設定'], servingUnit: ['g','未設定'], weightBasis: ['as_sold','dry']
    };
    const nullable = new Set(['isCount','perUnit','gramsPerPack','gramsPerUnit']);
    const seen = new Set();
    for (const diff of cocoa.fields) {
        if (seen.has(diff.field)) return false;
        seen.add(diff.field);
        const pair = required[diff.field];
        if (pair ? diff.actual !== pair[0] || diff.expected !== pair[1]
            : !nullable.has(diff.field) || diff.actual !== 'null' || diff.expected !== '未設定') return false;
    }
    return Object.keys(required).every(field => seen.has(field));
}

const readJournal = storage => {
    const raw = storage.getItem(FK14_OFFICIAL_REPAIR_KEY);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (!['pending', 'complete', 'rolledBack'].includes(record?.status)
        || !record.before || keys.some(key =>
            record.before[key] !== null && typeof record.before[key] !== 'string'))
        throw Error('兩項食材修復備份格式不正確；請保留手機資料。');
    return record;
};

export function recoverFk14OfficialRepair(storage = localStorage) {
    const record = readJournal(storage);
    if (record?.status !== 'pending') return record?.status === 'complete';
    for (const key of keys) {
        if (record.before[key] === null) storage.removeItem(key);
        else storage.setItem(key, record.before[key]);
    }
    storage.setItem(FK14_OFFICIAL_REPAIR_KEY, JSON.stringify({ ...record, status: 'rolledBack' }));
    return false;
}

const items = data => categories.flatMap(cat => data[cat] || []);
function validCatalog(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || categories.some(cat => data[cat] !== undefined && !Array.isArray(data[cat])))
        throw Error('手機食材格式異常，未執行修復。');
    const list = items(data);
    if (list.some(item => !item || !item.id || typeof item.name !== 'string')
        || new Set(list.map(item => item.id)).size !== list.length)
        throw Error('手機食材有重複 ID 或資料不完整，未執行修復。');
}
function officialById(official) {
    validCatalog(official);
    const list = items(official);
    if (list.length !== 101 || new Set(list.map(i => i.id)).size !== 101)
        throw Error('官方食材並非已核准的 101 項，未執行修復。');
    return new Map(list.map(i => [i.id, i]));
}
function patchNutrition(current, official) {
    if ((current.brand || '') !== (official.brand || '')
        || (current.specification || '') !== (official.specification || ''))
        throw Error('可可粉的品牌或規格不同，不能直接覆蓋營養資料。');
    const next = { ...current };
    for (const key of nutritionFields) delete next[key];
    for (const key of nutritionFields) if (key !== 'nutritionCache' && official[key] !== undefined)
        next[key] = structuredClone(official[key]);
    next.nutritionCache = {
        base: nutritionSnapshot(official), edited: false, acceptedBaseline: '20261103'
    };
    return next;
}

/** The caller MUST verify the official JSON hash and current Auth/scope first. */
export async function applyFk14OfficialRepair(official, {
    storage = localStorage, photoStore, isCurrent = () => true
} = {}) {
    if (recoverFk14OfficialRepair(storage)) return null;
    const officialItems = officialById(official);
    const cocoa = officialItems.get('cocoa_powder');
    const snow = officialItems.get('snow_white_mushroom');
    const beech = officialItems.get('beech_mushroom');
    if (!cocoa || !snow || !beech) throw Error('官方食材缺少指定 ID，未執行修復。');
    const source = Object.fromEntries(keys.map(key => [key, storage.getItem(key)]));
    const prepared = await prepareIngredientPhotoBackup(source, photoStore);
    if (!isCurrent() || keys.some(key => storage.getItem(key) !== source[key]))
        throw Error('登入或食材資料已變更，沒有修改手機資料。');
    const cache = prepared.before[INGREDIENT_CACHE_KEY] === null
        ? null : JSON.parse(prepared.before[INGREDIENT_CACHE_KEY]);
    if (!cache) throw Error('手機食材快取不存在，請重開 FK 後再次檢查。');
    validCatalog(cache);
    const custom = prepared.before[CUSTOM_INGREDIENT_KEY] === null
        ? [] : JSON.parse(prepared.before[CUSTOM_INGREDIENT_KEY]);
    if (!Array.isArray(custom) || custom.some(item => !item || !item.id)
        || new Set(custom.map(item => item.id)).size !== custom.length)
        throw Error('手機私房食材資料異常，未執行修復。');
    const sameName = (a,b) => normalizeIngredientName(a) === normalizeIngredientName(b);
    // Previously renamed beech mushrooms were sometimes stored under the new
    // snow-white name, causing mergeUserState to suppress canonical snow-white.
    // Only the known canonical beech ID can be disambiguated automatically.
    for (const item of [...items(cache), ...custom]) {
        if (item.id !== snow.id && sameName(item.name, snow.name)) {
            if (item.id !== beech.id || item.brand || item.specification
                || item.nutritionEvidence?.kind === 'product_label')
                throw Error('雪白菇與另一項私人食材同名，為保留品牌／庫存關聯，不能自動修復。');
            item.name = beech.name;
        }
    }
    const all = items(cache);
    const oldCocoa = all.find(item => item.id === cocoa.id);
    if (!oldCocoa || !sameName(oldCocoa.name,cocoa.name))
        throw Error('手機可可粉的身分不符，未覆蓋營養。');
    for (const cat of categories) cache[cat] = (cache[cat] || []).map(item => item.id === cocoa.id
        ? patchNutrition(item,cocoa) : item.id === snow.id ? patchNutrition(item,snow) : item);
    if (!items(cache).some(item => item.id === snow.id))
        cache.veggies.push(structuredClone(snow));
    for (let index=0; index<custom.length; index++) {
        if (custom[index].id === cocoa.id) custom[index] = patchNutrition(custom[index],cocoa);
        if (custom[index].id === snow.id) custom[index] = patchNutrition(custom[index],snow);
    }
    validCatalog(cache);
    // After the known legacy alias is resolved, no new duplicate names are allowed.
    const names = items(cache).map(item => normalizeIngredientName(item.name));
    if (new Set(names).size !== names.length)
        throw Error('手機食材仍有同名衝突，原資料已保留。');
    const nextCache = serializeIngredientPhotos(cache);
    const nextCustom = prepared.before[CUSTOM_INGREDIENT_KEY] === null
        ? null : serializeIngredientPhotos(custom);
    const record = { status: 'pending', before: prepared.before };
    storage.setItem(FK14_OFFICIAL_REPAIR_KEY, JSON.stringify(record));
    try {
        if (nextCustom !== null) storage.setItem(CUSTOM_INGREDIENT_KEY, nextCustom);
        storage.setItem(INGREDIENT_CACHE_KEY, nextCache);
        storage.setItem(FK14_OFFICIAL_REPAIR_KEY, JSON.stringify({ ...record, status:'complete' }));
    } catch (error) {
        try { recoverFk14OfficialRepair(storage); }
        catch { throw Object.assign(Error('裝置資料尚待復原；請重開 FK。'), { requiresReload:true }); }
        throw Error('儲存失敗，已還原舊食材；請確認裝置儲存空間。');
    }
    return JSON.parse(nextCache);
}
