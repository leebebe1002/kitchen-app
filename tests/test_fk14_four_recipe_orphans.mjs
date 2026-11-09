import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SharedRecipeCoordinator} from '../web/src/services/SharedRecipeCoordinator.js';
import {readRecipeQueue,RECIPE_CACHE_KEY,writeRecipeSnapshot} from '../web/src/utils/SharedRecipeState.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const base=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
const foods=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const owner='fixture-bebe-account';
const stable=base.map(x=>{
  const r=clone(x);
  if(r.id==='brunch_set')r.recommendedProteins.push('ing_1788320234913');
  if(r.id==='pasta_meal')r.recommendedVeggies.push('ing_1788924301621');
  if(r.id==='special_drink')r.sopSteps=[...(r.sopSteps||[]),'本機曾更新飲品做法'];
  if(r.id==='yogurt_bowl')r.sopSteps=[...(r.sopSteps||[]),'本機曾更新優格份量'];
  return r;
});
const queueRecords=new Map();
const storage={
 getItem:k=>queueRecords.get(k)??null,
 setItem:(k,v)=>queueRecords.set(k,String(v)),
 removeItem:k=>queueRecords.delete(k)
};
storage.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:stable}));
const protectedPantry=JSON.stringify({shoppingList:[{targetId:'egg'}],foodCart:['local']});
storage.setItem('kitchen_v2_personal_state_household',protectedPantry);
let remote=base.map(recipe=>({recipe_id:recipe.id,recipe:clone(recipe),revision:1}));
const published=[];
const svc={
 async list(){return clone(remote)},
 async publish(recipe,rev){
  const prev=remote.find(x=>x.recipe_id===recipe.id);
  assert.equal(prev?.revision??0,rev);
  const updated={recipe_id:recipe.id,recipe:clone(recipe),revision:rev+1};
  remote=remote.filter(x=>x.recipe_id!==recipe.id);remote.push(updated);
  published.push(recipe.id);
  return clone(updated);
 }
};
const context=Object.freeze({userId:owner,scopeId:'household',token:'fixture'});
const engine={
 personalContext:context,personalScopeGeneration:1,
 auth:{isCurrentContext:c=>c===context},hasPersonalAccess(){return true},
 officialCatalogRows:new Map(foods.map(x=>[x.id,{ingredient_id:x.id,ingredient:x,revision:1}])),
 officialIngredientById:new Map(foods.map(x=>[x.id,x])),
 sharedCustomCatalogRows:new Map(),
 getIngredientById(id){return foods.find(x=>x.id===id)},
 recipeStaticBaseline:clone(base),
 data:{rawDishes:{dishes:clone(stable)},dishes:clone(stable)}
};
const coordinator=new SharedRecipeCoordinator(engine,{service:svc,storage});
assert.equal(await coordinator.load(),true);
for(let i=0;i<100 && (!published.includes('special_drink') || !published.includes('yogurt_bowl')
 || Object.keys(readRecipeQueue(storage).edits).length);i++) await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(published.sort(),['special_drink','yogurt_bowl'].sort(),
 'The two safe recipes should auto-upload while two missing references stay local');
assert.deepEqual(coordinator.legacyIds.sort(),['brunch_set','pasta_meal'].sort());
assert.equal(await coordinator.sync(),false,
  'No queued writes is NOT proof that all old recipes were shared');
assert.match(coordinator.message,/2 項舊料理差異待補食材或核對/);
assert(!coordinator.message.startsWith('全家料理已同步'),
  'Never display success when two unresolved references keep recipes local');
const review=coordinator.reviewLegacy();
assert.equal(review.length,2);
assert.deepEqual(review.find(x=>x.id==='brunch_set').blockedIds,['ing_1788320234913']);
assert.deepEqual(review.find(x=>x.id==='pasta_meal').blockedIds,['ing_1788924301621']);
assert.equal(remote.find(x=>x.recipe_id==='brunch_set').revision,1);
assert.equal(remote.find(x=>x.recipe_id==='pasta_meal').revision,1);
assert.equal(remote.find(x=>x.recipe_id==='special_drink').revision,2);
assert.equal(remote.find(x=>x.recipe_id==='yogurt_bowl').revision,2);
assert.equal(storage.getItem('kitchen_v2_personal_state_household'),protectedPantry);
assert(stable.every(item=>engine.data.rawDishes.dishes.find(x=>x.id===item.id)));
console.log('PASS snapshot case: 4 local recipe differences, 2 unresolved food IDs, 2 safe dishes auto-shared, 2 originals and pantry preserved');

// Reproduces an iPhone that opened FK while offline, then tapped the existing
// 'retry pending recipes' control after its network returned. sync() alone
// cannot discover legacy differences that have not been staged in the outbox.
{
  const db=base.map(r=>({recipe_id:r.id,recipe:clone(r),revision:1}));
  let online=false;
  const storeData=new Map();
  const store={
    getItem:k=>storeData.get(k)??null,
    setItem:(k,v)=>storeData.set(k,String(v)),
    removeItem:k=>storeData.delete(k)
  };
  store.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:clone(stable)}));
  writeRecipeSnapshot(store,owner,db);
  const e={
    ...engine,
    data:{rawDishes:{dishes:clone(stable)},dishes:clone(stable)},
    recipeStaticBaseline:clone(base)
  };
  const publishedOnce=[];
  const backend={
    async list(){if(!online)throw Error('network offline');return clone(db)},
    async publish(recipe,rev){
      const old=db.find(r=>r.recipe_id===recipe.id);
      assert.equal(old.revision,rev);
      old.recipe=clone(recipe);old.revision++;
      publishedOnce.push(recipe.id);
      return clone(old);
    }
  };
  const c=new SharedRecipeCoordinator(e,{storage:store,service:backend});
  assert(await c.load());
  assert.equal(c.offline,true);
  assert.equal(c.legacyIds.length,4);
  assert.equal(await c.sync(),false);
  assert.deepEqual(publishedOnce,[]);
  online=true;
  assert(await c.load());
  for(let i=0;i<100 && (publishedOnce.length<2 || Object.keys(readRecipeQueue(store).edits).length);i++)
    await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(publishedOnce.sort(),['special_drink','yogurt_bowl'].sort());
  assert.deepEqual(c.legacyIds.sort(),['brunch_set','pasta_meal'].sort());
  assert.equal(await c.sync(),false);
  assert.match(c.message,/2 項舊料理差異待補食材或核對/);
  const preview=c.reviewLegacy();
  assert.deepEqual(preview.find(x=>x.id==='brunch_set').blockedContexts,
    [{id:'ing_1788320234913',fields:['蛋白質選項']}]);
  assert.deepEqual(preview.find(x=>x.id==='pasta_meal').blockedContexts,
    [{id:'ing_1788924301621',fields:['蔬菜選項']}]);
  assert.equal(store.getItem(RECIPE_CACHE_KEY).includes('ing_1788320234913'),true);
  console.log('PASS offline-first retry reloads verified cloud, syncs only 2 safe recipes and explains missing ingredient usage');
}
const main=fs.readFileSync('web/src/main.js','utf8');
const retry=main.match(/const retryRecipeSync = async \(\) => \{([\s\S]*?)\n        \};/)?.[1];
assert(retry?.includes('await target.recipeSync.load()'),
  'Retry button must refresh real cloud and detect unstaged legacy edits before sync');
console.log('PASS retry button invokes fresh verified cloud reload before queuing safe drafts');

assert(main.includes('重新檢查並同步料理'),
 'The retry action must accurately describe that it refreshes cloud state');
console.log('PASS retry label matches fresh-cloud reconciliation behavior');
