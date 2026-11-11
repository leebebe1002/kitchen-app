import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {applyFk14OfficialRepair,recoverFk14OfficialRepair,retireFk14Cocoa,withoutRetiredRecipeIngredients,
 FK14_OFFICIAL_REPAIR_KEY,FK14_COCOA_RETIREMENT_KEY,FK14_SNOW_REPAIR_KEY,isFk14KnownNutritionDifference} from '../web/src/utils/Fk14OfficialNutritionRepair.js';
import {approvedIngredientBaseline,INGREDIENT_CACHE_KEY,CUSTOM_INGREDIENT_KEY} from '../web/src/utils/IngredientBaselineUpdate.js';
import {authorizeTestEngine} from './personal_scope_fixture.mjs';
import {auditIngredientNutrition,formatIngredientNutritionAudit} from '../web/src/utils/IngredientNutritionAudit.js';
const officialText=fs.readFileSync('src/data/ingredients.json','utf8');
const official=await approvedIngredientBaseline(officialText);
const historicalText=execFileSync('git',['show','3bfe912:src/data/ingredients.json'],{encoding:'utf8'});
const historical=JSON.parse(historicalText);
const historicalDishes=JSON.parse(execFileSync('git',['show','3bfe912:src/data/dishes.json'],{encoding:'utf8'}));
const find=(data,id)=>Object.values(data).flat().find(i=>i.id===id);
assert.equal(Object.values(official).flat().length,100);assert(!find(official,'cocoa_powder'));
assert(!fs.readFileSync('src/data/dishes.json','utf8').includes('cocoa_powder'));
const original=structuredClone(historical);
original.veggies=original.veggies.filter(i=>i.id!=='snow_white_mushroom');
const cocoa=find(original,'cocoa_powder');
cocoa.per100g={kcal:416.67,protein:33.33,carbs:50,fat:8.33,sodium:0};
cocoa.perServing={kcal:25,protein:2,carbs:3,fat:.5,sodium:0};
cocoa.servingSize=6;cocoa.servingUnit='g';cocoa.weightBasis='as_sold';cocoa.nutritionCache={edited:true};
cocoa.photoUrl='https://example.test/cocoa.png';cocoa.price=120;
const beech=find(original,'beech_mushroom');beech.name='雪白菇';
const custom=[structuredClone(beech),structuredClone(cocoa)];
const protectedKeys=['kitchen_v2_personal_state_household','kitchen_v2_personal_state_ariel','kitchen_v2_dishes.json','kitchen_v2_daily_logs.json'];
const base=new Map([[INGREDIENT_CACHE_KEY,JSON.stringify(original)],[CUSTOM_INGREDIENT_KEY,JSON.stringify(custom)],
 ...protectedKeys.map(k=>[k,JSON.stringify({keep:k})])]);
