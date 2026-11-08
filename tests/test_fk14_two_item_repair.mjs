import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyFk14OfficialRepair,recoverFk14OfficialRepair,FK14_OFFICIAL_REPAIR_KEY,isFk14KnownNutritionDifference} from '../web/src/utils/Fk14OfficialNutritionRepair.js';
import {approvedIngredientBaseline,INGREDIENT_CACHE_KEY,CUSTOM_INGREDIENT_KEY} from '../web/src/utils/IngredientBaselineUpdate.js';
const official=await approvedIngredientBaseline(fs.readFileSync('src/data/ingredients.json','utf8'));
const original=structuredClone(official);
const find=(data,id)=>Object.values(data).flat().find(i=>i.id===id);
original.veggies=original.veggies.filter(i=>i.id!=='snow_white_mushroom');
const cocoa=find(original,'cocoa_powder');
cocoa.per100g={kcal:416.67,protein:33.33,carbs:50,fat:8.33,sodium:0};
cocoa.perServing={kcal:25,protein:2,carbs:3,fat:0.5,sodium:0};
cocoa.servingSize=6;cocoa.servingUnit='g';cocoa.weightBasis='as_sold';cocoa.nutritionCache={edited:true};
cocoa.photoUrl='https://example.test/cocoa.png';cocoa.price=120;cocoa.preferredStore='EC';
const beech=find(original,'beech_mushroom');beech.name='雪白菇';
const custom=[structuredClone(beech),structuredClone(cocoa)];
const base=new Map([[INGREDIENT_CACHE_KEY,JSON.stringify(original)],[CUSTOM_INGREDIENT_KEY,JSON.stringify(custom)],['kitchen_v2_personal_state_household','household-never-write'],['kitchen_v2_personal_state_ariel','ariel-never-write'],['kitchen_v2_dishes.json','recipes-never-write']]);
let state,fail;
const storage={getItem:k=>state.get(k)??null,setItem(k,v){if(fail?.(k,v))throw Error('quota');state.set(k,String(v));},removeItem:k=>state.delete(k)};
const seed=()=>{state=new Map(base);fail=null;};
const photoStore={get:async()=>{throw Error('Unexpected photo read');},put:async()=>{throw Error('Unexpected photo write');}};
globalThis.localStorage=storage;globalThis.sessionStorage=storage;globalThis.window={location:{hostname:'test.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.Vue={reactive:x=>x};globalThis.fetch=async()=>{throw Error('Unexpected network');};
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
seed();
const engine=new Engine();
const beforeMerge=engine.mergeUserState('ingredients.json',structuredClone(original),structuredClone(official));
assert(!find(beforeMerge,'snow_white_mushroom'),'Known alias suppresses official snow');
assert.equal(find(beforeMerge,'cocoa_powder').per100g.kcal,416.67);
const updated=await applyFk14OfficialRepair(official,{storage,photoStore});
assert.equal(find(updated,'snow_white_mushroom').per100g.kcal,36);
assert.equal(find(updated,'beech_mushroom').name,'鴻喜菇');
assert.equal(find(updated,'cocoa_powder').per100g.kcal,228);
assert.equal(find(updated,'cocoa_powder').perServing,undefined);
assert.equal(find(updated,'cocoa_powder').weightBasis,'dry');
for (const field of ['photoUrl','price','preferredStore']) assert.equal(find(updated,'cocoa_powder')[field],cocoa[field]);
for(const item of Object.values(original).flat()) if(!['cocoa_powder','beech_mushroom'].includes(item.id))
 assert.deepEqual(find(updated,item.id),item,'Unrelated official/local foods must be unchanged: '+item.id);
const localCustom=JSON.parse(state.get(CUSTOM_INGREDIENT_KEY));
assert.equal(localCustom.find(i=>i.id==='cocoa_powder').per100g.kcal,228);
assert.equal(localCustom.find(i=>i.id==='beech_mushroom').name,'鴻喜菇');
const merged=engine.mergeUserState('ingredients.json',updated,official);
assert.equal(Object.values(merged).flat().length,101);
assert.equal(find(merged,'snow_white_mushroom').per100g.kcal,36);
assert.equal(find(merged,'cocoa_powder').per100g.kcal,228);
for(const key of ['kitchen_v2_personal_state_household','kitchen_v2_personal_state_ariel','kitchen_v2_dishes.json'])assert.equal(state.get(key),base.get(key));
assert.equal(recoverFk14OfficialRepair(storage),true);
assert.equal(await applyFk14OfficialRepair(official,{storage,photoStore}),null);
console.log('PASS: exact audit issue, 101 on remerge, preservation of unrelated states, once only');
seed();const before=new Map(state);
await assert.rejects(applyFk14OfficialRepair(official,{storage,photoStore,isCurrent:()=>false}),/登入或食材資料已變更/);
assert.deepEqual(state,before);
const branded=structuredClone(original);find(branded,'cocoa_powder').brand='別牌';
state.set(INGREDIENT_CACHE_KEY,JSON.stringify(branded));const brandedBefore=new Map(state);
await assert.rejects(applyFk14OfficialRepair(official,{storage,photoStore}),/品牌或規格不同/);
assert.deepEqual(state,brandedBefore);
seed();const privateSnow={id:'private_snow',name:'雪白菇',category:'veggies',unitLabel:'g',per100g:{kcal:50}};
state.set(CUSTOM_INGREDIENT_KEY,JSON.stringify([...custom,privateSnow]));const privateBefore=new Map(state);
await assert.rejects(applyFk14OfficialRepair(official,{storage,photoStore}),/私人食材同名/);
assert.deepEqual(state,privateBefore);
console.log('PASS: auth callback, brand identity, and ambiguous custom collision fail closed');
for(const phase of ['journal','custom','cache','complete']){
 seed();const saved=new Map(state);let fired=false;
 fail=(k,v)=>{const hit=(phase==='journal'&&k===FK14_OFFICIAL_REPAIR_KEY)||(phase==='custom'&&k===CUSTOM_INGREDIENT_KEY)||(phase==='cache'&&k===INGREDIENT_CACHE_KEY)||(phase==='complete'&&k===FK14_OFFICIAL_REPAIR_KEY&&JSON.parse(v).status==='complete');if(hit&&!fired){fired=true;return true;}return false;};
 await assert.rejects(applyFk14OfficialRepair(official,{storage,photoStore}));
 assert.equal(state.get(INGREDIENT_CACHE_KEY),saved.get(INGREDIENT_CACHE_KEY));
 assert.equal(state.get(CUSTOM_INGREDIENT_KEY),saved.get(CUSTOM_INGREDIENT_KEY));
 assert.equal(state.get('kitchen_v2_personal_state_ariel'),saved.get('kitchen_v2_personal_state_ariel'));
}
seed();
state.set(FK14_OFFICIAL_REPAIR_KEY,JSON.stringify({status:'pending',before:{[INGREDIENT_CACHE_KEY]:state.get(INGREDIENT_CACHE_KEY),[CUSTOM_INGREDIENT_KEY]:state.get(CUSTOM_INGREDIENT_KEY)}}));
state.set(INGREDIENT_CACHE_KEY,'interrupted');
assert.equal(recoverFk14OfficialRepair(storage),false);
assert.equal(state.get(INGREDIENT_CACHE_KEY),base.get(INGREDIENT_CACHE_KEY));
console.log('PASS: 4 storage failures, rollback, interrupted crash recovery');
// Use the real audit to derive the exact phone report, including nullable fields.
const {authorizeTestEngine}=await import('./personal_scope_fixture.mjs');
const {auditIngredientNutrition,formatIngredientNutritionAudit}=await import('../web/src/utils/IngredientNutritionAudit.js');
const setupEngine=()=>{
 seed();const e=new Engine({photoStore});authorizeTestEngine(e);
 e.data.rawIngredients=structuredClone(original);
 e.data.ingredients=Object.values(original).flat();
 e.sharedNutritionService={list:async()=>[]};return e;
};
globalThis.fetch=async()=>({ok:true,text:async()=>fs.readFileSync('src/data/ingredients.json','utf8')});
const reportEngine=setupEngine();
for(const key of ['isCount','perUnit','gramsPerPack','gramsPerUnit'])find(reportEngine.data.rawIngredients,'cocoa_powder')[key]=null;
const report=await auditIngredientNutrition(reportEngine);
assert(isFk14KnownNutritionDifference(report));
for(const field of ['matched','different','missing','duplicates','privateCount','sharedCount','officialCount']){
 assert(!isFk14KnownNutritionDifference({...report,[field]:-1}),field);
}
for(const change of [
 r=>r.scope='ariel',r=>r.differences[0].reason='another reason',
 r=>r.differences.find(i=>i.id==='cocoa_powder').fields[0].actual='999',
 r=>r.differences.find(i=>i.id==='cocoa_powder').fields.pop(),
 r=>r.differences.find(i=>i.id==='cocoa_powder').fields.push({field:'unknown',actual:'1',expected:'2'})
]){const r=structuredClone(report);change(r);assert(!isFk14KnownNutritionDifference(r));}
// Real Engine repair and actual audit after remerge; no personal/remote writes.
const real=setupEngine();
assert(await real.repairFk14OfficialNutrition());
real.data.rawIngredients=real.mergeUserState('ingredients.json',JSON.parse(state.get(INGREDIENT_CACHE_KEY)),official);
real.data.ingredients=Object.values(real.data.rawIngredients).flat();
const verified=await auditIngredientNutrition(real);
assert.equal(verified.matched,101);assert.equal(verified.different,0);
for(const scope of ['ariel',null]){
 const e=setupEngine();if(scope)authorizeTestEngine(e,scope);else e.hasPersonalAccess=()=>false;
 const saved=new Map(state);await assert.rejects(e.repairFk14OfficialNutrition(),/僅適用/);assert.deepEqual(state,saved);
}
for(const scenario of ['offline','shared','changed','concurrent']){
 const e=setupEngine();const saved=new Map(state);
 if(scenario==='offline')globalThis.fetch=async()=>{throw Error('offline')};
 if(scenario==='shared')e.sharedNutritionService.list=async()=>[{ingredient_id:'egg'}];
 if(scenario==='changed')e.data.ingredients.find(i=>i.id==='cocoa_powder').per100g.kcal=999;
 if(scenario==='concurrent'){
  let calls=0;e.sharedNutritionService.list=async()=>{if(++calls===2)state.set(CUSTOM_INGREDIENT_KEY,'[]');return []};
 }
 await assert.rejects(e.repairFk14OfficialNutrition());
 if(scenario!=='concurrent')assert.deepEqual(state,saved);
 else assert.equal(state.get(INGREDIENT_CACHE_KEY),saved.get(INGREDIENT_CACHE_KEY));
 globalThis.fetch=async()=>({ok:true,text:async()=>fs.readFileSync('src/data/ingredients.json','utf8')});
}
console.log('PASS: exact real report gate, real Engine 101/101, scope/offline/shared/concurrency protection');

const Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
let App,mounted,answer=false,confirms=0,repairs=0,reloads=0,auditResult=report,auditError=null,repairError=null,pauseAudit=null;
const listeners={};const session=new Map();
const fakeEngine={personalScope:'household',data:{ingredientBaselineApplied:true},sharedNutritionMessage:'101 official',
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
assert.match(ui.nutritionAudit.value.message,/自動驗證通過：101／101/);
assert.equal(ui.showAccount.value,true);assert.equal(session.get('fk14_two_item_recheck'),'checked');
const confirmed=confirms;await listeners.pageshow();await listeners.visibilitychange();assert.equal(confirms,confirmed);
for(const outcome of ['different','offline']){
 session.set('fk14_two_item_recheck','pending');auditResult=report;auditError=outcome==='offline'?Error('驗證連線失敗'):null;
 ui=App.setup();await mounted();assert.equal(confirms,confirmed);
 assert(!ui.nutritionAudit.value.message.includes('驗證通過'));
 assert.match(ui.nutritionAudit.value.message,outcome==='offline'?/驗證連線失敗/:/仍有 2 項差異/);
}
console.log('PASS: full Vue render/click/cancel/error/double-click/reload/background-auth control flow');
// Entry and modified import chain have one exact URL per module.
assert(fs.readFileSync('web/index.html','utf8').includes('main.js?v=20261108_FK14_CHECK_CONFIRM_V1'));
const engineSource=fs.readFileSync('web/src/engine/KitchenEngine.js','utf8');
assert(fs.readFileSync('web/src/main.js','utf8').includes('KitchenEngine.js?v=20261108_FK14_CHECK_CONFIRM_V1'));
for(const path of ['web/src/main.js','web/src/engine/KitchenEngine.js'])
 assert(fs.readFileSync(path,'utf8').includes('Fk14OfficialNutritionRepair.js?v=20261108_FK14_CHECK_CONFIRM_V1'));
assert(engineSource.includes('IngredientNutritionAudit.js?v=20261108_FK14_READONLY_AUDIT_V1'));
console.log('PASS: modified version chain and shared repair/audit URLs');
