import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SharedRecipeCoordinator} from '../web/src/services/SharedRecipeCoordinator.js';
import {
    removeOnlyApprovedOrphanReferences,
    backupApprovedOrphanRecipeReferences,
    FK14_APPROVED_ORPHANS,FK14_APPROVED_RECIPE_BACKUP_PREFIX
} from '../web/src/utils/Fk14ApprovedOrphanRecipeCleanup.js';
import {
    RECIPE_CACHE_KEY,RECIPE_PENDING_KEY,readRecipeQueue,
    readRecipeSnapshot,writeRecipeSnapshot
} from '../web/src/utils/SharedRecipeState.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const base=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const official=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const personal=JSON.stringify({pantryInventory:{shoppingList:[{id:'rice',amount:3}]},
    householdSupplies:{supplies:['dishsoap']}});
const source=base.map(recipe=>{
    const r=clone(recipe),orphan=FK14_APPROVED_ORPHANS[r.id];
    if(!orphan) return r;
    r.recommendedProteins=[...(r.recommendedProteins||[]),'egg',orphan,orphan];
    r.defaultIngredients=[...(r.defaultIngredients||[]),
        {id:'egg',amount:2,unit:'顆'},
        {id:orphan,amount:30,unit:'g'}];
    r.memberPortions={
        bebe:[{id:orphan,amount:30},{id:'egg',amount:2}],
        ariel:[{id:'egg',amount:2},{id:orphan,amount:25}],
        jason:[{id:orphan,amount:45},{id:'egg',amount:3}]
    };
    r.sopSteps=[...(r.sopSteps||[]),'自製備料步驟應完全保留'];
    return r;
});
const targetIds=Object.keys(FK14_APPROVED_ORPHANS);
const transformed=removeOnlyApprovedOrphanReferences(source);
assert.deepEqual(transformed.changed.map(r=>r.id).sort(),targetIds.sort());
for(const item of source){
    const cleaned=transformed.recipes.find(r=>r.id===item.id);
    if(!FK14_APPROVED_ORPHANS[item.id]){
        assert(eq(cleaned,item),'Other recipes must be byte-for-byte identical');
        continue;
    }
    assert(cleaned.recommendedProteins.includes('egg'));
    assert(cleaned.defaultIngredients.some(i=>i.id==='egg'));
    assert(cleaned.memberPortions.bebe.some(i=>i.id==='egg'));
    assert.deepEqual(cleaned.sopSteps,item.sopSteps);
    assert.equal(JSON.stringify(cleaned).includes(FK14_APPROVED_ORPHANS[item.id]),false);
    assert.deepEqual(item,source.find(x=>x.id===item.id),'Original source object unchanged');
}
assert.equal(removeOnlyApprovedOrphanReferences(transformed.recipes).changed.length,0);
console.log('PASS pure exact-ID stripping removes only approved recipe references, preserves all other content and is idempotent');

