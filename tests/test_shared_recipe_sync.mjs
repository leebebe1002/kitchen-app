import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SharedRecipeService,validateRecipe,verifySharedRecipes} from '../web/src/services/SharedRecipeService.js';
import {SharedRecipeCoordinator,unresolvedRecipeIngredientIds} from '../web/src/services/SharedRecipeCoordinator.js';
import {
    RECIPE_CACHE_KEY, RECIPE_PENDING_KEY, RECIPE_SNAPSHOT_KEY,RECIPE_JOURNAL_KEY,
    readRecipeQueue,writeRecipeSnapshot,queueRecipeEdits,commitRecipeEdit,
    recoverRecipeJournal,reconcileRecipes,reconcileRecipeAcknowledgements,acknowledgeRecipeEdit,sameRecipe
} from '../web/src/utils/SharedRecipeState.js';
const base=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
const clone=x=>JSON.parse(JSON.stringify(x));
const changed=clone(base[0]);changed.name+=' Bebe 修訂';
const custom={id:'family_recipe_local_1',name:'Bebe 自建配方',categories:['lunch'],
  recommendedProteins:['egg'],defaultIngredients:[{id:'egg',amount:1,unit:'顆'}],sopSteps:['蒸煮']};
const row=(recipe,revision=1)=>({recipe_id:recipe.id,recipe:clone(recipe),revision});
function store(failAt=0) {
 const data=new Map();let mutations=0;
 return {data,getItem:key=>data.get(key)??null,
   setItem(key,value){mutations++;if(mutations===failAt)throw Error('storage quota');data.set(key,String(value));},
   removeItem:key=>data.delete(key)};
}
const owner='fixture-user-bebe',ariel='fixture-user-ariel';
assert.equal(validateRecipe(custom).name,custom.name);
assert.throws(()=>validateRecipe({...custom,id:'',name:'x'}),/無效/);
assert.throws(()=>validateRecipe({...custom,notes:'data:image/png;base64,SECRET'}),/照片/);
assert.throws(()=>validateRecipe({...custom,sopSteps:'not array'}),/清單格式/);
assert.deepEqual(verifySharedRecipes([]),[]);
assert.throws(()=>verifySharedRecipes([row(custom),row(custom)]),/異常/);
assert.throws(()=>verifySharedRecipes([row({...custom,id:'other'})].map(x=>({...x,recipe_id:'unknown'}))),/異常/);
console.log('PASS recipe schema, duplicate identity, Base64 protection and empty cloud');

let s=store(), queue=queueRecipeEdits(s,{owner,changes:[custom],revisionById:new Map()});
assert.equal(queue.edits[custom.id].revision,0);
assert.equal(s.getItem(RECIPE_PENDING_KEY),null);
commitRecipeEdit(s,[...base,custom],queue);
assert.equal(JSON.parse(s.getItem(RECIPE_CACHE_KEY)).dishes.length,base.length+1);
assert.equal(readRecipeQueue(s).edits[custom.id].revision,0);
assert.throws(()=>queueRecipeEdits(s,{owner:ariel,changes:[custom],revisionById:new Map()}),/帳號/);
const variant=clone(custom);variant.name+=' 第二次改動';
queue=queueRecipeEdits(s,{owner,changes:[variant],revisionById:new Map([[custom.id,999]])});
assert.equal(queue.edits[custom.id].revision,0,'second local edit keeps initial cloud CAS revision');
for(const nth of [1,2,3,4]){
 const failing=store(nth);
 failing.data.set(RECIPE_CACHE_KEY,JSON.stringify({dishes:base}));
 assert.throws(()=>commitRecipeEdit(failing,[...base,custom],{owner,edits:{}}),/storage quota|還原|中斷/);
 assert.equal(failing.getItem(RECIPE_CACHE_KEY),JSON.stringify({dishes:base}));
 assert.equal(failing.getItem(RECIPE_PENDING_KEY),null);
}
const crashed=store();crashed.data.set(RECIPE_CACHE_KEY,'{"dishes":[]}');
crashed.data.set(RECIPE_PENDING_KEY,JSON.stringify({owner,edits:{[custom.id]:{recipe:custom,revision:0}}}));
crashed.data.set(RECIPE_JOURNAL_KEY,JSON.stringify({status:'pending',before:{
  [RECIPE_CACHE_KEY]:JSON.stringify({dishes:base}),[RECIPE_PENDING_KEY]:null}}));
