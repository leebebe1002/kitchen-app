import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SharedRecipeCoordinator} from '../web/src/services/SharedRecipeCoordinator.js';
import {readRecipeQueue,queueRecipeEdits,commitRecipeEdit,
    RECIPE_CACHE_KEY,RECIPE_PENDING_KEY,RECIPE_PRE_CUTOVER_BACKUP_KEY} from '../web/src/utils/SharedRecipeState.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const source=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
const official=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const catalog=new Map(official.map(x=>[x.id,x]));
const privateIds=['ing_1788320234913','ing_1788924301621'];
const privateNames=new Map([[privateIds[0],'手機私房甲'],[privateIds[1],'手機私房乙']]);
const local=source.map((d,i)=>{
    const out=copy(d);
    if(i<9)out.sopSteps=[...(out.sopSteps||[]),'手機本機編輯 '+i];
    if(i===0||i===1){
        out.defaultIngredients=[...(out.defaultIngredients||[]),{
            id:privateIds[i],amount:30,unit:'g'
        }];
    }
    return out;
});
const owner='fixture-bebe-device-owner';
const memory=new Map();
const storage={
    getItem:k=>memory.get(k)??null,
    setItem:(k,v)=>memory.set(k,String(v)),
    removeItem:k=>memory.delete(k)
};
const cache=JSON.stringify({dishes:local});
storage.setItem(RECIPE_CACHE_KEY,cache);
const beforeSupplies='{"household":["private"]}';
storage.setItem('kitchen_v2_personal_state_household',beforeSupplies);
const context=Object.freeze({userId:owner,scopeId:'household',token:'token'});
const auth={getPersonalContext:()=>context,isCurrentContext:c=>c===context};
const engine={
    auth,personalContext:context,personalScopeGeneration:1,
    hasPersonalAccess(){return true},
    officialIngredientById:catalog,
    getIngredientById(id){return catalog.get(id)||{id,name:privateNames.get(id)}},
    recipeStaticBaseline:copy(source),
    data:{rawDishes:{dishes:copy(local)},dishes:[]}
};
let server=source.map(recipe=>({recipe_id:recipe.id,recipe:copy(recipe),revision:1}));
let calls=[];
const service={
    list:async()=>copy(server),
    publish:async(recipe,revision)=>{
        calls.push(recipe.id);
        const old=server.find(r=>r.recipe_id===recipe.id);
        assert.equal(revision,old?.revision||0);
        const saved={recipe_id:recipe.id,recipe:copy(recipe),revision:revision+1};
        server=server.filter(r=>r.recipe_id!==recipe.id);
        server.push(saved);
        return copy(saved);
    }
};
const coordinator=new SharedRecipeCoordinator(engine,{service,storage});
assert(await coordinator.load());
for(let i=0;i<25 && Object.keys(readRecipeQueue(storage).edits).length;i++)
    await new Promise(r=>setTimeout(r,0));
assert.equal(coordinator.legacyIds.length,2,'After safe auto-sync, two private-food recipes remain');
assert.equal(calls.length,7,'Seven verified rev-1 recipes are automatically backed up');
assert.equal(storage.getItem(RECIPE_PRE_CUTOVER_BACKUP_KEY),cache);
assert.equal(storage.getItem('kitchen_v2_personal_state_household'),beforeSupplies);

const review=coordinator.reviewLegacy();
assert.equal(review.length,2);
assert.equal(review.filter(item=>item.blockedIds.length).length,2);
assert.equal(review.filter(item=>!item.blockedIds.length).length,0);
assert.equal(review[0].name,source[0].name);
assert(review[0].blockedNames[0].includes('手機私房甲'));
assert(review[1].blockedNames[0].includes('手機私房乙'));
assert(review[0].diffs.some(field=>field.name==='預設食材'));
assert(review[0].diffs.some(field=>field.name==='料理步驟'));
assert.equal(calls.length,7);
assert.equal(storage.getItem(RECIPE_CACHE_KEY),JSON.stringify({dishes:local}));
console.log('PASS screenshot recovery: seven independent safe recipes auto synced, two blocked visible by name');

await assert.rejects(()=>coordinator.approveLegacy(),/先從待確認清單選擇/);
await assert.rejects(()=>coordinator.approveLegacy([source[0].id]),/尚未跨手機同步/);
await assert.rejects(()=>coordinator.approveLegacy([source[2].id,source[2].id]),/選擇要分享/);
await assert.rejects(()=>coordinator.approveLegacy(['wrong-id']),/選擇要分享/);
assert.equal(calls.length,7);
assert.equal(readRecipeQueue(storage).owner,owner);
console.log('PASS blocked ID and invalid selection cannot publish');