const store=(failBackup=false)=>{
    const cache=new Map();
    return {cache,getItem:k=>cache.get(k)??null,
        setItem(k,v){if(failBackup && k.startsWith(FK14_APPROVED_RECIPE_BACKUP_PREFIX))
            throw Error('storage quota');cache.set(k,String(v));},
        removeItem:k=>cache.delete(k)};
};
const seedCloud=()=>base.map(recipe=>({
    recipe_id:recipe.id,recipe:clone(recipe),revision:1
}));
function scenario({member='bebe',scope='household',userId=owner,offline=false,
    remoteRows=seedCloud(),failBackup=false}={}){
    const storage=store(failBackup);
    const originalCache=JSON.stringify({dishes:source});
    storage.setItem(RECIPE_CACHE_KEY,originalCache);
    storage.setItem('kitchen_v2_personal_state_household',personal);
    storage.setItem('kitchen_v2_personal_state_ariel',JSON.stringify({shoppingList:[]}));
    const current=Object.freeze({userId,scopeId:scope,token:'test'});
    const access={identity:current,member,isManager:member==='bebe'};
    let server=clone(remoteRows),online=!offline;
    const writes=[];
    const svc={
        async list(){if(!online) throw Error('network down');return clone(server)},
        async publish(recipe,expected){
            const original=server.find(row=>row.recipe_id===recipe.id);
            assert.equal(original?.revision||0,expected,'Must use exact revision CAS');
            const next={recipe_id:recipe.id,recipe:clone(recipe),
                revision:expected+1};
            server=server.filter(row=>row.recipe_id!==next.recipe_id);
            server.push(next);writes.push(recipe.id);
            return clone(next);
        }
    };
    const e={
        auth:{isCurrentContext:c=>c===current},
        personalContext:current,personalScope:scope,
        personalScopeGeneration:0,mealAccess:access,
        hasPersonalAccess(){return true},
        recipeStaticBaseline:clone(base),
        officialCatalogRows:new Map(official.map(item=>[item.id,{
            ingredient_id:item.id,ingredient:item,revision:1
        }])),
        officialIngredientById:new Map(official.map(item=>[item.id,item])),
        sharedCustomCatalogRows:new Map(),
        getIngredientById(id){return official.find(x=>x.id===id)},
        data:{rawDishes:{dishes:clone(source)},dishes:clone(source)}
    };
    const sync=new SharedRecipeCoordinator(e,{service:svc,storage});
    return {sync,e,storage,writes,originalCache,server:()=>server,
        context:current,access,setOnline:state=>online=state};
}
async function settle(s){
    for(let i=0;i<80;i++){
        if(Object.keys(readRecipeQueue(s.storage).edits).length===0)break;
        await new Promise(resolve=>setTimeout(resolve,0));
    }
    await new Promise(resolve=>setTimeout(resolve,0));
}
const b=scenario();
assert(await b.sync.load());
await settle(b);
assert.deepEqual(b.writes.sort(),targetIds);
for(const id of targetIds){
    const row=b.server().find(r=>r.recipe_id===id);
    assert.equal(row.revision,2);
    assert(!JSON.stringify(row.recipe).includes(FK14_APPROVED_ORPHANS[id]));
    assert.deepEqual(row.recipe.sopSteps,source.find(r=>r.id===id).sopSteps);
}
assert.equal(b.server().length,base.length);
assert.equal(b.storage.getItem('kitchen_v2_personal_state_household'),personal);
assert.deepEqual(JSON.parse(b.storage.getItem('kitchen_v2_personal_state_ariel')).shoppingList,[]);
const backupKey=FK14_APPROVED_RECIPE_BACKUP_PREFIX+owner;
const rawBackup=b.storage.getItem(backupKey);
assert(rawBackup);
const backup=JSON.parse(rawBackup);
assert.equal(backup.owner,owner);
assert.equal(backup.originalCache,b.originalCache);
assert.equal(backup.originals.length,2);
assert(backup.originals.some(x=>x.ingredientId==='ing_1788320234913'));
assert(backup.originals.some(x=>x.ingredientId==='ing_1788924301621'));
assert.equal(JSON.stringify(b.e.data.rawDishes.dishes).includes('ing_1788320234913'),false);
assert.equal(JSON.stringify(b.e.data.rawDishes.dishes).includes('ing_1788924301621'),false);
assert.match(b.sync.approvedOrphanRepairMessage,/已備份並移除 2 道料理/);
assert.deepEqual(b.sync.legacyIds,[]);
assert(!b.sync.message.includes('手機有 2 項舊料理修改'),
    'Once safely repaired, stale legacy counts must never be shown');
console.log('PASS real coordinator: verified Bebe rev1 -> immutable backup -> exact local cleanup -> CAS cloud rev2; pantry untouched');

const writesBefore=b.writes.length;
assert(await b.sync.load());
await settle(b);
assert.equal(b.writes.length,writesBefore,'Re-loading must never re-delete or write');
assert.equal(b.storage.getItem(backupKey),rawBackup,'Backup remains immutable');
console.log('PASS repeated login/load remains idempotent and backup immutable');

const blockedAriel=scenario({member:'ariel',scope:'ariel',userId:other});
assert(await blockedAriel.sync.load());
await settle(blockedAriel);
assert.equal(blockedAriel.writes.length,0);
assert.equal(blockedAriel.storage.getItem(RECIPE_CACHE_KEY)?.includes('ing_1788320234913'),true);
assert.equal(blockedAriel.storage.getItem(FK14_APPROVED_RECIPE_BACKUP_PREFIX+other),null);
console.log('PASS Ariel is never subject to Bebe-specific phone repair');

const blockedMember=scenario({member:'jason',scope:'household',userId:other});
assert(await blockedMember.sync.load());
await settle(blockedMember);
assert.equal(blockedMember.writes.length,0);
assert.equal(blockedMember.storage.getItem(RECIPE_CACHE_KEY)?.includes('ing_1788924301621'),true);
console.log('PASS another household member cannot trigger Bebe-specific cleanup');