recoverRecipeJournal(crashed);
assert.equal(crashed.getItem(RECIPE_CACHE_KEY),JSON.stringify({dishes:base}));
assert.equal(crashed.getItem(RECIPE_PENDING_KEY),null);
console.log('PASS atomic recipe save, crash recovery, cross-account pending isolation');

const cloud=[row(changed)];
let result=reconcileRecipes({base,local:[...base,custom],
 cloudRows:[],queue:{owner:null,edits:{}}});
assert(result.legacyIds.includes(custom.id));
assert.deepEqual(result.recipes.find(x=>x.id===custom.id),custom);
result=reconcileRecipes({base,local:[...base],cloudRows:cloud});
assert.equal(result.recipes.find(x=>x.id===changed.id).name,changed.name);
assert.equal(result.legacyIds.length,0);
const oldLocal=[...base.map(x=>x.id===changed.id?changed:x)];
const newer=clone(changed);newer.sopSteps=['新版步驟'];
result=reconcileRecipes({base,local:oldLocal,cloudRows:[row(newer,2)],
 previousRows:[row(changed)],queue:{owner:null,edits:{}}});
assert.deepEqual(result.recipes.find(x=>x.id===changed.id),newer);
const manual=clone(changed);manual.sopSteps=['尚未同步'];
result=reconcileRecipes({base,local:base.map(x=>x.id===changed.id?manual:x),
 cloudRows:[row(newer,2)],previousRows:[row(changed)]});
assert(result.conflictIds.includes(changed.id));
assert.deepEqual(result.recipes.find(x=>x.id===changed.id),manual);
console.log('PASS baseline/cloud/legacy precedence; newer cloud and unresolved local conflict guards');

const disconnected=store();writeRecipeSnapshot(disconnected,owner,cloud);
const queued=queueRecipeEdits(disconnected,{owner,changes:[changed],revisionById:new Map([[changed.id,1]])});
disconnected.setItem(RECIPE_PENDING_KEY,JSON.stringify(queued));
assert.equal(reconcileRecipeAcknowledgements(disconnected,owner,[row(changed,2)]),1);
assert.equal(Object.keys(readRecipeQueue(disconnected).edits).length,0);
const q2=queueRecipeEdits(disconnected,{owner,changes:[custom],revisionById:new Map()});
disconnected.setItem(RECIPE_PENDING_KEY,JSON.stringify(q2));
const expected=q2.edits[custom.id], other=clone(custom);other.name+=' again';
disconnected.setItem(RECIPE_PENDING_KEY,JSON.stringify({
 owner,edits:{[custom.id]:{revision:0,recipe:other}}
}));
assert.equal(acknowledgeRecipeEdit(disconnected,owner,custom.id,expected,row(custom)),'rebase');
assert.equal(readRecipeQueue(disconnected).edits[custom.id].revision,1);
assert.equal(readRecipeQueue(disconnected).edits[custom.id].recipe.name,other.name);
console.log('PASS lost cloud acknowledgement and simultaneous edit rebase');

const realVue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',
    {console,setTimeout,clearTimeout});
