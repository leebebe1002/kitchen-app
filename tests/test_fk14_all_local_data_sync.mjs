import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Fk14LocalDataService,sanitizeFk14Record,validateFk14Rows}
    from '../web/src/services/Fk14LocalDataService.js';
import {Fk14LocalDataCoordinator} from '../web/src/services/Fk14LocalDataCoordinator.js';
import {unresolvedRecipeIngredientIds} from '../web/src/services/SharedRecipeCoordinator.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const staticFoods=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const official=new Map(staticFoods.map(x=>[x.id,x]));
const source=JSON.parse(fs.readFileSync('src/data/favorite_foods.json','utf8')).favorites;
const foods=[
    {id:'ing_1788320234913',name:'私房測試食材 A',category:'proteins',
      photoUrl:'https://example.org/food.png',per100g:{kcal:200,protein:12,carbs:4,fat:5}},
    {id:'ing_1788924301621',name:'私房測試食材 B',category:'veggies',
      per100g:{kcal:34,protein:2,carbs:5,fat:0}}
];
const contexts={
    bebe:{userId:'fixture-bebe-uuid',scopeId:'household',token:'fixture-auth'},
    ariel:{userId:'fixture-ariel-uuid',scopeId:'ariel',token:'fixture-auth'}
};
function storage(){
 const m=new Map();
 return {m,getItem:k=>m.get(k)??null,
    setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}
let remoteCustom=new Map(),remoteFavorite=new Map(),postCount=0;
const row=(kind,item,owner,rev=1,deleted=false)=>kind==='custom'
 ?{ingredient_id:item.id,ingredient:clone(item),revision:rev,updated_by:owner}
 :{owner_user_id:owner,favorite_id:item.id,favorite:clone(item),
    revision:rev,is_deleted:deleted};
const remote={
 async list(kind,owner){
  return clone(kind==='custom'?[...remoteCustom.values()]
   :[...remoteFavorite.values()].filter(r=>r.owner_user_id===owner));
 },
 async save(kind,item,revision,{deleted=false,owner}={}){
  const map=kind==='custom'?remoteCustom:remoteFavorite;
  const key=kind==='custom'?item.id:owner+'|'+item.id;
  const previous=map.get(key);
  if((previous?.revision||0)!==revision)
   throw Object.assign(Error('CAS conflict'),{code:'FK14_DATA_CONFLICT'});
  if(kind==='custom'&&deleted)throw Error('Custom deletes forbidden');
  const next=row(kind,item,owner,revision+1,deleted);
  map.set(key,next);postCount++;
  return clone(next);
 }
};
const service={
 list(kind){return remote.list(kind,currentUser.userId)},
 save(kind,item,revision,opt){return remote.save(kind,item,revision,{...opt,owner:currentUser.userId})}
};
let currentUser=contexts.bebe;
function mockEngine(store,config={}){
 let context=config.context||currentUser;
 const auth={
     getPersonalContext:()=>context,
     isCurrentContext:c=>c===context,
     readSession:()=>null
 };
 return {
    auth,personalContext:context,personalScopeGeneration:1,
    hasPersonalAccess(){return this.personalContext===context;},
    officialIngredientById:official,officialCatalogRows:new Map(),
    sharedCustomCatalogRows:new Map(),
    data:{
      rawIngredients:Object.fromEntries(['proteins','veggies','carbs','sauces']
        .map(cat=>[cat,staticFoods.filter(x=>x.category===cat)])),
      ingredients:staticFoods.slice(),
      rawFavoriteFoods:{favorites:clone(source)},
      favoriteFoods:clone(source)
    },
    safeSetLocalStorage(key,value){store.setItem(key,JSON.stringify(value))},
    recipeSync:{active:true,sync:async()=>true},
    setContext(value){context=value;this.personalContext=value;this.personalScopeGeneration++;}
 };
}
// Actual client should reject private binary photos and keep canonical store code.
assert.equal(sanitizeFk14Record('custom',{...foods[0],photo:'blob:hello'}).photo,null);
assert.equal(sanitizeFk14Record('custom',{...foods[0],photoUrl:'data:image/png;base64,a'}).photoUrl,null);
assert(!('localPhotoRefs' in sanitizeFk14Record('custom',{...foods[0],localPhotoRefs:{photo:'blob:a'}})));
assert.throws(()=>sanitizeFk14Record('custom',{...foods[0],category:'invalid'}),/類別/);
assert.throws(()=>sanitizeFk14Record('favorite',{id:'fav-a',name:'A',photoUrl:'data:image/png;base64,AAA'}),/照片/);
assert.throws(()=>validateFk14Rows('favorite',[row('favorite',{id:'fav-a',name:'A'},contexts.bebe.userId)],contexts.ariel.userId),/帳號/);
console.log('PASS cloud schema, no Base64 persistence, categories and per-user favorite identity');

const storeB=storage();storeB.setItem('kitchen_v2_custom_ingredients',JSON.stringify(foods));
const eB=mockEngine(storeB);
const cB=new Fk14LocalDataCoordinator(eB,{kind:'custom',service,storage:storeB});
assert(await cB.load());
for(let i=0;i<15 && cB.pending;i++)await new Promise(ok=>setTimeout(ok,0));
assert.equal(remoteCustom.size,2);
assert.equal(cB.pending,0);
assert.equal(postCount,2);
assert.equal(storeB.getItem('kitchen_v2_custom_ingredients'),JSON.stringify(foods));
assert.equal(eB.recipeSync.active,true);
console.log('PASS Bebe existing device custom foods auto-backup + upsert without user manually selecting recipes');

const storeA=storage();
currentUser=contexts.ariel;
const eA=mockEngine(storeA);
const cA=new Fk14LocalDataCoordinator(eA,{kind:'custom',service,storage:storeA});
assert(await cA.load());
assert.equal(eA.data.ingredients.some(x=>x.id===foods[0].id),true);
assert.equal(eA.sharedCustomCatalogRows.size,2);
const recipe={defaultIngredients:[{id:foods[0].id,amount:10,unit:'g'}]};
assert.deepEqual(unresolvedRecipeIngredientIds(eA,recipe),[]);
assert.equal(storeA.getItem('kitchen_v2_custom_ingredients')!==null,true);
console.log('PASS Ariel retrieves same family custom IDs; recipe references now resolvable');

const localWrong=storage();
localWrong.setItem('kitchen_v2_custom_ingredients',JSON.stringify([
 {id:official.keys().next().value,name:'Malicious override',category:'proteins'}]));
const eWrong=mockEngine(localWrong);
const cWrong=new Fk14LocalDataCoordinator(eWrong,{kind:'custom',service,storage:localWrong});
assert.equal(await cWrong.load(),true,
 'Official identity conflict is isolated, not allowed to halt unrelated foods');
assert(cWrong.conflicts.includes(official.keys().next().value));
assert(cWrong.conflictDetails.some(x=>x.kind==='official_id'));
assert.equal(localWrong.getItem('kitchen_v2_custom_ingredients')!==null,true);
assert(!remoteCustom.has(official.keys().next().value));
assert(eWrong.data.ingredients.some(x=>x.id===official.keys().next().value));
console.log('PASS custom ingredient cannot masquerade as official ID, but other foods can still sync');

currentUser=contexts.bebe;
const fStore=storage(),eFav=mockEngine(fStore);
const fB=new Fk14LocalDataCoordinator(eFav,{kind:'favorite',service,storage:fStore});
assert(await fB.load());
for(let i=0;i<15 && fB.pending;i++)await new Promise(ok=>setTimeout(ok,0));
assert.equal(remoteFavorite.size,source.length);
assert.equal(fB.pending,0);
const favoriteExtra={id:'fav_local_extra',name:'經常吃的午餐',nutrients:{kcal:334,protein:23}};
await fB.saveLocal([...source,favoriteExtra]);
for(let i=0;i<15 && fB.pending;i++)await new Promise(ok=>setTimeout(ok,0));
assert(remoteFavorite.has(contexts.bebe.userId+'|'+favoriteExtra.id));
console.log('PASS Bebe personal favorite items are durable and cloud synced');

currentUser=contexts.ariel;
const favAStore=storage(),eFavA=mockEngine(favAStore);
const favA=new Fk14LocalDataCoordinator(eFavA,{kind:'favorite',service,storage:favAStore});
assert(await favA.load());
assert(!eFavA.data.favoriteFoods.some(x=>x.id===favoriteExtra.id),
 'Bebe favorites must not appear in Ariel account');
console.log('PASS household/ariel favorites never cross member RLS identity');

currentUser=contexts.bebe;
await fB.saveLocal(source);
for(let i=0;i<15 && fB.pending;i++)await new Promise(ok=>setTimeout(ok,0));
assert.equal(remoteFavorite.get(contexts.bebe.userId+'|'+favoriteExtra.id).is_deleted,true);
const bSecond=storage(),eSecond=mockEngine(bSecond);
const fB2=new Fk14LocalDataCoordinator(eSecond,{kind:'favorite',service,storage:bSecond});
assert(await fB2.load());
assert(!eSecond.data.favoriteFoods.some(x=>x.id===favoriteExtra.id));
console.log('PASS favorite deletion retains tombstone; stale second device does not resurrect deleted shortcut');

// Test CAS against a competing phone and offline edits: cloud revision must
// never be silently overwritten by the stale local copy.
const stale=storage();stale.setItem('kitchen_v2_custom_ingredients',JSON.stringify(foods));
const eStale=mockEngine(stale);
const cStale=new Fk14LocalDataCoordinator(eStale,{kind:'custom',service,storage:stale});
assert(await cStale.load());
const updated=clone(foods[0]);updated.name+=' changed by another phone';
remoteCustom.set(updated.id,row('custom',updated,contexts.bebe.userId,2));
const secondEdit=clone(foods[0]);secondEdit.name+=' stale local';
cStale.noteSavedItem(secondEdit);
for(let i=0;i<12;i++)await new Promise(ok=>setTimeout(ok,0));
assert.equal(remoteCustom.get(updated.id).ingredient.name,updated.name,
  'Stale CAS failed without overwriting newer cloud content');
assert(cStale.pending>0);
console.log('PASS remote version conflicts preserve newer cloud data and older local pending change');

const realWindow={};globalThis.window=realWindow;
let active=contexts.bebe,requests=0;
const auth={getPersonalContext:()=>active,isCurrentContext:c=>c===active};
const transport=new Fk14LocalDataService({auth,fetcher:async function(url,opts){
 assert.equal(this,realWindow,'iOS Window.fetch must have Window receiver');
 requests++;
 assert.match(opts.headers.Authorization,/^Bearer fixture-auth$/);
 const path=url.split('/rest/v1/').at(-1);
 if(opts.method==='POST'){
   const body=JSON.parse(opts.body);
   const field=path.startsWith('fk_shared_custom_ingredients')?'ingredient_id':'favorite_id';
   return {ok:true,status:201,json:async()=>[{...body,[field]:body[field],revision:1}]};
 }
 return {ok:true,status:200,json:async()=>[]};
}});
assert.deepEqual(await transport.list('custom'),[]);
assert.deepEqual(await transport.list('favorite'),[]);
const saved=await transport.save('custom',foods[0],0);
assert.equal(saved.revision,1);
active=null;
await assert.rejects(()=>transport.list('custom'),/登入/);
assert.equal(requests,3);
console.log('PASS real data adapter REST + Window.fetch binding and logged-out fail closed');

const sql=fs.readFileSync('supabase/migrations/20261109080911_fk14_local_only_food_and_favorites.sql','utf8');
assert(sql.includes('alter table public.fk_shared_custom_ingredients enable row level security'));
assert(sql.includes('alter table public.fk_member_favorite_foods enable row level security'));
assert(sql.includes('is_deleted boolean not null default false'));
assert(!sql.toLowerCase().includes('drop table'));
assert(!sql.toLowerCase().includes('delete from'));
console.log('PASS candidate migration preserves original production schema and supports favorite tombstones');

// Existing legacy IndexedDB binary photos must be uploaded before a new
// custom food is acknowledged. No persisted Base64 or fake successful sync.
{
 const photoStore=storage();
 currentUser=contexts.bebe;
 const localPhoto={
   id:'ing_photo_backup_example',name:'有二進位照片的私房食材',category:'proteins',
   photoUrl:null,localPhotoRefs:{photoUrl:'image/png:known-binary-id'}
 };
 photoStore.setItem('kitchen_v2_custom_ingredients',JSON.stringify([localPhoto]));
 const e=mockEngine(photoStore);
 let uploads=0;
 e.ingredientPhotoStore={
     async get(id){
         assert.equal(id,'image/png:known-binary-id');
         return new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'});
     }
 };
 e.supabase={async uploadIngredientPhoto(uri){
     uploads++;
     assert.match(uri,/^data:image\/png;base64,/);
     return 'https://example.org/storage/verified.png';
 }};
 const coordinator=new Fk14LocalDataCoordinator(e,{
     kind:'custom',service,storage:photoStore
 });
 assert(await coordinator.load());
 for(let i=0;i<15 && coordinator.pending;i++)await new Promise(ok=>setTimeout(ok,0));
 assert.equal(uploads,1);
 assert.equal(remoteCustom.get(localPhoto.id)?.ingredient?.photoUrl,
     'https://example.org/storage/verified.png');
 assert.equal(coordinator.pending,0);
 assert.equal(JSON.parse(photoStore.getItem('kitchen_v2_custom_ingredients'))[0].photoUrl,
     'https://example.org/storage/verified.png');
 assert(!photoStore.getItem('kitchen_v2_custom_ingredients').includes('data:image/'));
 console.log('PASS IndexedDB binary photo uploads through existing Supabase Storage before ACK');
}
// A failed image upload must NOT publish a text-only ingredient and thereby
// pretend that the photo has safely migrated.
{
 const failing=storage();
 currentUser=contexts.bebe;
 const localPhoto={id:'ing_photo_upload_failed',name:'照片尚未上傳',
     category:'veggies',photoUrl:null,localPhotoRefs:{photoUrl:'image/png:retry-id'}};
 failing.setItem('kitchen_v2_custom_ingredients',JSON.stringify([localPhoto]));
 const e=mockEngine(failing);
 e.ingredientPhotoStore={async get(){return new Blob(['photo'],{type:'image/png'});}};
 e.supabase={async uploadIngredientPhoto(){return null;}};
 const coordinator=new Fk14LocalDataCoordinator(e,{kind:'custom',service,storage:failing});
 assert(await coordinator.load());
 for(let i=0;i<5;i++)await new Promise(ok=>setTimeout(ok,0));
 assert.equal(coordinator.pending,1);
 assert(!remoteCustom.has(localPhoto.id));
 assert.equal(JSON.parse(failing.getItem('kitchen_v2_custom_ingredients'))[0].localPhotoRefs.photoUrl,
     'image/png:retry-id');
 console.log('PASS failed binary upload retains image reference and pending food (no false success)');
}

// Cross-module regression: exactly the real iPhone situation, nine local
// recipe changes referencing two initially device-only foods. Delayed custom
// uploads MUST unblock the two recipes without the owner selecting anything.
{
 const {SharedRecipeCoordinator}=await import('../web/src/services/SharedRecipeCoordinator.js');
 const {readRecipeQueue,RECIPE_PENDING_KEY}=await import('../web/src/utils/SharedRecipeState.js');
 const baseline=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
 const legacy=clone(baseline);
 for(let i=0;i<9;i++)legacy[i].sopSteps.push('已存在手機的使用者編輯 '+i);
 for(let i=0;i<2;i++)legacy[i].defaultIngredients.push({
     id:foods[i].id,amount:30,unit:'g'
 });
 const shared=storage();
 shared.setItem('kitchen_v2_custom_ingredients',JSON.stringify(foods));
 shared.setItem('kitchen_v2_dishes.json',JSON.stringify({dishes:legacy}));
 const familyPantry='{"shoppingList":[{"targetId":"fish"}]}';
 const arielPantry='{"shoppingList":[]}';
 shared.setItem('kitchen_v2_personal_state_household',familyPantry);
 shared.setItem('kitchen_v2_personal_state_ariel',arielPantry);
 currentUser=contexts.bebe;
 const e=mockEngine(shared);
 e.recipeStaticBaseline=clone(baseline);
 e.data.rawDishes={dishes:clone(legacy)};
 e.data.dishes=e.data.rawDishes.dishes;
 e.personalScopeGeneration=1;
 const familyFoods=new Map();
 const delayedCustom={
    list:async()=>clone([...familyFoods.values()]),
    save:async(kind,item,revision)=>{
       await new Promise(ok=>setTimeout(ok,3));
       const found=familyFoods.get(item.id);
       if((found?.revision||0)!==revision)throw Error('CAS conflict custom');
       const next=row('custom',item,currentUser.userId,revision+1);
       familyFoods.set(item.id,next);
       return clone(next);
    }
 };
 let familyRecipes=baseline.map(recipe=>({
     recipe_id:recipe.id,recipe:clone(recipe),revision:1
 }));
 const delayedRecipes={
    list:async()=>clone(familyRecipes),
    publish:async(item,rev)=>{
        await new Promise(ok=>setTimeout(ok,1));
        const prior=familyRecipes.find(r=>r.recipe_id===item.id);
        if((prior?.revision||0)!==rev)throw Error('CAS conflict recipe');
        const next={recipe_id:item.id,recipe:clone(item),revision:rev+1};
        familyRecipes=familyRecipes.map(r=>r.recipe_id===item.id?next:r);
        return clone(next);
    }
 };
 e.recipeSync=new SharedRecipeCoordinator(e,{service:delayedRecipes,storage:shared});
 const customC=new Fk14LocalDataCoordinator(e,{
     kind:'custom',service:delayedCustom,storage:shared
 });
 assert(await customC.load());
 assert(await e.recipeSync.load());
 for(let i=0;i<150;i++){
    const done=familyFoods.size===2 &&
        familyRecipes.filter(r=>r.revision===2).length===9 &&
        Object.keys(readRecipeQueue(shared).edits).length===0;
    if(done)break;
    await new Promise(ok=>setTimeout(ok,3));
 }
 assert.equal(familyFoods.size,2,'Both legacy private foods should now be durable in cloud');
 assert.equal(familyRecipes.filter(r=>r.revision===2).length,9,
     'Every safe legacy recipe must upload after its missing food refs are resolved');
 assert.equal(e.recipeSync.legacyIds.length,0);
 assert.equal(Object.keys(readRecipeQueue(shared).edits).length,0);
 assert.equal(shared.getItem('kitchen_v2_personal_state_household'),familyPantry);
 assert.equal(shared.getItem('kitchen_v2_personal_state_ariel'),arielPantry);
 console.log('PASS integrated initial device migration: 2 custom foods -> 9 recipes automatically, household/ariel pantry untouched');
}

const storeConflict=storage();
const validSafe={id:'ing_safe_after_collision',name:'安全自製新食材',category:'veggies',per100g:{kcal:23,protein:1}};
const officialGhost=clone(staticFoods[0]);
const sameNameDifferentId={id:'ing_same_name_legacy',name:staticFoods[1].name,category:staticFoods[1].category};
storeConflict.setItem('kitchen_v2_custom_ingredients',JSON.stringify([officialGhost,sameNameDifferentId,validSafe]));
currentUser=contexts.bebe;
remoteCustom.clear();
const engineConflict=mockEngine(storeConflict);
const syncConflict=new Fk14LocalDataCoordinator(engineConflict,{kind:'custom',service,storage:storeConflict});
assert.equal(await syncConflict.load(),true,
 'An official-id or official-name duplicate must not block unrelated local private foods');
for(let i=0;i<20 && syncConflict.pending;i++) await new Promise(resolve=>setTimeout(resolve,0));
assert(remoteCustom.has(validSafe.id),'Unrelated private food should still reach cloud');
assert(!remoteCustom.has(officialGhost.id),'Official ID must never be copied to custom catalog');
assert(!remoteCustom.has(sameNameDifferentId.id),'Same-name different-ID food needs explicit reconciliation');
assert(syncConflict.conflicts.includes(sameNameDifferentId.id));
assert.equal(engineConflict.data.ingredients.filter(x=>x.id===officialGhost.id).length,1);
assert.equal(storeConflict.getItem('kitchen_v2_custom_ingredients'),JSON.stringify([officialGhost,sameNameDifferentId,validSafe]),
 'Local private food cache including blocked originals remains byte-identical');
assert.match(syncConflict.message,/私房食材/);
console.log('PASS mixed canonical duplicate and same-name conflict allow independent safe food to sync');

const twoEqualNames=[
    {id:'ing_duplicate_a',name:'測試同名全家私房食材',category:'proteins',
     per100g:{kcal:99,protein:7,carbs:0,fat:8}},
    {id:'ing_duplicate_b',name:'測試同名全家私房食材',category:'proteins',
     per100g:{kcal:200,protein:20,carbs:2,fat:9}},
    {id:'ing_unrelated_safe',name:'測試不重複的健康食材',category:'veggies',
     per100g:{kcal:12,protein:1,carbs:3,fat:0}}
];
remoteCustom.clear();
const twoStore=storage();
twoStore.setItem('kitchen_v2_custom_ingredients',JSON.stringify(twoEqualNames));
const twoEngine=mockEngine(twoStore);
const twoSync=new Fk14LocalDataCoordinator(twoEngine,{kind:'custom',service,storage:twoStore});
assert(await twoSync.load());
for(let i=0;i<20 && twoSync.pending;i++) await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(twoSync.conflicts.sort(),['ing_duplicate_a','ing_duplicate_b'].sort(),
 'Both ambiguous local duplicate names must remain unshared');
assert(!remoteCustom.has('ing_duplicate_a'));
assert(!remoteCustom.has('ing_duplicate_b'));
assert(remoteCustom.has('ing_unrelated_safe'));
assert.equal(twoSync.conflictDetails.filter(x=>x.kind==='custom_name').length,2);
assert.match(twoSync.message,/需核對/);
assert.equal(twoStore.getItem('kitchen_v2_custom_ingredients'),JSON.stringify(twoEqualNames));
console.log('PASS two unsynced same-name foods are BOTH protected; unrelated private food still syncs');

// A stale pending custom food must not be sent even when the previous sync
// batch was blocked; the following unrelated pending food still succeeds.
const waiting=storage();
waiting.setItem('kitchen_v2_custom_ingredients',JSON.stringify([
  sameNameDifferentId,validSafe,
  {id:'ing_new_valid_queue',name:'暫存安全新食材',category:'veggies',
   per100g:{kcal:17,protein:3,carbs:1,fat:0}}
]));
const queueEngine=mockEngine(waiting);
const queueCoordinator=new Fk14LocalDataCoordinator(queueEngine,{kind:'custom',service,storage:waiting});
assert(await queueCoordinator.load());
for(let i=0;i<20 && queueCoordinator.pending;i++) await new Promise(resolve=>setTimeout(resolve,0));
assert(queueCoordinator.conflicts.includes(sameNameDifferentId.id));
queueCoordinator.stage(contexts.bebe.userId,sameNameDifferentId,0);
const extraLocal={id:'ing_manual_queue_safe',name:'佇列其他安全食材',category:'proteins',
  per100g:{kcal:175,protein:12,carbs:1,fat:10}};
queueCoordinator.stage(contexts.bebe.userId,extraLocal,0);
assert.equal(await queueCoordinator.sync(),false,'Blocked queue must not be marked fully synced');
assert(remoteCustom.has(extraLocal.id),'An independent safe outbox task must succeed after a conflict');
assert(!remoteCustom.has(sameNameDifferentId.id));
assert(queueCoordinator.getQueue(contexts.bebe.userId)[sameNameDifferentId.id]);
assert(!queueCoordinator.getQueue(contexts.bebe.userId)[extraLocal.id]);
assert.equal(waiting.getItem('kitchen_v2_custom_ingredients')?.includes(sameNameDifferentId.id),true);
console.log('PASS old blocked outbox task cannot starve independent safe CAS write');

// Canonical ID with different nutritional content must not be allowed to
// shadow any official SSOT calculator reference or override the official row.
remoteCustom.clear();
const idConflictStore=storage();
const conflictingOfficial={...staticFoods[0],name:'誤寫了不同名稱',per100g:{kcal:99999}};
const nonConflicting={id:'ing_untouched_new_valid',name:'與官方不同的私房食材',category:'veggies',
  per100g:{kcal:20,protein:2,carbs:3,fat:0}};
idConflictStore.setItem('kitchen_v2_custom_ingredients',
  JSON.stringify([conflictingOfficial,nonConflicting]));
const eIdConflict=mockEngine(idConflictStore);
const idSync=new Fk14LocalDataCoordinator(eIdConflict,{kind:'custom',service,storage:idConflictStore});
assert(await idSync.load());
for(let i=0;i<15 && idSync.pending;i++)await new Promise(resolve=>setTimeout(resolve,0));
assert(idSync.conflicts.includes(conflictingOfficial.id));
assert(idSync.conflictDetails.some(x=>x.id===conflictingOfficial.id && x.kind==='official_id'));
assert(!remoteCustom.has(conflictingOfficial.id));
assert(remoteCustom.has(nonConflicting.id));
assert.equal(eIdConflict.data.ingredients.find(x=>x.id===conflictingOfficial.id).name,
 staticFoods[0].name);
assert.equal(idConflictStore.getItem('kitchen_v2_custom_ingredients'),
 JSON.stringify([conflictingOfficial,nonConflicting]));
console.log('PASS same canonical ID with different nutrition stays local, official calculation intact');
