import { validateRecipe, verifySharedRecipes } from '../services/SharedRecipeService.js?v=20261108_FK14_RECIPE_SYNC_V1';

export const RECIPE_CACHE_KEY = 'kitchen_v2_dishes.json';
export const RECIPE_PENDING_KEY = 'kitchen_v2_shared_recipe_pending_v1';
export const RECIPE_JOURNAL_KEY = 'kitchen_v2_shared_recipe_journal_v1';
export const RECIPE_SNAPSHOT_KEY = 'kitchen_v2_shared_recipe_snapshot_v1';
export const RECIPE_PRE_CUTOVER_BACKUP_KEY = 'kitchen_v2_shared_recipe_precutover_backup_v1';

const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => JSON.stringify(value);
const same = (a,b) => bytes(a) === bytes(b);
const version = value => Number.isSafeInteger(value) && value >= 0;
const validOwner = owner => typeof owner === 'string' && owner.length > 3;

export function readRecipeQueue(storage = localStorage) {
    const raw = storage.getItem(RECIPE_PENDING_KEY);
    if (raw === null) return {owner:null,edits:{}};
    let value;
    try { value=JSON.parse(raw); } catch { throw Error('料理待同步紀錄損壞，請保留手機資料。'); }
    if (!value || !validOwner(value.owner) || !value.edits
        || typeof value.edits !== 'object' || Array.isArray(value.edits))
        throw Error('料理待同步紀錄不完整，不能上傳。');
    for (const [id,row] of Object.entries(value.edits)) {
        if (!row || id !== row.recipe?.id || !version(row.revision))
            throw Error('料理待同步版本或 ID 錯誤，不能上傳。');
        validateRecipe(row.recipe);
    }
    return value;
}

export function queueRecipeEdits(storage, {owner,changes,revisionById}) {
    if (!validOwner(owner) || !Array.isArray(changes) || !(revisionById instanceof Map))
        throw Error('缺少登入身分或料理版本，不會建立待同步工作。');
    const queue=readRecipeQueue(storage);
    if (queue.owner && queue.owner !== owner)
        throw Error('此裝置仍有另一登入者的料理待同步，不能混用帳號。');
    const edits={...queue.edits};
    for (const raw of changes) {
        const recipe=validateRecipe(raw);
        const old=edits[recipe.id];
        const rev=old ? old.revision : revisionById.get(recipe.id) ?? 0;
        if (!version(rev)) throw Error('料理版本不正確，不能覆寫。');
        edits[recipe.id]={recipe,revision:rev};
    }
    return {owner,edits};
}

/** Snapshot of cloud history is tied to the login that actually verified it. */
export function readRecipeSnapshot(storage, owner) {
    if (!validOwner(owner)) return null;
    try {
        const raw=storage.getItem(RECIPE_SNAPSHOT_KEY);
        if (!raw) return null;
        const data=JSON.parse(raw);
        if (data?.owner!==owner) return null;
        verifySharedRecipes(data.rows);
        return data;
    } catch { return null; }
}

export function writeRecipeSnapshot(storage, owner, rows) {
    if (!validOwner(owner)) throw Error('未確認料理雲端快取擁有者。');
    verifySharedRecipes(rows);
    storage.setItem(RECIPE_SNAPSHOT_KEY,bytes({owner,rows:clone(rows)}));
}

/** Atomic pair: recipe cache + durable outbox. If app crashes mid-save,
 * restore both from journal; never declare cloud sync successful here.
 */
export function recoverRecipeJournal(storage = localStorage) {
    const raw=storage.getItem(RECIPE_JOURNAL_KEY);
    if (raw===null) return false;
    let journal;
    try { journal=JSON.parse(raw); } catch { throw Error('料理編輯備份損壞，未動原資料。'); }
    if (!journal || !['pending','complete','rolledBack'].includes(journal.status)
        || !journal.before || [RECIPE_CACHE_KEY,RECIPE_PENDING_KEY].some(k =>
            journal.before[k]!==null && typeof journal.before[k]!=='string')) {
        throw Error('料理備份格式異常，沒有更動快取。');
    }
    if (journal.status!=='pending') return journal.status==='complete';
    for (const k of [RECIPE_CACHE_KEY,RECIPE_PENDING_KEY]) {
        if (journal.before[k]===null) storage.removeItem(k);
        else storage.setItem(k,journal.before[k]);
    }
    storage.setItem(RECIPE_JOURNAL_KEY,bytes({...journal,status:'rolledBack'}));
    return false;
}

