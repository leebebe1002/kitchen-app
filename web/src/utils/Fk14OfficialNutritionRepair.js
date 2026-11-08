import { INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY } from './IngredientBaselineUpdate.js?v=20261108_FK14_COCOA_RETIRED_V1';
import { nutritionSnapshot } from './IngredientNutritionCache.js?v=20261105_DEFAULT_ESTIMATES_V1';
import { normalizeIngredientName } from './IngredientMatcher.js?v=20260918_FIX_STATE_V2';
import { prepareIngredientPhotoBackup, serializeIngredientPhotos } from './IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';

// Recover legacy writes, retire cocoa with backup, and repair snow mushrooms on confirmation.
// No Supabase or Personal Kitchen State writes.
export const FK14_OFFICIAL_REPAIR_KEY = 'kitchen_v2_fk14_official_nutrition_repair_20261108';
const keys = [INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY];
const categories = ['proteins', 'veggies', 'carbs', 'sauces'];
const nutritionFields = ['unitLabel', 'isCount', 'per100g', 'perServing', 'perUnit',
    'servingSize', 'servingUnit', 'gramsPerPack', 'gramsPerUnit', 'weightBasis',
    'weightBasisSource', 'nutritionReviewRequired', 'nutritionEvidence', 'nutritionCache'];

// Bebe explicitly retired this canonical item for the whole family on 2026-11-08.
export const FK14_COCOA_RETIREMENT_KEY = 'kitchen_v2_fk14_retire_cocoa_20261108';
export const FK14_SNOW_REPAIR_KEY = 'kitchen_v2_fk14_snow_repair_20261108';
export const isRetiredOfficialIngredient = id => id === 'cocoa_powder';
export function isFk14KnownNutritionDifference(report) {
    const snow = report?.differences?.[0];
    return report?.scope === 'household' && report.officialCount === 100
        && report.matched === 99 && report.different === 1 && report.missing === 1
        && report.duplicates === 0 && report.privateCount === 0 && report.sharedCount === 0
        && Array.isArray(report.differences) && report.differences.length === 1
        && snow.id === 'snow_white_mushroom'
        && snow.reason === '手機計算清單缺少這項官方食材' && snow.fields?.length === 0;
}

const readJournal = (storage, key) => {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (!['pending', 'complete', 'rolledBack'].includes(record?.status)
        || !record.before || keys.some(key =>
            record.before[key] !== null && typeof record.before[key] !== 'string'))
        throw Error('食材更新備份格式不正確；請保留手機資料。');
    return record;
};

function recoverJournal(storage, key) {
    const record = readJournal(storage, key);
    if (record?.status !== 'pending') return record?.status === 'complete';
    for (const key of keys) {
        if (record.before[key] === null) storage.removeItem(key);
        else storage.setItem(key, record.before[key]);
    }
    storage.setItem(key, JSON.stringify({ ...record, status: 'rolledBack' }));
    return false;
}

export function recoverFk14OfficialRepair(storage = localStorage) {
    // Finish legacy v6-v8 transactions before the newer shared-catalog decision.
    recoverJournal(storage, FK14_OFFICIAL_REPAIR_KEY);
    recoverJournal(storage, FK14_COCOA_RETIREMENT_KEY);
    return recoverJournal(storage, FK14_SNOW_REPAIR_KEY);
}

export async function retireFk14Cocoa({storage = localStorage, photoStore, isCurrent = () => true} = {}) {
    recoverJournal(storage, FK14_COCOA_RETIREMENT_KEY);
    const source = Object.fromEntries(keys.map(key => [key, storage.getItem(key)]));
    const cache = source[INGREDIENT_CACHE_KEY] === null ? null : JSON.parse(source[INGREDIENT_CACHE_KEY]);
    const custom = source[CUSTOM_INGREDIENT_KEY] === null ? [] : JSON.parse(source[CUSTOM_INGREDIENT_KEY]);
    if (cache) validCatalog(cache);
    if (!Array.isArray(custom) || custom.some(item => !item || !item.id))
        throw Error('私房食材格式異常，尚未停用可可粉。');
    if (![...(cache ? items(cache) : []), ...custom].some(item => isRetiredOfficialIngredient(item.id))) return null;
    const prepared = await prepareIngredientPhotoBackup(source, photoStore);
    if (!isCurrent() || keys.some(key => storage.getItem(key) !== source[key]))
        throw Error('登入或食材已變更，尚未停用可可粉。');
    const next = {...prepared.before};
    if (next[INGREDIENT_CACHE_KEY] !== null) {
        const catalog = JSON.parse(next[INGREDIENT_CACHE_KEY]);
        for (const cat of categories) if (catalog[cat]) catalog[cat] = catalog[cat].filter(item => !isRetiredOfficialIngredient(item.id));
        next[INGREDIENT_CACHE_KEY] = serializeIngredientPhotos(catalog);
    }
    if (next[CUSTOM_INGREDIENT_KEY] !== null)
        next[CUSTOM_INGREDIENT_KEY] = serializeIngredientPhotos(JSON.parse(next[CUSTOM_INGREDIENT_KEY]).filter(item => !isRetiredOfficialIngredient(item.id)));
    const previous = readJournal(storage, FK14_COCOA_RETIREMENT_KEY);
    const record = {status:'pending', before:prepared.before, original:previous?.original || previous?.before || prepared.before};
    storage.setItem(FK14_COCOA_RETIREMENT_KEY, JSON.stringify(record));
    try {
        for (const key of keys) if (next[key] !== null) storage.setItem(key, next[key]);
        storage.setItem(FK14_COCOA_RETIREMENT_KEY, JSON.stringify({...record,status:'complete'}));
    } catch (error) {
        try { recoverJournal(storage, FK14_COCOA_RETIREMENT_KEY); }
        catch { throw Object.assign(Error('停用可可粉尚待復原，請重新開啟 FK。'), {requiresReload:true}); }
        throw Error('停用可可粉儲存失敗，已還原原資料。');
    }
    return next[INGREDIENT_CACHE_KEY] === null ? null : JSON.parse(next[INGREDIENT_CACHE_KEY]);
}

