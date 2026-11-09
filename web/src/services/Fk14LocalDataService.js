/**
 * FK #14 remote adapter for the TWO remaining browser-only business datasets.
 * Custom foods share a family catalog, but never join the 100 official foods.
 * Favorite meal shortcuts remain attached to the verified signed-in account.
 */
import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseConfig.js';
import { normalizeStoreName } from '../utils/StoreNormalizer.js?v=20260926_FK004_STORE_SYNC';

export const FK14_DATASETS = Object.freeze({
    custom: { table:'fk_shared_custom_ingredients',idKey:'ingredient_id',dataKey:'ingredient' },
    favorite: { table:'fk_member_favorite_foods',idKey:'favorite_id',dataKey:'favorite' }
});

function copyJSON(data) { return JSON.parse(JSON.stringify(data)); }
export function sanitizeFk14Record(kind,source) {
    if (!FK14_DATASETS[kind] || !source || typeof source!=='object' || Array.isArray(source)
        || typeof source.id!=='string' || source.id.length<1 || source.id.length>120
        || typeof source.name!=='string' || !source.name.trim() || source.name.length>180)
        throw Error('同步資料的名稱或 ID 無效，原本手機資料保留。');
    const item=copyJSON(source);
    if (kind==='custom') {
        if (!['proteins','veggies','carbs','sauces'].includes(item.category))
            throw Error('私房食材類別無效，暫停同步。');
        // Local photos must already be uploaded; only HTTP(S) URLs may travel.
        for(const key of ['photo','photoUrl']) {
            if(item[key] && (typeof item[key]!=='string' || !/^https:\/\//i.test(item[key])))
                item[key]=null;
        }
        delete item.localPhotoRefs;
        if (item.preferredStore) item.preferredStore=normalizeStoreName(item.preferredStore);
        if (Array.isArray(item.preferredStores))
            item.preferredStores=item.preferredStores.map(normalizeStoreName);
    }
    const value=JSON.stringify(item);
    if(value.length>120000 || /data:(?:image|application)\//i.test(value)
        || /blob:[^\s"']+/i.test(value))
        throw Error('資料含有不可持久化的照片或體積過大，未送到 Supabase。');
    return item;
}

export function validateFk14Rows(kind,rows,owner) {
    const model=FK14_DATASETS[kind];
    if(!model || !Array.isArray(rows) || rows.length>10000)
        throw Error('雲端資料不完整，手機資料保留。');
    const ids=new Set();
    for(const row of rows) {
        const id=row?.[model.idKey],item=row?.[model.dataKey];
        if(typeof id!=='string' || !item || item.id!==id
            || !Number.isSafeInteger(Number(row.revision)) || Number(row.revision)<1
            || ids.has(id) || (kind==='favorite' && row.owner_user_id!==owner))
            throw Error('雲端項目 ID、帳號或版本異常，不能覆寫手機。');
        sanitizeFk14Record(kind,item);
        ids.add(id);
    }
    return rows;
}

export class Fk14LocalDataService {
    constructor({auth=authService,fetcher=fetch}={}) {
        this.auth=auth;
        this.fetcher=fetcher;
    }
    identity(){
        const c=this.auth.getPersonalContext();
        if(!c || !['household','ariel'].includes(c.scopeId)
            || !this.auth.isCurrentContext(c))
            throw Error('尚未確認 FK 家庭登入，沒有上傳。');
        return c;
    }
    async request(path,opts,context){
        if(!this.auth.isCurrentContext(context))throw Error('帳號已切換，沒有上傳。');
        const res=await this.fetcher.call(globalThis.window??globalThis,
            `${SUPABASE_CONFIG.url}/rest/v1/${path}`,{
                ...opts,
                headers:{
                    apikey:SUPABASE_CONFIG.anonKey,
                    Authorization:`Bearer ${context.token}`,
                    'Content-Type':'application/json',
                    ...opts.headers
                },
                signal:AbortSignal.timeout(10000)
            });
        if(!this.auth.isCurrentContext(context))throw Error('帳號已切換，原資料保留。');
        if(res.status===400 || res.status===409 || res.status===412)
            throw Object.assign(Error('雲端已有不同版本，沒有覆寫原資料。'),{code:'FK14_DATA_CONFLICT'});
        if(!res.ok)throw Error(`資料尚未同步（HTTP ${res.status}），手機內容保留。`);
        const body=await res.json();
        if(!this.auth.isCurrentContext(context) || !Array.isArray(body))
            throw Error('雲端回應不完整，原資料保留。');
        return body;
    }
    async list(kind){
        const model=FK14_DATASETS[kind];
        if(!model)throw Error('未知同步資料類型。');
        const c=this.identity();
        const ownerFilter=kind==='favorite'? `&owner_user_id=eq.${encodeURIComponent(c.userId)}`:'';
        const path=`${model.table}?select=*&order=${model.idKey}.asc${ownerFilter}`;
        return validateFk14Rows(kind,await this.request(path,{},c),c.userId);
    }
    async save(kind,item,revision,{deleted=false}={}){
        const model=FK14_DATASETS[kind];
        if(!model)throw Error('未知同步資料類型。');
        const c=this.identity(),data=sanitizeFk14Record(kind,item);
        if(!Number.isSafeInteger(revision) || revision<0)
            throw Error('資料同步版本無效。');
        if(kind==='custom' && deleted)
            throw Error('私房食材仍被料理或庫存引用，不能自動刪除。');
        const creating=revision===0;
        const id=encodeURIComponent(data.id);
        const constraint=kind==='favorite'? `owner_user_id=eq.${encodeURIComponent(c.userId)}&`:'';
        const path=creating?model.table
            :`${model.table}?${constraint}${model.idKey}=eq.${id}&revision=eq.${revision}`;
        const body={
            ...(creating ? {[model.idKey]:data.id}: {}),
            [model.dataKey]:data,
            revision:revision+1,
            ...(kind==='custom' ? {updated_by:c.userId}
                :{owner_user_id:c.userId,is_deleted:Boolean(deleted)})
        };
        const rows=await this.request(path,{
            method:creating?'POST':'PATCH',
            headers:{Prefer:'return=representation'},
            body:JSON.stringify(body)
        },c);
        if(rows.length!==1 || rows[0]?.[model.idKey]!==data.id
            || Number(rows[0].revision)!==revision+1)
            throw Object.assign(Error('資料版本已改變，手機修改保留。'),{code:'FK14_DATA_CONFLICT'});
        return validateFk14Rows(kind,rows,c.userId)[0];
    }
}
export default new Fk14LocalDataService();