const actualWindow={};globalThis.window=actualWindow;
let remote=[],authContext={userId:owner,scopeId:'household',token:'fixture-token'},calls=[];
const auth={getPersonalContext:()=>authContext,isCurrentContext:c=>c===authContext};
const fetcher=async function(url,options) {
 assert.equal(this,actualWindow,'Window.fetch receiver must be real Window under Vue Proxy');
 calls.push({url,method:options.method||'GET'});
 if (options.method==='POST') {
  const data=JSON.parse(options.body);
  if(remote.some(r=>r.recipe_id===data.recipe_id))
    return {status:409,ok:false,json:async()=>[]};
  const saved={recipe_id:data.recipe_id,recipe:data.recipe,revision:1};
  remote.push(saved);return {status:201,ok:true,json:async()=>[saved]};
 }
 if (options.method==='PATCH') {
  const target=new URL(url),id=target.searchParams.get('recipe_id').slice(3);
  const revision=Number(target.searchParams.get('revision').slice(3));
  const existing=remote.find(row=>row.recipe_id===id);
  if(!existing || revision!==existing.revision)
    return {status:200,ok:true,json:async()=>[]};
  Object.assign(existing,JSON.parse(options.body));
  return {status:200,ok:true,json:async()=>[clone(existing)]};
 }
 return {status:200,ok:true,json:async()=>clone(remote)};
};
const service=realVue.reactive(new SharedRecipeService({auth,fetcher}));
assert.deepEqual(await service.list(),[]);
const first=await service.publish(custom,0);
assert.equal(first.revision,1);
const revise=clone(custom);revise.name='改名後的全家配方';
const second=await service.publish(revise,1);
assert.equal(second.revision,2);
await assert.rejects(()=>service.publish(custom,1),/版本/);
authContext={userId:ariel,scopeId:'ariel',token:'fixture-token'};
assert.equal((await service.list())[0].recipe.name,revise.name);
authContext=null;
await assert.rejects(()=>service.list(),/登入/);
assert.equal(calls.length,5);
console.log('PASS real Vue Proxy + branded Window.fetch; household/ariel REST insert/patch/CAS, logout');

// End-to-end coordinator with real localStorage mock and session-bound Engine.
const persistent=store();
persistent.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:[...base,custom]}));
authContext=Object.freeze({userId:owner,scopeId:'household',token:'fixture-token'});
remote=base.map(dish=>row(dish));calls=[];
const official=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const catalog=new Map(official.map(r=>[r.id,r]));
const e={
 officialIngredientById:catalog,
 auth,personalContext:authContext,personalScopeGeneration:0,
 hasPersonalAccess(){return auth.isCurrentContext(this.personalContext);},
 recipeStaticBaseline:clone(base), data:{rawDishes:{dishes:[...base,custom]},dishes:[]}
};
const coordinator=realVue.reactive(new SharedRecipeCoordinator(e,{service,storage:persistent}));
const protectedPersonal=JSON.stringify({shoppingList:[{targetId:'egg'}],foodCart:['fresh']});
persistent.setItem('kitchen_v2_personal_state_household',protectedPersonal);
persistent.setItem('kitchen_v2_personal_state_ariel',JSON.stringify({shoppingList:[]}));
const loaded=await coordinator.load();assert(loaded);
for(let i=0;i<12 && Object.keys(readRecipeQueue(persistent).edits).length;i++)
 await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(coordinator.legacyIds.length,0);
assert.equal(remote.length,base.length+1,'verified unconflicted local recipe should automatically sync');
assert.equal(Object.keys(readRecipeQueue(persistent).edits).length,0);
assert.equal(persistent.getItem('kitchen_v2_personal_state_household'),protectedPersonal);
const freshStore=store();
freshStore.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:base}));
const secondDevice={
 officialIngredientById:catalog,
 auth,personalContext:authContext,personalScopeGeneration:0,
 hasPersonalAccess(){return auth.isCurrentContext(this.personalContext);},
 recipeStaticBaseline:clone(base),data:{rawDishes:{dishes:clone(base)},dishes:[]}
};
const secondCoordinator=new SharedRecipeCoordinator(secondDevice,{service,storage:freshStore});
assert(await secondCoordinator.load());
assert(secondDevice.data.rawDishes.dishes.some(x=>x.id===custom.id));
assert.equal(secondCoordinator.legacyIds.length,0);
console.log('PASS 2-device shared custom recipe: automatic verified local -> cloud -> other device; Pantry untouched');

const edited=clone(custom);edited.name+=' 新版本';
e.data.rawDishes.dishes[e.data.rawDishes.dishes.findIndex(x=>x.id===custom.id)]=edited;
await coordinator.save(e.data.rawDishes);
assert.equal(JSON.parse(persistent.getItem(RECIPE_CACHE_KEY)).dishes.find(x=>x.id===custom.id).name,edited.name);
for(let i=0;i<12 && Object.keys(readRecipeQueue(persistent).edits).length;i++)
 await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(remote.find(r=>r.recipe_id===custom.id).recipe.name,edited.name);
assert(await secondCoordinator.load());
assert.equal(secondDevice.data.rawDishes.dishes.find(x=>x.id===custom.id).name,edited.name);
console.log('PASS modified recipe immediately saved, cloud revision and second device refreshed');

