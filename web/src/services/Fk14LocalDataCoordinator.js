import dataService, { FK14_DATASETS, sanitizeFk14Record,
    validateFk14Rows } from './Fk14LocalDataService.js?v=20261109_FK14_ALL_DATA_SYNC_V1';
import { normalizeIngredientName, findSimilarIngredients }
    from '../utils/IngredientMatcher.js?v=20260918_FIX_STATE_V2';

// All mutations remain durable on-device until an authenticated CAS ACK.
// They are NEVER written to Personal Kitchen State or the 100 official foods.
const prefix='kitchen_v2_fk14_all_data_';
const kindKeys={
    custom:{local:'kitchen_v2_custom_ingredients',label:'私房食材'},
    favorite:{local:'kitchen_v2_favorite_foods.json',label:'常用餐點'}
};
const clone=x=>JSON.parse(JSON.stringify(x));
function sessionUserId(auth) {
    try {
        const jwt=auth.readSession?.()?.access_token;
        if(!jwt || typeof atob!=='function')return null;
        const claims=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(!claims.sub || Number(claims.exp)*1000<=Date.now())return null;
        return claims.sub;
    }catch{return null;}
}
const equals=(a,b)=>{
    const stable=x=>JSON.stringify(x,(_,v)=>v && typeof v==='object'&&!Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) :v);
    return stable(a)===stable(b);
};
function parseArray(raw,kind){
    if(raw===null)return [];
    let value;
    try {value=JSON.parse(raw);}catch {throw Error(kindKeys[kind].label+'本機快取損壞，未覆寫。');}
    const list=kind==='custom'?value:value?.favorites;
    if(!Array.isArray(list))throw Error(kindKeys[kind].label+'本機格式異常，未覆寫。');
    return list;
}
function storeRecords(storage,kind,list,engine){
    if(kind==='custom') {
        // Reuse the existing Base64/Blob protection and local photo reference store.
        if(engine?.safeSetLocalStorage)engine.safeSetLocalStorage(kindKeys[kind].local,list);
        else storage.setItem(kindKeys[kind].local,JSON.stringify(list));
    }else{
        storage.setItem(kindKeys[kind].local,JSON.stringify({favorites:list}));
    }
}
export class Fk14LocalDataCoordinator {
    constructor(engine,{kind,service=dataService,storage=localStorage}={}){
        if(!FK14_DATASETS[kind])throw Error('Unknown FK dataset');
        this.engine=engine;this.service=service;this.storage=storage;this.kind=kind;
        this.rows=new Map();this.owner=null;this.ready=false;
        this.pending=0;this.message='尚未載入雲端'+kindKeys[kind].label;
        this.busy=false;this.conflicts=[];
    }
    ownerKey(owner){return prefix+this.kind+'_snapshot_'+owner;}
    queueKey(owner){return prefix+this.kind+'_pending_'+owner;}
    favoriteKey(owner){return prefix+'favorite_owner_cache_'+owner;}
    ownerMarker(){return prefix+'favorite_first_verified_owner';}
    lastVerifiedOwnerKey(){return prefix+this.kind+'_last_verified_owner';}
    backupKey(owner){return prefix+this.kind+'_precloud_backup_'+owner;}
    reset(){this.owner=null;this.ready=false;this.busy=false;this.rows.clear();this.pending=0;this.conflicts=[];this.message='尚未載入雲端'+kindKeys[this.kind].label;}
    context(){
        const e=this.engine,c=e.personalContext;
        return e.hasPersonalAccess() && c?.userId && e.auth.isCurrentContext(c) ?c:null;
    }
    still(context,generation){
        return this.context()===context && this.engine.personalScopeGeneration===generation;
    }
    getQueue(owner){
        const raw=this.storage.getItem(this.queueKey(owner));
        if(!raw)return {};
        let data;
        try{data=JSON.parse(raw);}catch {throw Error('待同步工作損壞，停止上傳。');}
        if(!data || typeof data!=='object' || Array.isArray(data))throw Error('待同步工作損壞，停止上傳。');
        for(const [id,record] of Object.entries(data)){
            if(record?.item?.id!==id || !Number.isSafeInteger(record.revision)
                || record.revision<0 || typeof record.deleted!=='boolean')
                throw Error('待同步版本異常，停止上傳。');
        }
        return data;
    }
    putQueue(owner,queue){
        this.storage.setItem(this.queueKey(owner),JSON.stringify(queue));
        this.pending=Object.keys(queue).length;
    }
    getSnapshot(owner){
        const raw=this.storage.getItem(this.ownerKey(owner));
        if(!raw)return null;
        try{
            const value=JSON.parse(raw);
            if(value.owner!==owner || value.kind!==this.kind)throw Error('Owner mismatch');
            return validateFk14Rows(this.kind,value.rows,owner);
        }catch{return null;}
    }
    setSnapshot(owner,rows){
        validateFk14Rows(this.kind,rows,owner);
        this.storage.setItem(this.ownerKey(owner),JSON.stringify({owner,kind:this.kind,rows:clone(rows)}));
    }
    local(owner){
        if(this.kind==='favorite'){
            const bound=this.storage.getItem(this.ownerMarker());
            if(bound && bound!==owner)
                return parseArray(this.storage.getItem(this.favoriteKey(owner)) || '{"favorites":[]}',this.kind);
            const selected=this.storage.getItem(this.favoriteKey(owner));
            if(selected!==null)return parseArray(selected,this.kind);
        }
        return parseArray(this.storage.getItem(kindKeys[this.kind].local),this.kind);
    }
    publishToEngine(list){
        const e=this.engine;
        if(this.kind==='favorite'){
            e.data.favoriteFoods=list;
            e.data.rawFavoriteFoods={favorites:list};
            return;
        }
        // Always keep canonical official data first. Private IDs are separate,
        // not promoted or copied into fk_ingredient_catalog.
        const raws=e.data.rawIngredients;
        for(const cat of ['proteins','veggies','carbs','sauces']){
            raws[cat]=(raws[cat]||[]).filter(item =>!list.some(c=>c.id===item.id));
        }
        for(const item of list){
            (raws[item.category] ||= []).push(item);
        }
        e.data.rawIngredients=raws;
        e.data.ingredients=['proteins','veggies','carbs','sauces'].flatMap(cat=>raws[cat]||[]);
    }
    stage(owner,item,revision,deleted=false){
        const q=this.getQueue(owner);
        const old=q[item.id];
        const base=old?.revision??revision;
        if(!Number.isSafeInteger(base)||base<0)throw Error('待同步版本無效。');
        q[item.id]={item:clone(item),revision:base,deleted:Boolean(deleted)};
        this.putQueue(owner,q);
    }
    async load(){
        const e=this.engine,c=this.context();
        if(!c){this.ready=false;this.message='請登入後確認'+kindKeys[this.kind].label+'雲端資料';return false;}
        const gen=e.personalScopeGeneration,owner=c.userId;
        let rows;
        try {rows=await this.service.list(this.kind);}
        catch(err){this.ready=false;this.message='雲端讀取失敗，手機資料保留：'+err.message;return false;}
        if(!this.still(c,gen))return false;
        try{
            const snapshot=this.getSnapshot(owner);
            let local=this.local(owner);
            if(this.kind==='favorite' && !local.length
                && !this.storage.getItem(this.favoriteKey(owner))
                && (!this.storage.getItem(this.ownerMarker())
                    || this.storage.getItem(this.ownerMarker())===owner))
                local=e.data.rawFavoriteFoods?.favorites || [];
            const queue=this.getQueue(owner);
            // At first login, retain an exact backup. Never migrate another
            // person's favorites just because they used this phone later.
            if(this.storage.getItem(this.backupKey(owner))===null){
                const original=this.kind==='favorite'
                    ?this.storage.getItem(kindKeys[this.kind].local)
                    :this.storage.getItem(kindKeys[this.kind].local);
                this.storage.setItem(this.backupKey(owner),JSON.stringify({
                    capturedAt:Date.now(),original
                }));
            }
            const prev=new Map((snapshot||[]).map(r=>[r[FK14_DATASETS[this.kind].idKey],r]));
            const remote=new Map(rows.map(r=>[r[FK14_DATASETS[this.kind].idKey],r]));
            const localMap=new Map();
            for(const item of local){
                const clean=sanitizeFk14Record(this.kind,item);
                if(localMap.has(clean.id))throw Error('本機資料 ID 重複，保留資料等待去重。');
                localMap.set(clean.id,item);
            }
            const conflicts=[];
            const merged=new Map(localMap);
            for(const [id,row] of remote){
                const existing=localMap.get(id);
                const prevValue=prev.get(id)?.[FK14_DATASETS[this.kind].dataKey];
                const remoteValue=row[FK14_DATASETS[this.kind].dataKey];
                if(queue[id])continue;
                if(prevValue && existing
                    && equals(sanitizeFk14Record(this.kind,prevValue),
                        sanitizeFk14Record(this.kind,remoteValue))
                    && !equals(sanitizeFk14Record(this.kind,existing),
                        sanitizeFk14Record(this.kind,prevValue))) {
                    // Offline edit after a verified snapshot: remote is unchanged,
                    // so stage against the exact accepted server revision.
                    queue[id]={item:clone(existing),revision:row.revision,deleted:false};
                    continue;
                }
                if(!existing || equals(sanitizeFk14Record(this.kind,existing),sanitizeFk14Record(this.kind,remoteValue))
                    || (prevValue && equals(sanitizeFk14Record(this.kind,existing),sanitizeFk14Record(this.kind,prevValue)))){
                    if(this.kind==='favorite' && row.is_deleted)merged.delete(id);
                    else merged.set(id,remoteValue);
                }else{
                    conflicts.push(id);
                }
            }
            if(this.kind==='custom'){
                const official=new Set([...e.officialIngredientById.keys(),
                    ...(e.officialCatalogRows?.keys()||[])]);
                const officialNames=new Map([...e.officialIngredientById.values()]
                    .map(item=>[normalizeIngredientName(item.name),item.id]));
                const unique=new Map();
                for(const item of merged.values()){
                    if(official.has(item.id)){
                        conflicts.push(item.id);
                        continue;
                    }
                    const comparison=findSimilarIngredients(item.name,
                        [...e.officialIngredientById.values()],item.id);
                    if(comparison.exactMatch){
                        conflicts.push(item.id);
                        continue;
                    }
                    const name=normalizeIngredientName(item.name);
                    if(unique.has(name)&&unique.get(name)!==item.id)conflicts.push(item.id);
                    unique.set(name,item.id);
                }
                if(conflicts.some(id=>official.has(id)||officialNames.has(
                    normalizeIngredientName(merged.get(id)?.name)))){
                    // Never let a custom row with canonical identity overwrite
                    // one of the 100 trusted official food objects.
                    throw Error('私房食材與官方母庫存在同名或 ID 衝突；原資料保留，不能自動覆寫。');
                }
            }
            const activeQueue={...queue};
            for(const [id,item] of localMap){
                if(remote.has(id)||activeQueue[id]||conflicts.includes(id))continue;
                // New never-uploaded item can be safely created after verified
                // session + catalog identity; a conflict is never overwritten.
                activeQueue[id]={item:clone(item),revision:0,deleted:false};
            }
            if(this.kind==='favorite' && snapshot){
                // Explicit local removal becomes a durable tombstone. An empty
                // remote alone never erases an existing phone favorite.
                for(const [id,row] of prev)if(!localMap.has(id)&&!activeQueue[id]
                    && !row.is_deleted)activeQueue[id]={
                        item:clone(row.favorite),revision:row.revision,deleted:true
                    };
            }
            if(!this.still(c,gen))return false;
            if(this.kind==='favorite'){
                this.storage.setItem(this.ownerMarker(),
                    this.storage.getItem(this.ownerMarker())||owner);
                this.storage.setItem(this.favoriteKey(owner),JSON.stringify({favorites:[...merged.values()]}));
            }
            storeRecords(this.storage,this.kind,[...merged.values()],e);
            this.setSnapshot(owner,rows);
            this.putQueue(owner,activeQueue);
            this.rows=remote;
            this.storage.setItem(this.lastVerifiedOwnerKey(),owner);
            this.owner=owner;
            this.ready=true;
            this.conflicts=conflicts;
            if(this.kind==='custom')e.sharedCustomCatalogRows=new Map(remote);
            this.publishToEngine([...merged.values()]);
            this.message=conflicts.length
                ?conflicts.length+' 項同名或版本衝突，原資料保留，其他項可同步。'
                :'已載入 Supabase；'+this.pending+' 項'+kindKeys[this.kind].label+'待同步。';
            if(this.pending)this.sync().catch(err=>{this.message='同步尚未完成：'+err.message;});
            return true;
        }catch(error){
            this.ready=false;
            this.message='同步保護啟動，原手機資料保留：'+error.message;
            return false;
        }
    }
    async saveLocal(list){
        const c=this.context();
        const owner=c?.userId || (sessionUserId(this.engine.auth)===
            this.storage.getItem(this.lastVerifiedOwnerKey())
            ?this.storage.getItem(this.lastVerifiedOwnerKey()):null);
        if(!Array.isArray(list))throw Error('清單格式不正確。');
        if(!owner || !this.ready || this.owner!==owner){
            storeRecords(this.storage,this.kind,list,this.engine);
            this.message='已儲存在手機；登入並成功確認雲端後自動補同步。';
            return true;
        }
        const prev=new Map(this.local(owner).map(item=>[item.id,item]));
        const next=new Map(list.map(item=>[item.id,item]));
        if(next.size!==list.length)throw Error('項目 ID 重複，未覆寫。');
        // custom item deletion is not safe until recipe/pantry references are
        // checked. Never turn it into a silent global delete.
        if(this.kind==='custom' && [...prev.keys()].some(id=>!next.has(id)))
            throw Error('私房食材可能仍被料理或庫存引用，尚未支援跨裝置刪除。');
        for(const [id,item] of next){
            const previous=prev.get(id);
            if(!previous || !equals(sanitizeFk14Record(this.kind,previous),
                sanitizeFk14Record(this.kind,item))){
                this.stage(owner,item,this.rows.get(id)?.revision||0);
            }
        }
        if(this.kind==='favorite'){
            for(const [id,item] of prev)if(!next.has(id))
                this.stage(owner,item,this.rows.get(id)?.revision||0,true);
        }
        storeRecords(this.storage,this.kind,list,this.engine);
        if(this.kind==='favorite')
            this.storage.setItem(this.favoriteKey(owner),JSON.stringify({favorites:list}));
        this.message=this.pending+' 項待同步，手機修改已儲存。';
        this.sync().catch(err=>{this.message='手機已儲存，仍待同步：'+err.message;});
        return true;
    }
    noteSavedItem(item){
        // Official items already have their own nutrition SSOT. Never shadow
        // a canonical ID in the new family custom ingredient table.
        if(this.engine.officialIngredientById?.has(item.id)
            || this.engine.officialCatalogRows?.has(item.id))return false;
        // Called AFTER the existing saveIngredient duplicate and photo guards
        // have durably committed its local cache. No extra bypass/write path.
        const owner=this.context()?.userId;
        if(!this.ready || !owner || this.owner!==owner)return false;
        const row=this.rows.get(item.id);
        this.stage(owner,item,row?.revision||0);
        this.message=this.pending+' 項私房食材等待 Supabase 同步。';
        this.sync().catch(()=>{});
        return true;
    }
    async prepareCloudItem(item) {
        if(this.kind!=='custom') return item;
        const e=this.engine,prepared=clone(item);
        for(const field of ['photoUrl','photo']){
            const value=prepared[field];
            if(typeof value==='string' && /^https:\/\//i.test(value))continue;
            const ref=prepared.localPhotoRefs?.[field];
            if(!ref){
                if(typeof value==='string' && (value.startsWith('blob:') || value.startsWith('data:')))
                    throw Error('照片缺少可驗證的裝置原件，先保留本機食材等待補傳。');
                continue;
            }
            if(typeof e.ingredientPhotoStore?.get!=='function'
                || typeof e.supabase?.uploadIngredientPhoto!=='function')
                throw Error('尚無照片上傳服務，私房食材保留待同步。');
            const blob=await e.ingredientPhotoStore.get(ref);
            if(!(blob instanceof Blob) || !blob.type.startsWith('image/'))
                throw Error('照片二進位備份無法讀取，私房食材仍在手機。');
            const bytes=new Uint8Array(await blob.arrayBuffer());
            let data='';
            // Convert the old IndexedDB Blob to a transient upload payload.
            for(let index=0;index<bytes.length;index+=8192){
                data+=String.fromCharCode(...bytes.subarray(index,index+8192));
            }
            const url=await e.supabase.uploadIngredientPhoto(
                'data:'+blob.type+';base64,'+btoa(data));
            if(!url || !/^https:\/\//i.test(url))
                throw Error('照片尚未成功上傳 Supabase，原本二進位備份保留。');
            prepared[field]=url;
        }
        return prepared;
    }
    rememberCloudPhoto(original,uploaded){
        if(this.kind!=='custom')return;
        const urlFields=['photoUrl','photo'].filter(key=>
            uploaded[key] && uploaded[key]!==original[key] &&
            /^https:\/\//i.test(uploaded[key]));
        if(!urlFields.length)return;
        const e=this.engine,raw=this.storage.getItem(kindKeys.custom.local);
        if(!raw)return;
        const foods=parseArray(raw,'custom');
        const next=foods.map(item=>{
            if(item.id!==original.id)return item;
            const updated={...item};
            for(const field of urlFields)if(item[field]===original[field])
                updated[field]=uploaded[field];
            return updated;
        });
        storeRecords(this.storage,'custom',next,e);
        for(const list of [e.data.ingredients,...Object.values(e.data.rawIngredients||{})]){
            if(!Array.isArray(list))continue;
            for(const item of list){
                if(item.id!==original.id)continue;
                for(const field of urlFields)if(item[field]===original[field])
                    item[field]=uploaded[field];
            }
        }
    }
    async sync(){
        if(!this.ready||this.busy || this.owner!==this.context()?.userId)return false;
        const c=this.context(),generation=this.engine.personalScopeGeneration,owner=c.userId;
        this.busy=true;
        try{
            const queue=this.getQueue(owner);
            const blocked=[];
            for(const [id,task] of Object.entries(queue)){
                if(!this.still(c,generation))return false;
                const remote=this.rows.get(id);
                if((remote?.revision||0)!==task.revision){blocked.push(id);continue;}
                try{
                    const prepared=await this.prepareCloudItem(task.item);
                    const saved=await this.service.save(this.kind,prepared,task.revision,
                        {deleted:task.deleted});
                    if(!this.still(c,generation))return false;
                    const updated=[...this.rows.values()].filter(r=>
                        r[FK14_DATASETS[this.kind].idKey]!==id);
                    updated.push(saved);
                    this.setSnapshot(owner,updated);
                    this.rows.set(id,saved);
                    if(this.kind==='custom'){
                        this.engine.sharedCustomCatalogRows.set(id,saved);
                        this.rememberCloudPhoto(task.item,prepared);
                    }
                    const live=this.getQueue(owner);
                    if(equals(live[id],task)){
                        delete live[id];this.putQueue(owner,live);
                    }else if(live[id] && live[id].revision===task.revision){
                        live[id].revision=saved.revision;this.putQueue(owner,live);
                    }
                }catch(e){blocked.push(id);}
            }
            this.pending=Object.keys(this.getQueue(owner)).length;
            this.message=this.pending
                ?this.pending+' 項資料待補同步（版本衝突或網路問題），本機保留。'
                :kindKeys[this.kind].label+'已同步到 Supabase。';
            if(this.kind==='custom' && !this.pending
                && typeof this.engine.recipeSync?.load==='function') {
                // Two-phase post-custom reconciliation. The first load may
                // already be in progress; the second is guaranteed to observe
                // newly published private IDs, including offline device drafts.
                this.engine.recipeSync.load()
                    .then(()=>this.engine.recipeSync.load())
                    .catch(error=>console.warn('Recipe references pending hydration:',error.message));
            }
            return !this.pending && !blocked.length;
        }finally{this.busy=false;}
    }
}
export default Fk14LocalDataCoordinator;
