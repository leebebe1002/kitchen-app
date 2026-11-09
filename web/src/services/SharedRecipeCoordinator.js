/**
 * Local-first sync of FAMILY-SHARED recipe modifications. This never writes
 * Pantry/Shopping, private ingredients, nutrition catalog, or meal logs.
 */
import sharedRecipeService, { validateRecipe } from './SharedRecipeService.js?v=20261108_FK14_RECIPE_SYNC_V1';
import {
    RECIPE_CACHE_KEY, RECIPE_PRE_CUTOVER_BACKUP_KEY, readRecipeQueue,
    readRecipeSnapshot, writeRecipeSnapshot, queueRecipeEdits, commitRecipeEdit,
    reconcileRecipes, reconcileRecipeAcknowledgements, acknowledgeRecipeEdit, sameRecipe
} from '../utils/SharedRecipeState.js?v=20261108_FK14_RECIPE_SYNC_V1';

const clone = x => JSON.parse(JSON.stringify(x));
const equal = sameRecipe;

export function unresolvedRecipeIngredientIds(engine,recipe) {
    // #14 deliberately does not yet synchronize private ingredients. Sharing a
    // recipe that uses one would silently break its reference on Ariel's phone.
    const known=engine.officialCatalogRows?.size
        ? engine.officialCatalogRows : engine.officialIngredientById;
    if (!(known instanceof Map) || !known.size) return ['官方食材尚未載入'];
    const ids=new Set();
    for (const field of ['recommendedProteins','recommendedVeggies',
        'recommendedCarbs','recommendedSauces','defaultIngredients']) {
        for (const item of recipe[field] || []) {
            const id=typeof item==='string' ? item : item?.id;
            if (typeof id==='string' && id) ids.add(id);
        }
    }
    for (const rows of Object.values(recipe.memberPortions || {})) {
        if (Array.isArray(rows)) for (const item of rows) {
            if (typeof item?.id==='string' && item.id) ids.add(item.id);
        }
    }
    return [...ids].filter(id=>!known.has(id)
        && !engine.sharedCustomCatalogRows?.has(id));
}

function sessionUserId(auth) {
    try {
        const jwt=auth.readSession?.()?.access_token;
        if (!jwt || typeof atob!=='function') return null;
        const claims=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if (!claims.sub || Number(claims.exp)*1000 <= Date.now()) return null;
        return claims.sub;
    } catch { return null; }
}

export class SharedRecipeCoordinator {
    constructor(engine, {service=sharedRecipeService,storage=localStorage}={}) {
        this.engine=engine;
        this.service=service;
        this.storage=storage;
        this.active=false;
        this.offline=false;
        this.busy=false;
        this.owner=null;
        this.rows=new Map();
        this.legacyIds=[];
        this.conflictIds=[];
        this.message='';
        this.loadPromise=null;
        this.retryLegacyAfterBusy=false;
    }

    reset() {
        this.active=false;
        this.offline=false;
        this.busy=false;
        this.owner=null;
        this.rows.clear();
        this.legacyIds=[];
        this.conflictIds=[];
        this.message='';
        this.loadPromise=null;
        this.retryLegacyAfterBusy=false;
    }

    isCurrent(context,generation,owner) {
        const e=this.engine;
        if (e.personalScopeGeneration!==generation) return false;
        return context ? (e.personalContext===context && e.hasPersonalAccess())
            : (!e.hasPersonalAccess() && sessionUserId(e.auth)===owner);
    }

    async load() {
        if(this.loadPromise)return this.loadPromise;
        const pending=this.loadInternal();
        this.loadPromise=pending;
        try{return await pending;}
        finally{if(this.loadPromise===pending)this.loadPromise=null;}
    }