const changedCloud=seedCloud();
const upstream=changedCloud.find(r=>r.recipe_id==='brunch_set');
upstream.revision=2;
upstream.recipe.sopSteps=['Other phone edited this dish after seed'];
const diverged=scenario({remoteRows:changedCloud});
assert(await diverged.sync.load());
await settle(diverged);
assert(!diverged.writes.includes('brunch_set'));
assert(diverged.writes.includes('pasta_meal'));
assert.equal(diverged.server().find(r=>r.recipe_id==='brunch_set').revision,2);
assert.deepEqual(diverged.server().find(r=>r.recipe_id==='brunch_set').recipe.sopSteps,
    ['Other phone edited this dish after seed']);
console.log('PASS version conflict isolates modified remote recipe, other approved recipe still syncs');

const noCloud=scenario({remoteRows:[]});
assert.equal(await noCloud.sync.load(),false);
assert.equal(noCloud.writes.length,0);
assert.equal(noCloud.storage.getItem(RECIPE_CACHE_KEY),noCloud.originalCache);
console.log('PASS empty remote refuses to overwrite local');

const offlineCase=scenario({offline:true});
assert.equal(await offlineCase.sync.load(),false);
assert.equal(offlineCase.storage.getItem(RECIPE_CACHE_KEY),offlineCase.originalCache);
assert.equal(offlineCase.writes.length,0);
console.log('PASS offline guest cannot delete local references without verified cloud');

const failure=scenario({failBackup:true});
assert(await failure.sync.load());
await settle(failure);
assert.equal(failure.writes.length,0);
assert.equal(failure.storage.getItem(backupKey),null);
assert.equal(failure.storage.getItem(RECIPE_CACHE_KEY)?.includes('ing_1788320234913'),true);
assert.match(failure.sync.approvedOrphanRepairMessage,/原料理保留/);
console.log('PASS backup write failure prevents any local deletion or cloud data write');

const named=clone(source);
named.find(r=>r.id==='yogurt_bowl').recommendedProteins=[FK14_APPROVED_ORPHANS.brunch_set];
const results=removeOnlyApprovedOrphanReferences(named);
assert(results.recipes.find(x=>x.id==='yogurt_bowl')
    .recommendedProteins.includes(FK14_APPROVED_ORPHANS.brunch_set));
console.log('PASS unauthorized other recipe references are untouched');

const main=fs.readFileSync('web/src/main.js','utf8');
assert(main.includes('recipeSync.approvedOrphanRepairMessage'));
assert(main.includes("appVersion = '2026.11.11.2'"));
const engine=fs.readFileSync('web/src/engine/KitchenEngine.js','utf8');
assert(engine.includes('SharedRecipeCoordinator.js?v=20261109_FK14_APPROVED_ORPHAN_CLEANUP_V1'));
const coordinator=fs.readFileSync('web/src/services/SharedRecipeCoordinator.js','utf8');
assert(coordinator.includes('Fk14ApprovedOrphanRecipeCleanup.js?v=20261109_FK14_APPROVED_ORPHAN_CLEANUP_V1'));
console.log('PASS visible repair status and PWA import-chain requirements');

const immutableBackupStore=store();
immutableBackupStore.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:source}));
const originalChanges=removeOnlyApprovedOrphanReferences(source).changed;
const key=backupApprovedOrphanRecipeReferences(immutableBackupStore,owner,originalChanges);
const beforeBackup=immutableBackupStore.getItem(key);
const modifiedLater=clone(source);
modifiedLater.find(x=>x.id==='pasta_meal').name+=' 後續人工修改';
const changedAfter=removeOnlyApprovedOrphanReferences(modifiedLater).changed;
assert.throws(()=>
    backupApprovedOrphanRecipeReferences(immutableBackupStore,owner,changedAfter),
    /首次備份後有新的修改/
);
assert.equal(immutableBackupStore.getItem(key),beforeBackup,
    'Immutable backup must remain untouched when a later draft differs');
console.log('PASS later modified recipe cannot be cleaned using stale original backup');

const corruptBackupStore=store();
corruptBackupStore.setItem(key,'{bad-json');
assert.throws(()=>
    backupApprovedOrphanRecipeReferences(corruptBackupStore,owner,originalChanges),
    /無法驗證/);
console.log('PASS damaged backup blocks mutation without overwriting original');

const onlyPasta=source.map(x=>x.id==='brunch_set'
    ? base.find(r=>r.id==='brunch_set') : x);
const staged=removeOnlyApprovedOrphanReferences(onlyPasta).changed;
assert.equal(staged.length,1);
assert.equal(staged[0].id,'pasta_meal');
console.log('PASS an already repaired recipe does not trigger unrelated extra deletion');
