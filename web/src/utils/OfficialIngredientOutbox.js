/** Offline-first, user-bound edits to Supabase's canonical ingredient catalog.
 * No pantry, shopping, household supplies, meals, photos or private foods here.
 * Every operation is retryable; conflicts never silently overwrite a newer row.
 */
import { canonicalNutritionItem } from '../services/OfficialIngredientCatalogService.js?v=20261108_FK14_SSOT_V1';

export const OFFICIAL_OUTBOX_KEY = 'kitchen_v2_official_catalog_pending_v1';
export const OFFICIAL_CATALOG_JOURNAL_KEY = 'kitchen_v2_official_catalog_save_journal_v1';
const INGREDIENT_KEY = 'kitchen_v2_ingredients.json';
const CUSTOM_KEY = 'kitchen_v2_custom_ingredients';

const copy = x => JSON.parse(JSON.stringify(x)); // Works with Vue reactive proxies.
const json = x => JSON.stringify(x);
const readRecord = (storage, key) => {
    const str = storage.getItem(key);
    if (str === null) return {raw:null,record:null};
    try { return {raw:str,record:JSON.parse(str)}; }
    catch { throw Error('官方食材本機同步紀錄格式損壞；請保留手機資料。'); }
};
const validOwner = value => typeof value === 'string' && value.length > 3;
export function readOfficialOutbox(storage = localStorage) {
    const {raw,record} = readRecord(storage,OFFICIAL_OUTBOX_KEY);
    if (raw === null) return {ownerUserId:null,entries:{}};
    if (!record || !validOwner(record.ownerUserId) || !record.entries
        || Array.isArray(record.entries) || typeof record.entries !== 'object') {
        throw Error('官方食材待同步紀錄格式損壞；不會覆寫或清除。');
    }
    for (const [id,e] of Object.entries(record.entries)) {
        if (!e || e.item?.id !== id || e.baseItem?.id !== id
            || !Number.isSafeInteger(e.revision) || e.revision < 1) {
            throw Error('官方食材待同步版本不完整；原紀錄保留。');
        }
    }
    return record;
}
export function stageOfficialEdit(storage, {ownerUserId,baseRevision,baseItem,editedItem}) {
    if (!validOwner(ownerUserId) || !Number.isSafeInteger(baseRevision) || baseRevision < 1)
        throw Error('缺少已核對的登入身分或雲端食材版本，尚未儲存。');
    const before = storage.getItem(OFFICIAL_OUTBOX_KEY);
    const existing = readOfficialOutbox(storage);
    if (existing.ownerUserId && existing.ownerUserId !== ownerUserId)
        throw Error('這台裝置有其他登入者的未同步食材，不能混用帳號。');
    const old = existing.entries[editedItem.id];
    if (old && old.revision !== baseRevision) throw Error('食材另有尚未解決的版本衝突，無法覆寫待同步紀錄。');
    const canonical = canonicalNutritionItem(baseItem,editedItem);
    const queue = {
        ownerUserId,
        entries: {...existing.entries, [canonical.id]: {
            revision:baseRevision, baseItem:copy(baseItem), item:canonical, status:'pending'
        }}
    };
    // No write here: catalog cache and outbox must be committed in one journal.
    return {before,entry:queue.entries[canonical.id],queue,bytes:json(queue)};
}
export function restoreOfficialOutbox(storage, original) {
    if (original === null) storage.removeItem(OFFICIAL_OUTBOX_KEY);
    else storage.setItem(OFFICIAL_OUTBOX_KEY,original);
}
export function pendingForOwner(storage, ownerUserId) {
    const q=readOfficialOutbox(storage);
    if (q.ownerUserId && q.ownerUserId !== ownerUserId) throw Error('待同步食材屬於不同登入者，原資料保留。');
    return q.entries;
}

/** Crash-safe dual-write of edited catalog cache plus pending synchronization intent.
 * The journal itself remains a full recovery snapshot, not a rolling backup.
 */