    async loadInternal() {
        const e=this.engine,storage=this.storage;
        if (!Array.isArray(e.recipeStaticBaseline) || !e.recipeStaticBaseline.length) {
            this.message='歷史料理母庫尚未完整載入，保留手機料理與備份，不進行同步。';
            return false;
        }
        const context=e.personalContext,gen=e.personalScopeGeneration;
        const online=e.hasPersonalAccess();
        const owner=online ? context.userId : sessionUserId(e.auth);
        let rows,fromServer=false;
        if (online) {
            try {
                rows=await this.service.list();
                if (!this.isCurrent(context,gen,owner)) return false;
                fromServer=true;
            } catch (error) {
                this.message='共用料理尚未連線，本機資料保留：'+error.message;
            }
        }
        if (!rows) {
            const snapshot=readRecipeSnapshot(storage,owner);
            if (!snapshot) {
                this.active=false;
                if (!this.message) this.message='尚未取得全家料理雲端快取，本機資料保留。';
                return false;
            }
            rows=snapshot.rows;
        }
        try {
            const cloudIds=new Set(rows.map(row=>row.recipe_id));
            if (e.recipeStaticBaseline.some(recipe=>!cloudIds.has(recipe.id))) {
                throw Error('Supabase 內建料理尚未完整，保留手機配方，不接受空白或部分雲端覆寫。');
            }
            const queue=readRecipeQueue(storage);
            if (queue.owner && queue.owner!==owner) {
                // A device may switch Bebe -> Ariel while Bebe has unpublished
                // drafts. Show only authoritative shared recipes for Ariel,
                // but do NOT overwrite Bebe's original cache, queue or journal.
                const cloud=reconcileRecipes({
                    base:e.recipeStaticBaseline,
                    local:e.recipeStaticBaseline,cloudRows:rows,
                    previousRows:[],queue:{owner:null,edits:{}}
                });
                if (!this.isCurrent(context,gen,owner)) return false;
                e.data.rawDishes={...e.data.rawDishes,dishes:cloud.recipes};
                e.data.dishes=e.data.rawDishes.dishes;
                this.active=false;
                this.owner=null;
                this.message='其他登入者仍有未同步的本機料理；這裡只顯示雲端配方，不會讀取、覆寫或上傳對方草稿。';
                return false;
            }
            const previous=readRecipeSnapshot(storage,owner)?.rows || [];
            const local=e.data.rawDishes?.dishes || [];
            const merged=reconcileRecipes({
                base:e.recipeStaticBaseline || [],
                local,cloudRows:rows,previousRows:previous,queue
            });
            if (!this.isCurrent(context,gen,owner)) return false;
            const old=storage.getItem(RECIPE_CACHE_KEY);
            if (old!==null && storage.getItem(RECIPE_PRE_CUTOVER_BACKUP_KEY)===null)
                storage.setItem(RECIPE_PRE_CUTOVER_BACKUP_KEY,old);
            if (fromServer) {
                writeRecipeSnapshot(storage,owner,rows);
                reconcileRecipeAcknowledgements(storage,owner,rows);
            }
            storage.setItem(RECIPE_CACHE_KEY,JSON.stringify({
                ...e.data.rawDishes,dishes:merged.recipes
            }));
            if (!this.isCurrent(context,gen,owner)) return false;
            e.data.rawDishes={...e.data.rawDishes,dishes:merged.recipes};
            e.data.dishes=e.data.rawDishes.dishes;
            this.rows=new Map(rows.map(row=>[row.recipe_id,row]));
            this.active=true;
            this.offline=!fromServer;
            this.owner=owner;
            this.legacyIds=merged.legacyIds;
            this.conflictIds=merged.conflictIds;
            const pending=Object.keys(readRecipeQueue(storage).edits).length;
            this.message=merged.conflictIds.length
                ? '有 '+merged.conflictIds.length+' 項料理版本衝突，本機修改未覆寫雲端。'
                : merged.legacyIds.length
                  ? '已讀取全家料理；手機有 '+merged.legacyIds.length+' 項舊料理修改，請確認是否共享。'
                  : fromServer
                    ? 'Supabase 全家料理已載入；'+pending+' 項待同步。'
                    : '離線使用已驗證的雲端料理快取；'+pending+' 項待同步。';
            if (fromServer && !merged.conflictIds.length && pending)
                this.sync().catch(error=>console.warn('Recipe sync:',error.message));
            // FK #14 product rule: verified, unconflicted historic phone edits
            // must be backed by Supabase automatically, NOT parked forever on
            // one phone. Only allow a new recipe or unchanged rev-1 seed; never
            // replace another device's published modification.
            if (fromServer && merged.legacyIds.length) {
                const safeIds=merged.legacyIds.filter(id=>{
                    const recipe=merged.recipes.find(item=>item.id===id);
                    const row=this.rows.get(id);
                    const baseline=e.recipeStaticBaseline.find(item=>item.id===id);
                    if(!recipe || unresolvedRecipeIngredientIds(e,recipe).length) return false;
                    return !row || (row.revision===1 && baseline
                        && sameRecipe(row.recipe,baseline));
                });
                if(safeIds.length && this.busy) {
                    // Another batch may still be publishing the first safe
                    // seven dishes. Re-check after it finishes, not forever
                    // leave the remaining resolved recipes as phone-only.
                    this.retryLegacyAfterBusy=true;
                } else if(safeIds.length) {
                    try {
                        await this.approveLegacy(safeIds);
                        this.message=safeIds.length+' 項已確認版本安全的舊料理自動排入同步；'
                            +this.legacyIds.length+' 項仍待補食材或解決衝突。';
                    }catch(error){
                        this.message='舊料理尚未自動完成上雲，原本資料保留：'+error.message;
                    }
                }
            }
            return true;
        } catch (error) {
            this.active=false;
            this.message='料理雲端載入未完成，手機資料保留：'+error.message;
            return false;
        }
    }