let state,fail;
const storage={getItem:k=>state.get(k)??null,setItem(k,v){if(fail?.(k,v))throw Error('quota');state.set(k,String(v));},removeItem:k=>state.delete(k)};
const seed=()=>{state=new Map(base);fail=null;};
const photoStore={get:async()=>{throw Error('Unexpected photo read')},put:async()=>{throw Error('Unexpected photo write')}};
globalThis.localStorage=storage;globalThis.sessionStorage=storage;
globalThis.window={location:{hostname:'fixture.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.Vue={reactive:x=>x};globalThis.fetch=async()=>({ok:true,text:async()=>officialText});
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const unchanged=()=>{for(const k of protectedKeys)assert.equal(state.get(k),base.get(k),k)};
seed();
const retired=await retireFk14Cocoa({storage,photoStore});
assert(!find(retired,'cocoa_powder'));assert.equal(Object.values(retired).flat().length,99);
assert(!JSON.parse(state.get(CUSTOM_INGREDIENT_KEY)).some(i=>i.id==='cocoa_powder'));
for(const item of Object.values(original).flat())if(item.id!=='cocoa_powder')assert.deepEqual(find(retired,item.id),item);
const retirement=JSON.parse(state.get(FK14_COCOA_RETIREMENT_KEY));
assert.equal(JSON.parse(retirement.before[INGREDIENT_CACHE_KEY]).sauces.find(i=>i.id==='cocoa_powder').photoUrl,cocoa.photoUrl);
assert.equal(retirement.status,'complete');unchanged();
const after=new Map(state);assert.equal(await retireFk14Cocoa({storage,photoStore}),null);assert.deepEqual(state,after);
// Same canonical ID reintroduced by an old tab is retired again without losing the original backup.
state.set(CUSTOM_INGREDIENT_KEY,JSON.stringify(custom));await retireFk14Cocoa({storage,photoStore});
assert.equal(JSON.parse(state.get(FK14_COCOA_RETIREMENT_KEY)).original[INGREDIENT_CACHE_KEY],base.get(INGREDIENT_CACHE_KEY));
for(const dish of historicalDishes.dishes){const input=JSON.stringify(dish),next=withoutRetiredRecipeIngredients(dish);assert(!JSON.stringify(next).includes('cocoa_powder'));assert.equal(JSON.stringify(dish),input);}
seed();const privateCocoa={id:'private_cocoa',name:'可可粉',category:'sauces',photoUrl:'https://example.test/private.png'};
state.set(CUSTOM_INGREDIENT_KEY,JSON.stringify([...custom,privateCocoa]));
await retireFk14Cocoa({storage,photoStore});assert.deepEqual(JSON.parse(state.get(CUSTOM_INGREDIENT_KEY)).find(i=>i.id==='private_cocoa'),privateCocoa);
console.log('PASS: authorized cocoa retirement, exact full backup, private metadata and all scopes/history preserved, repeat-safe');
for(const key of [FK14_COCOA_RETIREMENT_KEY,FK14_SNOW_REPAIR_KEY])for(const phase of ['journal','custom','cache','complete']){
 seed();if(key===FK14_SNOW_REPAIR_KEY)await retireFk14Cocoa({storage,photoStore});
 const saved=new Map(state);let fired=false;
 fail=(k,v)=>{const hit=(phase==='journal'&&k===key)||(phase==='custom'&&k===CUSTOM_INGREDIENT_KEY)||(phase==='cache'&&k===INGREDIENT_CACHE_KEY)||(phase==='complete'&&k===key&&JSON.parse(v).status==='complete');if(hit&&!fired){fired=true;return true}return false};
 await assert.rejects(key===FK14_COCOA_RETIREMENT_KEY?retireFk14Cocoa({storage,photoStore}):applyFk14OfficialRepair(official,{storage,photoStore}));
 for(const k of [INGREDIENT_CACHE_KEY,CUSTOM_INGREDIENT_KEY,...protectedKeys])assert.equal(state.get(k),saved.get(k),phase+':'+k);
}
for(const journalKey of [FK14_OFFICIAL_REPAIR_KEY,FK14_COCOA_RETIREMENT_KEY,FK14_SNOW_REPAIR_KEY]){
 seed();state.set(journalKey,JSON.stringify({status:'pending',before:{[INGREDIENT_CACHE_KEY]:base.get(INGREDIENT_CACHE_KEY),[CUSTOM_INGREDIENT_KEY]:base.get(CUSTOM_INGREDIENT_KEY)}}));
 state.set(INGREDIENT_CACHE_KEY,'interrupted');recoverFk14OfficialRepair(storage);assert.equal(state.get(INGREDIENT_CACHE_KEY),base.get(INGREDIENT_CACHE_KEY));
}
seed();const saved=new Map(state);await assert.rejects(retireFk14Cocoa({storage,photoStore,isCurrent:()=>false}),/登入或食材已變更/);assert.deepEqual(state,saved);
const photo=structuredClone(original);find(photo,'cocoa_powder').photoUrl='data:image/png;base64,AQIDBA==';state.set(INGREDIENT_CACHE_KEY,JSON.stringify(photo));
const photoBefore=new Map(state);
await assert.rejects(retireFk14Cocoa({storage,photoStore}));assert.deepEqual(state,photoBefore);
const blobs=new Map(),binaryPhotos={put:async(k,v)=>blobs.set(k,v),get:async k=>blobs.get(k)};
await retireFk14Cocoa({storage,photoStore:binaryPhotos});assert(blobs.size>0);
const safeBackup=state.get(FK14_COCOA_RETIREMENT_KEY);assert(!safeBackup.includes('data:image'));
assert(find(JSON.parse(JSON.parse(safeBackup).before[INGREDIENT_CACHE_KEY]),'cocoa_powder').localPhotoRefs.photoUrl);
console.log('PASS: both transactions 4 failure points, legacy/current crash recovery, auth and binary-photo backups');

const setupEngine=async()=>{
 seed();await retireFk14Cocoa({storage,photoStore});const e=new Engine({photoStore});authorizeTestEngine(e);
 e.data.rawIngredients=e.mergeUserState('ingredients.json',JSON.parse(state.get(INGREDIENT_CACHE_KEY)),official);
 e.data.ingredients=Object.values(e.data.rawIngredients).flat();e.sharedNutritionService={list:async()=>[]};return e;
};
const real=await setupEngine();
const report=await auditIngredientNutrition(real);assert(isFk14KnownNutritionDifference(report));
assert.deepEqual([report.officialCount,report.matched,report.missing,report.privateCount],[100,99,1,0]);
assert(await real.repairFk14OfficialNutrition());
real.data.rawIngredients=real.mergeUserState('ingredients.json',JSON.parse(state.get(INGREDIENT_CACHE_KEY)),official);
real.data.ingredients=Object.values(real.data.rawIngredients).flat();
const verified=await auditIngredientNutrition(real);assert.equal(verified.matched,100);assert.equal(verified.different,0);assert(!real.data.ingredients.some(i=>i.id==='cocoa_powder'));unchanged();
assert.equal(find(real.data.rawIngredients,'beech_mushroom').name,'鴻喜菇');
assert.equal(await applyFk14OfficialRepair(official,{storage,photoStore}),null);
for(const field of ['matched','different','missing','duplicates','privateCount','sharedCount','officialCount'])assert(!isFk14KnownNutritionDifference({...report,[field]:-1}),field);
for(const scope of ['ariel',null]){
 const e=await setupEngine();if(scope)authorizeTestEngine(e,scope);else e.hasPersonalAccess=()=>false;
 const before=new Map(state);await assert.rejects(e.repairFk14OfficialNutrition(),/僅適用/);assert.deepEqual(state,before);
}
const ambiguous=await setupEngine();
state.set(CUSTOM_INGREDIENT_KEY,JSON.stringify([{id:'private_snow',name:'雪白菇'}]));const ambiguousBefore=new Map(state);
await assert.rejects(applyFk14OfficialRepair(official,{storage,photoStore}),/私人食材同名/);assert.deepEqual(state,ambiguousBefore);
await assert.rejects(ambiguous.saveIngredient({...cocoa}),/已由全家共用食材庫移除/);
for(const scenario of ['offline','shared','changed','concurrent']){
 const e=await setupEngine();const before=new Map(state);
 if(scenario==='offline')globalThis.fetch=async()=>{throw Error('offline')};
 if(scenario==='shared')e.sharedNutritionService.list=async()=>[{ingredient_id:'egg'}];
 if(scenario==='changed')e.data.ingredients.push(structuredClone(e.data.ingredients[0]));
 if(scenario==='concurrent'){let calls=0;e.sharedNutritionService.list=async()=>{if(++calls===2)state.set(CUSTOM_INGREDIENT_KEY,'[]');return []};}
 await assert.rejects(e.repairFk14OfficialNutrition());
 if(scenario!=='concurrent')assert.deepEqual(state,before);
 else assert.equal(state.get(INGREDIENT_CACHE_KEY),before.get(INGREDIENT_CACHE_KEY));
 globalThis.fetch=async()=>({ok:true,text:async()=>officialText});
}
// Neither a historical approved baseline nor a stale tab may restore retired cocoa.
{
 const e=await setupEngine();const before=new Map(state);
 globalThis.fetch=async()=>({ok:true,text:async()=>historicalText});
 await assert.rejects(e.adoptIngredientBaseline(),/舊版/);assert.deepEqual(state,before);
 globalThis.fetch=async()=>({ok:true,text:async()=>officialText});
 state.set(CUSTOM_INGREDIENT_KEY,JSON.stringify(custom));const staleBefore=new Map(state);
 await assert.rejects(e.adoptIngredientBaseline(),/再次出現/);assert.deepEqual(state,staleBefore);
}
// Exercise the real initialization order with isolated I/O only.
for(const scope of ['household','ariel',null]){
 seed();const e=new Engine({photoStore});if(scope)authorizeTestEngine(e,scope);
 e.initializePersonalKitchenState=async()=>{};e.initializeMealLogs=async()=>{};e.maybeAdoptOfficialArielIngredients=async()=>{};
 e.loadSharedIngredientNutrition=async()=>{};e.syncPersonalKitchenState=async()=>{};e.syncWithCloud=async()=>{};
 e.fetchJson=async(name,key,fallback)=>{
  e.data[key]=name==='ingredients.json'?e.mergeUserState(name,structuredClone(original),structuredClone(official)):name==='dishes.json'?structuredClone(historicalDishes):fallback;
  if(name==='ingredients.json')state.set(INGREDIENT_CACHE_KEY,JSON.stringify(e.data[key]));
 };
 const log=console.log;console.log=()=>{};try{await e.initialize();}finally{console.log=log;}
 if(scope){assert(!e.data.ingredients.some(i=>i.id==='cocoa_powder'));assert(state.has(FK14_COCOA_RETIREMENT_KEY));}
 else assert(!state.has(FK14_COCOA_RETIREMENT_KEY),'No anonymous retirement write');
 assert(!e.data.ingredients.some(i=>i.id==='cocoa_powder'),'Retired official ID is never an active ingredient, including read-only mode');
 assert(!JSON.stringify(e.data.dishes).includes('cocoa_powder'));
 e.data.dishes[0].name='edited recipe';assert.equal(e.data.rawDishes.dishes[0].name,'edited recipe','Recipe edits must still reach the save source');unchanged();
}
console.log('PASS: actual Engine initialization, household/ariel/no-login, exact snow repair and real audit 100/100');
const Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
let App,mounted,answer=false,confirms=0,repairs=0,reloads=0,auditResult=report,auditError=null,repairError=null,pauseAudit=null;
const listeners={};const session=new Map();
const fakeEngine={personalScope:'household',data:{ingredientBaselineApplied:true},sharedNutritionMessage:'100 official',
 hasPersonalAccess:()=>true,initialize:async()=>{},clearPersonalScope(){},
 repairFk14OfficialNutrition:async()=>{repairs++;if(repairError)throw repairError;return true;}};
const source=fs.readFileSync('web/src/main.js','utf8').replace(/^import .*;$/gm,'');
vm.runInNewContext(source,{
 Vue:{...Vue,onMounted:fn=>mounted=fn,onBeforeUnmount(){},createApp:a=>{App=a;return{mount(){}}}},
 KitchenEngine:function(){return fakeEngine},CalculatorView:{},TrackerView:{},PantryView:{},ShoppingView:{},
 authService:{message:'ready',user:{email:'fixture@example.invalid'},initialize:async()=>{},subscribe:()=>()=>{}},
 isFk14KnownNutritionDifference,formatIngredientNutritionAudit,
 auditIngredientNutrition:async()=>{if(pauseAudit)await pauseAudit;if(auditError)throw auditError;return auditResult;},
 sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},
 document:{hidden:false,body:{classList:{remove(){}}},addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}},
 window:{location:{reload:()=>reloads++},addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}},
 confirm:message=>{assert.match(message,/先備份/);confirms++;return answer;},console
});
const render=Vue.compile(App.template,{decodeEntities:t=>t,onError:e=>{throw e;}});
let ui=App.setup();await mounted();ui.showAccount.value=true;
assert.equal(confirms,0,'Initialization never confirms');
const nodes=()=>{
 const out=[];function visit(n){if(!n)return;if(Array.isArray(n))return n.forEach(visit);if(typeof n!=='object')return;out.push(n);visit(n.children);}
 visit(render(Vue.proxyRefs(ui),[]));return out;
};
const checkButton=()=>nodes().find(n=>n.type==='button'&&String(n.children).includes('已知差異會詢問修復'));
const text=()=>nodes().filter(n=>typeof n.children==='string').map(n=>n.children).join(' ');
await checkButton().props.onClick();
assert.equal(confirms,1);assert.equal(repairs,0);assert.equal(reloads,0);
assert.match(text(),/已取消修復.*仍只檢查/,'Cancellation remains visible with backup repair button');
assert(nodes().some(n=>n.type==='button'&&String(n.children).includes('備份並修復雪白菇')));
for(const bad of [{...report,privateCount:1},{...report,duplicates:1},{...report,sharedCount:1},{...report,scope:'ariel'}]){
 auditResult=bad;await checkButton().props.onClick();assert.equal(confirms,1);
}
auditResult=report;fakeEngine.personalScope='ariel';await checkButton().props.onClick();assert.equal(confirms,1);
fakeEngine.personalScope='household';ui.currentUser.value=null;await checkButton().props.onClick();assert.equal(confirms,1);
ui.currentUser.value={email:'fixture@example.invalid'};
answer=true;repairError=Error('儲存失敗，已還原舊食材');await checkButton().props.onClick();
assert.match(text(),/儲存失敗，已還原舊食材/);assert.equal(reloads,0);
repairError=null;auditError=Error('連線中斷');await checkButton().props.onClick();assert.match(text(),/連線中斷/);
auditError=null;
let release;pauseAudit=new Promise(r=>release=r);const click=checkButton().props.onClick;const pending=click();
const beforeConfirms=confirms;await click();assert.equal(confirms,beforeConfirms);
release();await pending;pauseAudit=null;
assert.equal(reloads,1);assert.equal(session.get('fk14_two_item_recheck'),'pending');
// Simulate reload and background authorization, exercising the mounted control flow.
auditResult=verified;ui=App.setup();await mounted();
assert.match(ui.nutritionAudit.value.message,/自動驗證通過：100／100/);
assert.equal(ui.showAccount.value,true);assert.equal(session.get('fk14_two_item_recheck'),'checked');
const confirmed=confirms;await listeners.pageshow();await listeners.visibilitychange();assert.equal(confirms,confirmed);
for(const outcome of ['different','offline']){
 session.set('fk14_two_item_recheck','pending');auditResult=report;auditError=outcome==='offline'?Error('驗證連線失敗'):null;
 ui=App.setup();await mounted();assert.equal(confirms,confirmed);
 assert(!ui.nutritionAudit.value.message.includes('驗證通過'));
 assert.match(ui.nutritionAudit.value.message,outcome==='offline'?/驗證連線失敗/:/仍有 1 項差異/);
}
console.log('PASS: full Vue render/click/cancel/error/double-click/reload/background-auth control flow');
// Entry and modified import chain have one exact URL per module.
assert(fs.readFileSync('web/index.html','utf8').includes('main.js?v=20261111_FK21_REVIEW_DEDUP_V1'));
const engineSource=fs.readFileSync('web/src/engine/KitchenEngine.js','utf8');
assert(fs.readFileSync('web/src/main.js','utf8').includes('KitchenEngine.js?v=20261111_FK21_ROUNDING_V1'));
for(const path of ['web/src/main.js','web/src/engine/KitchenEngine.js'])
 assert(fs.readFileSync(path,'utf8').includes('Fk14OfficialNutritionRepair.js?v=20261109_FK21_THREE_FOODS_V2'));
assert(engineSource.includes('IngredientNutritionAudit.js?v=20261109_FK21_THREE_FOODS_V2'));
console.log('PASS: modified version chain and shared repair/audit URLs');