// Keep the original local recipes and historical meals; retire references only in live views.
export function withoutRetiredRecipeIngredients(dish) {
    const next = {...dish};
    for (const field of ['recommendedProteins','recommendedVeggies','recommendedCarbs','recommendedSauces'])
        if (Array.isArray(dish[field])) next[field] = dish[field].filter(id => !isRetiredOfficialIngredient(id));
    if (Array.isArray(dish.defaultIngredients)) next.defaultIngredients = dish.defaultIngredients.filter(item => !isRetiredOfficialIngredient(item.id));
    if (dish.memberPortions) next.memberPortions = Object.fromEntries(Object.entries(dish.memberPortions)
        .map(([member,entries]) => [member, entries.filter(item => !isRetiredOfficialIngredient(item.id))]));
    return next;
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
    if (list.length !== 100 || new Set(list.map(i => i.id)).size !== 100 || list.some(item => isRetiredOfficialIngredient(item.id)))
        throw Error('官方食材並非已核准的 100 項，未執行修復。');
    return new Map(list.map(i => [i.id, i]));
}
function patchNutrition(current, official) {
    if ((current.brand || '') !== (official.brand || '')
        || (current.specification || '') !== (official.specification || ''))
        throw Error('雪白菇的品牌或規格不同，不能直接覆蓋營養資料。');
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
    recoverFk14OfficialRepair(storage);
    if (readJournal(storage, FK14_SNOW_REPAIR_KEY)?.status === 'complete') return null;
    const officialItems = officialById(official);
    const snow = officialItems.get('snow_white_mushroom');
    const beech = officialItems.get('beech_mushroom');
    if (!snow || !beech) throw Error('官方食材缺少指定 ID，未執行修復。');
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
                throw Error(`雪白菇與另一項私人食材同名（${item.id}），為保留品牌／庫存關聯，不能自動修復。`);
            item.name = beech.name;
        }
    }
    if ([...items(cache), ...custom].some(item => isRetiredOfficialIngredient(item.id)))
        throw Error('可可粉尚未完成停用，請重新開啟 FK 後再修復雪白菇。');
    for (const cat of categories) cache[cat] = (cache[cat] || []).map(item => item.id === snow.id ? patchNutrition(item,snow) : item);
    if (!items(cache).some(item => item.id === snow.id)) cache.veggies.push(structuredClone(snow));
    for (let index=0; index<custom.length; index++) {
        if (custom[index].id !== snow.id) continue;
        if (!sameName(custom[index].name,snow.name)) throw Error('雪白菇的名稱身分已變更，沒有覆蓋私人修改。');
        custom[index] = patchNutrition(custom[index],snow);
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
    storage.setItem(FK14_SNOW_REPAIR_KEY, JSON.stringify(record));
    try {
        if (nextCustom !== null) storage.setItem(CUSTOM_INGREDIENT_KEY, nextCustom);
        storage.setItem(INGREDIENT_CACHE_KEY, nextCache);
        storage.setItem(FK14_SNOW_REPAIR_KEY, JSON.stringify({ ...record, status:'complete' }));
    } catch (error) {
        try { recoverFk14OfficialRepair(storage); }
        catch { throw Object.assign(Error('裝置資料尚待復原；請重開 FK。'), { requiresReload:true }); }
        throw Error('儲存失敗，已還原舊食材；請確認裝置儲存空間。');
    }
    return JSON.parse(nextCache);
}