    /**
     * Read-only device-local preview. A count alone is not informed consent:
     * list exactly what would be shared, show differences against the cloud
     * and identify unresolved private ingredient references by name.
     */
    reviewLegacy() {
        if (!this.active || !this.owner || !this.engine.hasPersonalAccess()
            || this.engine.personalContext?.userId !== this.owner) return [];
        const local=new Map((this.engine.data.rawDishes?.dishes || [])
            .filter(recipe=>recipe && typeof recipe.id==='string')
            .map(recipe=>[recipe.id,recipe]));
        const labels={
            name:'料理名稱',categories:'料理類別',recommendedProteins:'蛋白質選項',
            recommendedVeggies:'蔬菜選項',recommendedCarbs:'主食選項',
            recommendedSauces:'醬料選項',defaultIngredients:'預設食材',
            memberPortions:'成員份量',sopSteps:'料理步驟'
        };
        const labelItem=item=>{
            if (typeof item==='string') return item;
            if (!item || typeof item!=='object') return String(item);
            const title=item.name || item.id || item.ingredientId || JSON.stringify(item);
            const amount=item.amount ?? item.grams ?? item.weight ?? item.quantity;
            return amount===undefined ? String(title)
                : title+' '+amount+(item.unit || item.unitLabel || 'g');
        };
        const preview=value=>{
            if (value===undefined) return '未設定';
            let summary;
            if (Array.isArray(value))
                summary=value.length ? value.map(labelItem).join('、') : '空清單';
            else if (value && typeof value==='object')
                summary=Object.entries(value).map(([key,item])=>key+'：'+
                    (Array.isArray(item)?item.map(labelItem).join('、'):labelItem(item))).join('；');
            else summary=String(value);
            return summary.length>260 ? summary.slice(0,260)+'…（僅顯示摘要）' : summary;
        };
        return this.legacyIds.map(id=>{
            const recipe=local.get(id);
            if (!recipe) return {id,name:id,blockedIds:['料理已不在手機'],blockedNames:['料理已不在手機'],diffs:[]};
            const cloud=this.rows.get(id)?.recipe || this.engine.recipeStaticBaseline.find(x=>x.id===id) || {};
            const fields=[...new Set([...Object.keys(cloud),...Object.keys(recipe)])]
                .filter(field=>!sameRecipe(cloud[field],recipe[field]));
            const blockedIds=unresolvedRecipeIngredientIds(this.engine,recipe);
            const usageLabels={
                recommendedProteins:'蛋白質選項',recommendedVeggies:'蔬菜選項',
                recommendedCarbs:'主食選項',recommendedSauces:'醬料選項',
                defaultIngredients:'預設食材'
            };
            const blockedContexts=blockedIds.map(ingredientId=>{
                const fields=[];
                for(const [key,label] of Object.entries(usageLabels)){
                    if((recipe[key]||[]).some(item=>
                        (typeof item==='string'?item:item?.id)===ingredientId))
                        fields.push(label);
                }
                for(const [member,portions] of Object.entries(recipe.memberPortions||{})){
                    if(Array.isArray(portions) && portions.some(item=>item?.id===ingredientId))
                        fields.push('成員份量（'+member+'）');
                }
                return {id:ingredientId,fields};
            });
            const blockedNames=blockedIds.map(ingredientId=>{
                const food=this.engine.getIngredientById?.(ingredientId);
                return food?.name ? food.name+'（'+ingredientId+'）':ingredientId;
            });
            return {id,name:recipe.name,blockedIds,blockedNames,blockedContexts,
                diffs:fields.map(field=>({
                    name:labels[field] || field,
                    before:preview(cloud[field]),
                    after:preview(recipe[field])
                }))};
        });
    }