const eligible=source.slice(2,9).map(item=>item.id);
await assert.rejects(()=>coordinator.approveLegacy(eligible),/先從待確認清單選擇/);
assert.equal(calls.length,7,'Only verified unchanged-seed recipes were automatically published');
assert.equal(coordinator.legacyIds.length,2,'Both unshared phone recipes remain reviewable');
assert.equal(coordinator.reviewLegacy().filter(x=>x.blockedIds.length).length,2);
assert.equal(Object.keys(readRecipeQueue(storage).edits).length,0);
assert.equal(storage.getItem('kitchen_v2_personal_state_household'),beforeSupplies);
assert.deepEqual(engine.data.rawDishes.dishes.find(x=>x.id===source[0].id),local[0]);
assert.equal(server.find(x=>x.recipe_id===source[0].id).revision,1);
assert.equal(server.find(x=>x.recipe_id===source[2].id).revision,2);
console.log('PASS seven auto-sync safe recipes; two private-food recipes and Pantry remain unchanged');

// A previously queued private-food recipe must no longer hold up a later
// approved safe recipe. Every recipe ID has an independent result.
const customBlocked=copy(local[0]);
customBlocked.name+=' 修改';
const safeNext=copy(local[9]);
safeNext.sopSteps=[...(safeNext.sopSteps||[]),'新的安全修改'];
const modified=engine.data.rawDishes.dishes.map(item=>
    item.id===customBlocked.id?customBlocked:item.id===safeNext.id?safeNext:item);
const queue=queueRecipeEdits(storage,{
    owner,changes:[customBlocked,safeNext],
    revisionById:new Map([...coordinator.rows].map(([id,row])=>[id,row.revision]))
});
commitRecipeEdit(storage,modified,queue);
engine.data.rawDishes.dishes=modified;
calls=[];
const allFinished=await coordinator.sync();
assert.equal(allFinished,false,'A deferred recipe makes overall status incomplete');
assert.deepEqual(calls,[safeNext.id],'The following safe recipe still syncs');
assert.equal(readRecipeQueue(storage).edits[customBlocked.id].recipe.name,customBlocked.name);
assert.equal(readRecipeQueue(storage).edits[safeNext.id],undefined);
assert.equal(server.find(row=>row.recipe_id===safeNext.id).revision,2);
assert.match(coordinator.message,/1 項料理仍待同步/);
assert.equal(storage.getItem('kitchen_v2_personal_state_household'),beforeSupplies);
console.log('PASS blocked pending recipe does not starve later independent cloud sync');

// A failed or stale batch cannot present a success label or erase the outbox.
coordinator.rows.set(source[9].id,{...server.find(r=>r.recipe_id===source[9].id),revision:2});
const newer=copy(safeNext);newer.name+=' third';
const queued=queueRecipeEdits(storage,{
    owner,changes:[newer],
    revisionById:new Map([[newer.id,1]])
});
storage.setItem(RECIPE_PENDING_KEY,JSON.stringify(queued));
calls=[];
assert.equal(await coordinator.sync(),false);
assert.equal(calls.length,0,'Out-of-date revision should not attempt a write');
assert(readRecipeQueue(storage).edits[customBlocked.id]);
assert(readRecipeQueue(storage).edits[newer.id]);
console.log('PASS stale revision keeps both pending entries; no fake success');

// UI contracts: only checked recipes are passed to approveLegacy.
// No blanket share button or implicit database writes.
const main=fs.readFileSync('web/src/main.js','utf8');
assert(main.includes('selectedLegacyRecipeIds'));
assert(main.includes('legacyRecipeReview'));
assert(main.includes('v-model="selectedLegacyRecipeIds"'));
assert(main.includes('approveLegacy(chosen)'));
assert(main.includes('item.blockedIds.length'));
assert(main.includes("appVersion = '2026.11.10.1'"));
assert(main.includes('檢視 {{ item.diffs.length }} 個不同欄位'));
assert(!main.includes('確認分享這台裝置的 {{ engine.recipeSync.legacyIds.length }} 項舊料理修改'));
console.log('PASS actual Vue selection UI requires explicit choice and shows safe vs blocked recipes');