export function recoverOfficialCatalogEdit(storage = localStorage) {
    const {record} = readRecord(storage,OFFICIAL_CATALOG_JOURNAL_KEY);
    if (!record) return false;
    if (!['pending','complete','rolledBack'].includes(record.status)
        || !record.before || ![INGREDIENT_KEY,CUSTOM_KEY,OFFICIAL_OUTBOX_KEY].every(
            key => record.before[key] === null || typeof record.before[key] === 'string')) {
        throw Error('官方食材編輯備份格式異常；未修改手機資料。');
    }
    if (record.status !== 'pending') return record.status === 'complete';
    for (const key of [INGREDIENT_KEY,CUSTOM_KEY,OFFICIAL_OUTBOX_KEY]) {
        if (record.before[key] === null) storage.removeItem(key);
        else storage.setItem(key,record.before[key]);
    }
    storage.setItem(OFFICIAL_CATALOG_JOURNAL_KEY,json({...record,status:'rolledBack'}));
    return false;
}

export function persistOfficialCatalogEdit(storage, {newCatalogBytes,newCustomBytes,newQueue}) {
    recoverOfficialCatalogEdit(storage);
    const keys=[INGREDIENT_KEY,CUSTOM_KEY,OFFICIAL_OUTBOX_KEY];
    const before=Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]));
    if (typeof newCatalogBytes !== 'string' || typeof newQueue !== 'string'
        || (newCustomBytes !== null && typeof newCustomBytes !== 'string'))
        throw Error('本機食材待儲存資料格式不正確。');
    const record={status:'pending',before};
    storage.setItem(OFFICIAL_CATALOG_JOURNAL_KEY,json(record));
    try {
        storage.setItem(INGREDIENT_KEY,newCatalogBytes);
        if (newCustomBytes !== null) storage.setItem(CUSTOM_KEY,newCustomBytes);
        storage.setItem(OFFICIAL_OUTBOX_KEY,newQueue);
        storage.setItem(OFFICIAL_CATALOG_JOURNAL_KEY,json({...record,status:'complete'}));
    } catch (e) {
        try { recoverOfficialCatalogEdit(storage); }
        catch { throw Object.assign(Error('儲存中斷且尚待還原，請重新開啟 FK，勿清除資料。'),{requiresReload:true}); }
        throw Error('手機容量或儲存失敗，已還原食材與待同步狀態。');
    }
    return true;
}

export function clearPublishedEntry(storage, ownerUserId, ingredientId, expectedEntry, published) {
    const {raw}=readRecord(storage,OFFICIAL_OUTBOX_KEY);
    const q=pendingForOwner(storage,ownerUserId);
    const actual=q[ingredientId];
    if (!actual) return 'already-cleared';
    if (json(actual)!==json(expectedEntry)) {
        // User edited the same food during a live request. Never drop that edit:
        // it can be retried against the newly confirmed revision.
        if (!published || published.ingredient_id !== ingredientId) return 'changed';
        if (actual.revision!==expectedEntry.revision || json(actual.baseItem)!==json(expectedEntry.baseItem))
            return 'changed';
        const updated={...actual,revision:Number(published.revision),baseItem:copy(published.ingredient)};
        const next={ownerUserId,entries:{...q,[ingredientId]:updated}};
        if (storage.getItem(OFFICIAL_OUTBOX_KEY)!==raw) throw Error('其他分頁修改了待同步紀錄；請刷新。');
        storage.setItem(OFFICIAL_OUTBOX_KEY,json(next));
        return 'rebase';
    }
    const next={...q};delete next[ingredientId];
    if (storage.getItem(OFFICIAL_OUTBOX_KEY)!==raw) throw Error('其他分頁正在修改待同步紀錄，請刷新。');
    storage.setItem(OFFICIAL_OUTBOX_KEY,json({ownerUserId,entries:next}));
    return 'cleared';
}