    async sync() {
        const e=this.engine,s=this.storage;
        if (!this.active || this.offline || this.busy || !e.hasPersonalAccess()
            || this.owner!==e.personalContext.userId) return false;
        const context=e.personalContext,generation=e.personalScopeGeneration;
        this.busy=true;
        const deferred=[];
        try {
            for (const [id,pending] of Object.entries(readRecipeQueue(s).edits)) {
                if (!this.isCurrent(context,generation,this.owner)) return false;
                const unknown=unresolvedRecipeIngredientIds(e,pending.recipe);
                if (unknown.length) {
                    this.message='料理已儲存在手機，但含有尚未共用的食材 ID：'
                        +unknown.join('、')+'。先保留待同步，不能讓家人收到無法計算的配方。';
                    deferred.push(id);
                    continue; // A private-food recipe must not starve unrelated pending recipes.
                }
                const existing=this.rows.get(id);
                if ((existing?.revision || 0)!==pending.revision) {
                    deferred.push(id);
                    continue; // One conflict must not block other independent recipe IDs.
                }
                try {
                    const row=await this.service.publish(pending.recipe,pending.revision);
                    const updated=[...this.rows.values()].filter(r=>r.recipe_id!==id);
                    updated.push(row);
                    writeRecipeSnapshot(s,this.owner,updated);
                    const action=acknowledgeRecipeEdit(s,this.owner,id,pending,row);
                    this.rows.set(id,row);
                    if (action!=='confirmed') {
                        deferred.push(id);
                        continue;
                    }
                } catch (error) {
                    deferred.push(id);
                    console.warn('Recipe pending for retry:',id,error.message);
                    continue;
                }
            }
            const pending=Object.keys(readRecipeQueue(s).edits).length;
            const legacy=this.legacyIds.length,conflicts=this.conflictIds.length;
            const remaining=[
                pending ? pending+' 項料理仍待同步' : '',
                legacy ? legacy+' 項舊料理差異待補食材或核對' : '',
                conflicts ? conflicts+' 項料理有不同雲端版本' : ''
            ].filter(Boolean);
            this.message=remaining.length
                ? '料理尚未全部同步：'+remaining.join('、')
                    +'；可能含尚未共用的食材、版本衝突或網路失敗，手機原資料保留。'
                : '全家料理已同步 Supabase。';
            return !deferred.length && !remaining.length;
        } finally {
            this.busy=false;
            if(this.retryLegacyAfterBusy) {
                this.retryLegacyAfterBusy=false;
                Promise.resolve(this.loadPromise).then(()=>this.load())
                    .catch(error=>console.warn('Recipe legacy retry deferred:',error.message));
            }
        }
    }

