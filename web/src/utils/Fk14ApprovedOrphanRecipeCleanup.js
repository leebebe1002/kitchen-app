/**
 * One-time, explicitly authorized FK #14 repair for two orphan references.
 * Only the two designated recipe IDs may have their ingredient *references*
 * removed. The source food objects, other recipes and Personal Kitchen State
 * are not touched. This is NOT a general recipe-deletion API.
 */
import {validateRecipe} from '../services/SharedRecipeService.js?v=20261108_FK14_RECIPE_SYNC_V1';
import {
    RECIPE_CACHE_KEY, RECIPE_PENDING_KEY, sameRecipe
} from './SharedRecipeState.js?v=20261108_FK14_RECIPE_SYNC_V1';

export const FK14_APPROVED_ORPHANS = Object.freeze({
    brunch_set: 'ing_1788320234913',
    pasta_meal: 'ing_1788924301621'
});
export const FK14_APPROVED_RECIPE_BACKUP_PREFIX =
    'kitchen_v2_fk14_approved_orphan_recipe_backup_v1_';

const ingredientLists = [
    'recommendedProteins','recommendedVeggies','recommendedCarbs',
    'recommendedSauces','defaultIngredients'
];
const isReference = (item,id) =>
    (typeof item==='string' ? item : item?.id)===id;
const clone = data => JSON.parse(JSON.stringify(data));

export function removeOnlyApprovedOrphanReferences(recipes) {
    if(!Array.isArray(recipes)) throw Error('原本料理清單無效，不能修復。');
    const changed=[];
    const result=recipes.map(recipe=>{
        const id=recipe?.id,orphan=FK14_APPROVED_ORPHANS[id];
        if(!orphan) return recipe;
        const draft=clone(recipe),locations=[];
        for(const field of ingredientLists) {
            if(draft[field]===undefined) continue;
            if(!Array.isArray(draft[field]))
                throw Error('料理 '+id+' 的'+field+'格式不正確，原資料保留。');
            const before=draft[field].length;
            draft[field]=draft[field].filter(item=>!isReference(item,orphan));
            if(draft[field].length!==before)
                locations.push({field,removed:before-draft[field].length});
        }
        if(draft.memberPortions!==undefined) {
            if(!draft.memberPortions || typeof draft.memberPortions!=='object'
                || Array.isArray(draft.memberPortions))
                throw Error('料理 '+id+' 的成員份量格式不正確，原資料保留。');
            for(const [member,portions] of Object.entries(draft.memberPortions)) {
                if(!Array.isArray(portions))
                    throw Error('料理 '+id+' 的成員份量格式不正確，原資料保留。');
                const cleaned=portions.filter(item=>!isReference(item,orphan));
                if(cleaned.length!==portions.length){
                    draft.memberPortions[member]=cleaned;
                    locations.push({field:'memberPortions.'+member,
                        removed:portions.length-cleaned.length});
                }
            }
        }
        if(!locations.length) return recipe;
        validateRecipe(draft);
        changed.push({id,ingredientId:orphan,locations,
            original:clone(recipe),cleaned:clone(draft)});
        return draft;
    });
    const ids=new Set(result.map(x=>x?.id));
    if(ids.size!==result.length)throw Error('料理 ID 重複，不會執行修復。');
    return {recipes:result,changed};
}

/** Immutable copy of original cache, pending journal and BOTH original dishes.
 * Only created after a current Bebe identity and rev-1 Supabase authority have
 * already been verified. Existing backups are NEVER overwritten.
 */
export function backupApprovedOrphanRecipeReferences(
    storage,owner,changed,{beforeCache, beforeQueue}={}
) {
    if(typeof owner!=='string' || !/^[0-9a-f-]{20,}$/i.test(owner))
        throw Error('使用者帳號識別未確認，無法備份。');
    if(!Array.isArray(changed) || !changed.length)
        throw Error('沒有已核實的目標料理，原資料保留。');
    const key=FK14_APPROVED_RECIPE_BACKUP_PREFIX+owner;
    const previous=storage.getItem(key);
    if(previous!==null){
        let parsed;
        try {parsed=JSON.parse(previous);}
        catch{throw Error('舊料理備份無法驗證，修復暫停。');}
        if(parsed?.version!==1 || parsed.owner!==owner
            || !Array.isArray(parsed.originals)
            || parsed.originals.some(row=>!FK14_APPROVED_ORPHANS[row.id]
                || row.ingredientId!==FK14_APPROVED_ORPHANS[row.id]))
            throw Error('舊料理備份異常，修復暫停。');
        for(const edit of changed) {
            const saved=parsed.originals.find(row=>row.id===edit.id);
            // An immutable backup must cover this exact source version.
            // Never erase a later changed draft by leaning on a backup of a
            // different recipe or an earlier modification.
            if(!saved || !sameRecipe(saved.original,edit.original))
                throw Error('料理在首次備份後有新的修改，不能沿用舊備份刪除引用。');
        }
        return key;
    }
    const originalCache=beforeCache??storage.getItem(RECIPE_CACHE_KEY);
    const originalQueue=beforeQueue??storage.getItem(RECIPE_PENDING_KEY);
    if([originalCache,originalQueue].some(value=>
        typeof value==='string' && /data:(?:image|application)\//i.test(value)))
        throw Error('舊料理中仍有未上傳照片，暫不複製備份或改寫資料。');
    const record={
        version:1,owner,backedUpAt:new Date().toISOString(),
        originalCache,originalQueue,
        originals:changed.map(({id,ingredientId,original,locations})=>({
            id,ingredientId,original,locations
        }))
    };
    // Validate before serializing: do not introduce unstored Base64 photos.
    for(const row of record.originals)validateRecipe(row.original);
    storage.setItem(key,JSON.stringify(record));
    if(storage.getItem(key)===null)
        throw Error('料理原始資料未成功備份，不會移除引用。');
    return key;
}