// The official baseline is a seed only; edited versions live in Supabase.
const officialEdit=clone(e.data.rawDishes.dishes[0]);
officialEdit.sopSteps=['從手機更新的配方步驟'];
e.data.rawDishes.dishes[0]=officialEdit;
await coordinator.save(e.data.rawDishes);
for(let i=0;i<12 && Object.keys(readRecipeQueue(persistent).edits).length;i++)
 await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(remote.find(r=>r.recipe_id===officialEdit.id).revision,2);
assert(await secondCoordinator.load());
assert.deepEqual(secondDevice.data.rawDishes.dishes.find(r=>r.id===officialEdit.id).sopSteps,
    officialEdit.sopSteps);
console.log('PASS official dish modified on Bebe phone and reloaded from sole Supabase authority');

authContext=null;
await assert.rejects(()=>service.publish(custom,0),/登入/);
console.log('PASS no anonymous upload');
const unresolved=clone(custom);
unresolved.defaultIngredients.push({id:'local_only_temporary_food',amount:25,unit:'g'});
assert.deepEqual(unresolvedRecipeIngredientIds(e,unresolved),['local_only_temporary_food']);
authContext=e.personalContext;
const blocked=clone(unresolved);
blocked.id='device_recipe_requires_local_food';
blocked.name='含私房食材的配方';
e.data.rawDishes.dishes.push(blocked);
await coordinator.save(e.data.rawDishes);
for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(remote.some(r=>r.recipe_id===blocked.id),false);
assert(readRecipeQueue(persistent).edits[blocked.id]);
assert.match(coordinator.message,/尚未共用的食材/);
console.log('PASS recipes referencing device-only ingredients never break another phone');

// Migration seeds every original recipe, rather than maintaining GitHub
// as an independent effective source of modified recipe content.
const migration=fs.readFileSync('supabase/migrations/20261109032524_fk14_shared_recipe_overrides.sql','utf8');
const marker="from jsonb_array_elements('";
const start=migration.indexOf(marker);
const end=migration.indexOf("'::jsonb) as d;",start);
assert(start>=0 && end>start,'Migration must include all reviewed baseline recipes');
const seed=migration.slice(start+marker.length,end);
assert.deepEqual(JSON.parse(seed.replaceAll("''","'")),base);
assert(migration.includes('enable row level security'));
assert(migration.includes('revoke all on public.fk_shared_recipe_overrides'));
assert(!migration.toLowerCase().includes('drop table'));
console.log('PASS production migration seed matches all 10 reviewed official recipes');

// One device switching Bebe -> Ariel must not expose or upload Bebe's
// unconfirmed private draft. The original cache/outbox remain byte-identical.
{
  const mixed=store();
  const bebeDraft=clone(custom);bebeDraft.id='unshared_bebe_draft';bebeDraft.name='尚未分享的本機料理';
  mixed.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:[...base,bebeDraft]}));
  const q=queueRecipeEdits(mixed,{owner,changes:[bebeDraft],revisionById:new Map()});
  mixed.setItem(RECIPE_PENDING_KEY,JSON.stringify(q));
  const previousCache=mixed.getItem(RECIPE_CACHE_KEY);
  const previousQueue=mixed.getItem(RECIPE_PENDING_KEY);
  const arielContext=Object.freeze({userId:ariel,scopeId:'ariel',token:'fixture-token'});
  authContext=arielContext;
  const swapped={
    officialIngredientById:catalog,
    auth,personalContext:arielContext,personalScopeGeneration:2,
    hasPersonalAccess(){return auth.isCurrentContext(this.personalContext);},
    recipeStaticBaseline:clone(base),
    data:{rawDishes:{dishes:[...base,bebeDraft]},dishes:[]}
  };
  const coordinatorA=new SharedRecipeCoordinator(swapped,{service,storage:mixed});
  const result=await coordinatorA.load();
  assert.equal(result,false);
  assert.equal(swapped.data.rawDishes.dishes.some(r=>r.id===bebeDraft.id),false);
  assert.equal(mixed.getItem(RECIPE_CACHE_KEY),previousCache);
  assert.equal(mixed.getItem(RECIPE_PENDING_KEY),previousQueue);
  await assert.rejects(()=>coordinatorA.save({dishes:[...base,custom]}),/其他登入者/);
  assert.equal(mixed.getItem(RECIPE_CACHE_KEY),previousCache);
  authContext=Object.freeze({userId:owner,scopeId:'household',token:'fixture-token'});
  const restored={
    officialIngredientById:catalog,
    auth,personalContext:authContext,personalScopeGeneration:3,
    hasPersonalAccess(){return auth.isCurrentContext(this.personalContext);},
    recipeStaticBaseline:clone(base),
    data:{rawDishes:{dishes:JSON.parse(mixed.getItem(RECIPE_CACHE_KEY)).dishes},dishes:[]}
  };
  const original=new SharedRecipeCoordinator(restored,{service,storage:mixed});
  assert(await original.load());
  assert.equal(restored.data.rawDishes.dishes.some(r=>r.id===bebeDraft.id),true);
  assert(readRecipeQueue(mixed).edits[bebeDraft.id]);
}
console.log('PASS Bebe pending recipe hidden from Ariel login; original draft and queue restored');