    async approveLegacy(selectedIds) {
        const e=this.engine,s=this.storage;
        if (!this.active || this.offline || !e.hasPersonalAccess()
            || e.personalContext.userId!==this.owner)
            throw Error('請先連網確認登入者與全家料理。');
        if (this.busy)
            throw Error('料理仍在同步，請完成後再選擇要分享的項目。');
        if (!Array.isArray(selectedIds) || !selectedIds.length
            || new Set(selectedIds).size!==selectedIds.length
            || selectedIds.some(id=>!this.legacyIds.includes(id)))
            throw Error('請先從待確認清單選擇要分享的料理，原本資料不會自動上傳。');
        const ids=new Set(selectedIds);
        if (selectedIds.some(id=>this.conflictIds.includes(id)))
            throw Error('選擇的料理已有另一台手機版本，請先解決衝突。');
        const recipes=e.data.rawDishes?.dishes || [];
        const edits=recipes.filter(recipe=>ids.has(recipe.id)).map(validateRecipe);
        if (edits.length!==ids.size) throw Error('手機料理在確認過程中已改變，請重新載入。');
        const unresolved=[...new Set(edits.flatMap(recipe=>
            unresolvedRecipeIngredientIds(e,recipe)))];
        if (unresolved.length)
            throw Error('以下私房食材尚未跨手機同步，不能先分享引用它們的料理：'+unresolved.join('、'));
        const queue=queueRecipeEdits(s,{
            owner:this.owner,changes:edits,
            revisionById:new Map([...this.rows].map(([id,row])=>[id,row.revision]))
        });
        commitRecipeEdit(s,recipes,queue);
        this.legacyIds=this.legacyIds.filter(id=>!ids.has(id));
        this.message='已排入 '+edits.length+' 項你選擇的料理；其餘舊料理仍保留本機。';
        this.sync().catch(error=>console.warn('Legacy recipes:',error.message));
        return edits.length;
    }

    async save(dataObj) {
        const e=this.engine,s=this.storage;
        const q=readRecipeQueue(s);
        const loggedIn=e.hasPersonalAccess() ? e.personalContext.userId
            : sessionUserId(e.auth);
        if (q.owner && q.owner!==loggedIn)
            throw Error('這台裝置有其他登入者尚未同步的料理，不能覆寫其資料。');
        const entries=dataObj?.dishes;
        if (!Array.isArray(entries)) throw Error('料理清單格式錯誤，原資料保留。');
        const recipes=entries.map(validateRecipe);
        const ids=new Set();
        for (const r of recipes) {
            if (ids.has(r.id)) throw Error('料理 ID 重複，沒有儲存。');
            ids.add(r.id);
        }
        const raw=s.getItem(RECIPE_CACHE_KEY);
        let before=[];
        try {
            before=raw===null ? [] : JSON.parse(raw).dishes;
            if (!Array.isArray(before)) throw Error('bad recipe cache');
        } catch { throw Error('舊料理快取格式異常，原資料保留。'); }
        const old=new Map(before.map(r=>[r.id,r]));
        if (before.some(r=>!ids.has(r.id)))
            throw Error('此版本尚未支援雲端刪除料理，原本內容已保留。');
        const changed=recipes.filter(r=>!equal(old.get(r.id),r));
        if (!changed.length) return true;
        if (!this.active || !this.owner) {
            s.setItem(RECIPE_CACHE_KEY,JSON.stringify({...dataObj,dishes:recipes}));
            // CalculatorView holds references to the current dish and its
            // nested defaultIngredients. Never replace active reactive objects
            // in the middle of an edit; only the durable snapshot is serialized.
            if (e.data.rawDishes !== dataObj) e.data.rawDishes=dataObj;
            if (e.data.dishes !== dataObj.dishes) e.data.dishes=dataObj.dishes;
            this.message='料理已儲存在手機，尚未確認雲端權限；請連網後確認共享。';
            return true;
        }
        if (changed.some(r=>this.conflictIds.includes(r.id)))
            throw Error('料理在另一台手機有不同版本，沒有覆寫雲端。');
        const queue=queueRecipeEdits(s,{
            owner:this.owner,changes:changed,
            revisionById:new Map([...this.rows].map(([id,row])=>[id,row.revision]))
        });
        commitRecipeEdit(s,recipes,queue);
        if (e.data.rawDishes !== dataObj) e.data.rawDishes=dataObj;
        if (e.data.dishes !== dataObj.dishes) e.data.dishes=dataObj.dishes;
        this.legacyIds=this.legacyIds.filter(id=>!changed.some(r=>r.id===id));
        this.message='料理已在手機生效；等待 Supabase 同步。';
        this.sync().catch(error=>console.warn('Recipe sync:',error.message));
        return true;
    }
}

export default SharedRecipeCoordinator;