export function commitRecipeEdit(storage, recipes, queue) {
    recoverRecipeJournal(storage);
    if (!Array.isArray(recipes) || !queue || !validOwner(queue.owner))
        throw Error('料理或待同步紀錄無效，原資料保留。');
    const ids=new Set();
    const list=recipes.map(recipe => {
        const item=validateRecipe(recipe);
        if (ids.has(item.id)) throw Error('料理 ID 重複，不會覆寫原本資料。');
        ids.add(item.id);
        return item;
    });
    const prior={
        [RECIPE_CACHE_KEY]:storage.getItem(RECIPE_CACHE_KEY),
        [RECIPE_PENDING_KEY]:storage.getItem(RECIPE_PENDING_KEY)
    };
    storage.setItem(RECIPE_JOURNAL_KEY,bytes({status:'pending',before:prior}));
    try {
        storage.setItem(RECIPE_CACHE_KEY,bytes({dishes:list}));
        storage.setItem(RECIPE_PENDING_KEY,bytes(queue));
        storage.setItem(RECIPE_JOURNAL_KEY,bytes({status:'complete',before:prior}));
    } catch {
        try { recoverRecipeJournal(storage); }
        catch { throw Error('料理寫入中斷，保留備份；請先重新開啟 FK。'); }
        throw Error('手機空間不足或無法儲存，已還原料理與待同步紀錄。');
    }
    return list;
}

/** Cloud is the authority unless the device has unsubmitted edits.
 * A first-time legacy local recipe that differs from static GitHub seeds
 * stays on the device, and needs one explicit approval before sharing.
 */
export function reconcileRecipes({base,local,cloudRows,previousRows=[],queue={owner:null,edits:{}}}) {
    if (!Array.isArray(base)||!Array.isArray(local)) throw Error('料理清單不完整，原資料保留。');
    verifySharedRecipes(cloudRows);
    verifySharedRecipes(previousRows);
    const unique = values => {
        const map=new Map();
        for (const item of values) {
            const clean=validateRecipe(item);
            if (map.has(clean.id)) throw Error('料理 ID 重複，沒有覆寫。');
            map.set(clean.id,clean);
        }
        return map;
    };
    const baseline=unique(base), localMap=unique(local);
    const oldRows=new Map(previousRows.map(row=>[row.recipe_id,row]));
    const remote=new Map(cloudRows.map(row=>[row.recipe_id,row]));
    const output=new Map(localMap);
    const legacy=[],conflicts=[];
    for (const [id,row] of remote) {
        const old=localMap.get(id);
        const prev=oldRows.get(id)?.recipe;
        const baseRecipe=baseline.get(id);
        const pending=queue.edits[id];
        if (pending) {
            if (row.revision!==pending.revision && !same(pending.recipe,row.recipe))
                conflicts.push(id);
            output.set(id,clone(pending.recipe));
        } else if (!old || same(old,row.recipe) || (prev && same(old,prev))
            || (baseRecipe && same(old,baseRecipe))) {
            output.set(id,clone(row.recipe));
        } else if (baseRecipe && row.revision===1 && same(row.recipe,baseRecipe)) {
            // The cloud holds untouched official bootstrap while the phone has
            // a prior local edit. Do not lose it, and never auto-publish it.
            legacy.push(id);
        } else {
            conflicts.push(id); // Different live cloud edit: never silently discard.
        }
    }
    for (const [id,old] of localMap) {
        if (queue.edits[id] || conflicts.includes(id)) continue;
        const row=remote.get(id);
        const prev=oldRows.get(id)?.recipe;
        const baseRecipe=baseline.get(id);
        if (!row && (!baseRecipe || !same(old,baseRecipe))
            && (!prev || !same(old,prev))) legacy.push(id);
    }
    const recipes=[...output.values()];
    return {recipes,legacyIds:legacy,conflictIds:conflicts,cloudById:remote};
}

/** A network request can succeed while the app gets no acknowledgement.
 * If newer cloud is byte-identical to pending recipe, accept as delivered.
 */
export function reconcileRecipeAcknowledgements(storage,owner,rows) {
    const queue=readRecipeQueue(storage);
    if (queue.owner && queue.owner!==owner)
        throw Error('待同步料理屬於另一位登入者，原紀錄保留。');
    const remote=new Map(verifySharedRecipes(rows).map(row=>[row.recipe_id,row]));
    const edits={...queue.edits};
    let count=0;
    for (const [id,old] of Object.entries(edits)) {
        const r=remote.get(id);
        if (r && r.revision>old.revision && same(r.recipe,old.recipe)) {
            delete edits[id];count++;
        }
    }
    if (count) storage.setItem(RECIPE_PENDING_KEY,bytes({owner,edits}));
    return count;
}

export function acknowledgeRecipeEdit(storage,owner,id,expected,saved) {
    const queue=readRecipeQueue(storage);
    if (queue.owner!==owner) throw Error('登入者已更換，不能移除待同步紀錄。');
    const row=queue.edits[id];
    if (!row) return 'gone';
    if (same(row,expected)) {
        const edits={...queue.edits};delete edits[id];
        storage.setItem(RECIPE_PENDING_KEY,bytes({owner,edits}));
        return 'confirmed';
    }
    // Another edit happened while PATCH was in-flight. Retain it and rebase
    // only after the server acknowledged the precise prior recipe.
    if (row.revision===expected.revision && saved?.recipe_id===id
        && saved.revision===expected.revision+1) {
        storage.setItem(RECIPE_PENDING_KEY,bytes({
            owner,edits:{...queue.edits,[id]:{...row,revision:saved.revision}}
        }));
        return 'rebase';
    }
    return 'changed';
}