// Browser/UI contract: one explicit opt-in for old local edits, plus retry.
const main=fs.readFileSync('web/src/main.js','utf8');
assert(main.includes('共用料理同步'));
assert(main.includes('approveLegacyRecipes'));
assert(main.includes('retryRecipeSync'));
assert(main.includes('selectedLegacyRecipeIds'));
assert(main.includes('legacyRecipeReview'));
assert(main.includes('檢視 {{ item.diffs.length }} 個不同欄位'));
assert(main.includes('確認分享勾選的'));
assert(!main.includes('確認分享這台裝置的 {{ engine.recipeSync.legacyIds.length }} 項舊料理修改'));
assert(main.includes('legacyRecipeReview.length'));
assert(main.includes("appVersion = '2026.11.10.1'"));
assert(fs.readFileSync('web/index.html','utf8').includes('main.js?v=20261110_FK21_CULINARY_V1'));
assert(fs.readFileSync('web/src/engine/KitchenEngine.js','utf8')
  .includes('SharedRecipeCoordinator.js?v=20261109_FK14_APPROVED_ORPHAN_CLEANUP_V1'));
assert(fs.readFileSync('web/src/services/SharedRecipeCoordinator.js','utf8')
  .includes('SharedRecipeService.js?v=20261108_FK14_RECIPE_SYNC_V1'));
console.log('PASS UI opt-in/retry and PWA singleton module version chain');

// Exercise the REAL KitchenEngine.saveJson route and its Vue-reactive recipe
// reference, not just the standalone synchronization coordinator.
{
  const memory=store();
  globalThis.localStorage=memory;
  globalThis.sessionStorage=memory;
  globalThis.Vue=realVue;
  globalThis.window={location:{hostname:'fixture.invalid'},addEventListener(){},removeEventListener(){}};
  authContext=Object.freeze({userId:owner,scopeId:'household',token:'fixture-token'});
  const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
  const realEngine=new Engine({auth});
  realEngine.personalContext=authContext;
  realEngine.personalScope='household';
  realEngine.personalScopeGeneration=10;
  realEngine.recipeStaticBaseline=clone(base);
  realEngine.officialIngredientById=catalog;
  realEngine.data.rawDishes={dishes:clone(base)};
  realEngine.data.dishes=realEngine.data.rawDishes.dishes;
  memory.setItem(RECIPE_CACHE_KEY,JSON.stringify({dishes:base}));
  const protectedPantry=JSON.stringify({shoppingList:[{targetId:'egg'}]});
  memory.setItem('kitchen_v2_personal_state_household',protectedPantry);
  let server=base.map(dish=>row(dish));
  realEngine.recipeSync.service={
    list:async()=>clone(server),
    publish:async(recipe,rev)=>{
      const old=server.find(r=>r.recipe_id===recipe.id);
      assert.equal(old.revision,rev);
      const next=row(recipe,rev+1);
      server=server.map(r=>r.recipe_id===recipe.id?next:r);
      return next;
    }
  };
  assert(await realEngine.recipeSync.load());
  const editTarget=realEngine.data.dishes[0];
  editTarget.sopSteps.push('本機新增 SOP 步驟');
  await realEngine.saveJson('dishes.json',realEngine.data.rawDishes);
  assert.equal(realEngine.data.dishes[0],editTarget,
    'saving must not replace the active CalculatorView recipe object');
  assert.equal(memory.getItem('kitchen_v2_personal_state_household'),protectedPantry);
  assert(JSON.parse(memory.getItem(RECIPE_CACHE_KEY)).dishes[0].sopSteps.includes('本機新增 SOP 步驟'));
  for(let i=0;i<10 && Object.keys(readRecipeQueue(memory).edits).length;i++)
    await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(server[0].revision,2);
  assert(server[0].recipe.sopSteps.includes('本機新增 SOP 步驟'));
  console.log('PASS actual Vue-reactive KitchenEngine.saveJson recipe edit preserves UI pointer and persists Supabase CAS');
}

// PostgreSQL jsonb canonicalizes EVERY nested object key order. That cannot
// be mistaken for a content change, a duplicate PATCH, or a pending conflict.
const postgresJsonbOrder = input => {
    if (Array.isArray(input)) return input.map(postgresJsonbOrder);
    if (input !== null && typeof input === 'object')
        return Object.fromEntries(Object.keys(input).sort()
            .map(key => [key,postgresJsonbOrder(input[key])]));
    return input;
};
assert.notEqual(JSON.stringify(postgresJsonbOrder(base[0])),JSON.stringify(base[0]),
    'Fixture must actually differ in raw object key order');
assert(sameRecipe(postgresJsonbOrder(base[0]),base[0]));
assert(!sameRecipe(postgresJsonbOrder({...base[0],name:'changed'}),base[0]));
const cloudJsonb=base.map(recipe=>row(postgresJsonbOrder(recipe)));
const reconciledJsonb=reconcileRecipes({
    base,local:clone(base),cloudRows:cloudJsonb,
    previousRows:cloudJsonb,queue:{owner:null,edits:{}}
});
assert.deepEqual(reconciledJsonb.legacyIds,[]);
assert.deepEqual(reconciledJsonb.conflictIds,[]);
const lostAck=store();
lostAck.setItem(RECIPE_PENDING_KEY,JSON.stringify({
    owner,edits:{[custom.id]:{revision:0,recipe:clone(custom)}}
}));
assert.equal(reconcileRecipeAcknowledgements(lostAck,owner,
    [row(postgresJsonbOrder(custom),1)]),1);
assert.deepEqual(readRecipeQueue(lostAck).edits,{});
console.log('PASS real PostgreSQL JSONB field-order changes do not create false conflicts or stalled outbox');

// Real initialize fetch must NOT run the old additive GitHub/local recipe
// merge before the cloud has validated membership and built a safe backup.
{
  const oldFetch=globalThis.fetch;
  const local=store();
  globalThis.localStorage=local;
  globalThis.window={location:{hostname:'fixture.invalid'},addEventListener(){},removeEventListener(){}};
  const oldModified=clone(base[0]);
  oldModified.recommendedProteins=[];
  oldModified.defaultIngredients=[];
  const oldSet={dishes:[oldModified,...clone(base.slice(1)),custom]};
  const untouched=JSON.stringify(oldSet);
  local.setItem(RECIPE_CACHE_KEY,untouched);
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({dishes:clone(base)})});
  try {
    const {default:RealEngine}=await import('../web/src/engine/KitchenEngine.js');
    const model=new RealEngine({auth});
    await model.fetchJson('dishes.json','rawDishes',{dishes:[]});
    assert.equal(local.getItem(RECIPE_CACHE_KEY),untouched,
      'initialization must never rewrite legacy phone recipes before a verified cloud merge');
    assert.deepEqual(model.data.rawDishes.dishes[0].recommendedProteins,[]);
    assert.deepEqual(model.data.rawDishes.dishes[0].defaultIngredients,[]);
    assert(model.data.rawDishes.dishes.some(r=>r.id===custom.id));
    assert.equal(model.recipeStaticBaseline.length,base.length);
  } finally { globalThis.fetch=oldFetch; }
}
console.log('PASS legacy dish cache remains byte-identical before cloud auth; no resurrected ingredients');
