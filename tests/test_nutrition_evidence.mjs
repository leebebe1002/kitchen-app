import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { officialNutritionEvidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { withNutritionEvidence, evidenceSnapshot, nutrientNumber, nutritionEvidenceIssue, labelConsistencyIssue } from '../web/src/utils/NutritionEvidence.js';
import { buildMealContext, buildPortionPrompt, validateMealLimits } from '../web/src/services/DynamicPortions.js';
import { mergeIngredientNutrition } from '../web/src/utils/IngredientNutritionCache.js';
import { validateChefResult } from '../web/src/services/ChefAdvisor.js';
const values = new Map();
globalThis.localStorage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.sessionStorage = localStorage;
globalThis.window = {location:{hostname:'evidence.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.document = {body:{classList:{add(){},remove(){}}}};
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.fetch = async () => {throw Error('Real network forbidden');};
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Engine} = await import('../web/src/engine/KitchenEngine.js');
const {default:Modal} = await import('../web/src/components/IngredientDetailModal.js');
const {default:Calculator} = await import('../web/src/views/CalculatorView.js');
const catalog = Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json'))).flat();
assert.equal(Object.keys(officialNutritionEvidence).length,99);
const audit = JSON.parse(fs.readFileSync('docs/audits/nutrition-2026-10-28.json'));
const report = JSON.parse(fs.readFileSync('docs/audits/nutrition-2026-11-04.json'));
assert.equal(report.ingredients.length,99);
for (const row of audit.ingredients) assert.equal(report.ingredients.find(i=>i.id===row.id).historicalStatus,row.status);
const engine = Vue.reactive(new Engine());engine.data.ingredients=structuredClone(catalog);
for (const item of catalog) {
 const loaded=engine.getIngredientById(item.id);
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.nutritionEvidence)),officialNutritionEvidence[item.id].evidence);
 if (loaded.nutritionEvidence.status==='estimated') {
  assert.equal(loaded.nutritionEvidence.kind,'database');assert(loaded.nutritionEvidence.sources.length);
 }
}
for (const scope of ['household','ariel',null]) {
 engine.personalScope=scope;
 for (const member of ['bebe','ariel','jason']) {
  for (const id of ['shrimp_paste','prince_noodles','bacon','century_egg','mushroom_meatball','egg_dumpling','taro_meatball','potato_ramen']) {
   const ing=engine.getIngredientById(id), req=[{id,amount:1,unit:ing.unitLabel}];
   assert(Number.isNaN(engine.calculateNutritionForMember(req,member).kcal),id);
   assert(engine.getNutritionIssues(req).join().includes('待確認'),id);
  }
  assert.equal(engine.calculateNutritionForMember([{id:'salmon',amount:100,unit:'g'}],member).kcal,151.6);
  assert.equal(engine.calculateNutritionForMember([{id:'angel_hair_pasta',amount:100,unit:'g'}],member).kcal,160);
  assert(Number.isNaN(engine.calculateNutritionForMember([{id:'missing',amount:1,unit:'g'}],member).kcal));
 }
}
const salmon = engine.getIngredientById('salmon');
for (const changed of [{...salmon,brand:'另一品牌'},{...salmon,per100g:{...salmon.per100g,kcal:999}},{...salmon,weightBasis:'cooked'}]) assert(nutritionEvidenceIssue(changed));
for (const missing of [null,undefined,'',NaN,Infinity,-1,false]) assert.equal(nutrientNumber(missing),null);
assert.equal(nutrientNumber(0),0);
const makeLabel=(id,unit='g')=>({id,name:'測試商品',brand:'測試品牌',unitLabel:unit,weightBasis:'as_sold',per100g:{kcal:100,protein:10,carbs:10,fat:2,sodium:100}});
const verify=ing=>({...ing,nutritionEvidence:{kind:'product_label',status:'verified',identity:{name:ing.name,brand:ing.brand},specification:'測試版',checkedAt:'2026-11-04',snapshot:evidenceSnapshot(ing)}});
engine.data.ingredients.push(verify(makeLabel('label')),verify(makeLabel('volume','ml')));
assert.equal(engine.calculateNutritionForMember([{id:'volume',amount:200,unit:'ml'}],'bebe').kcal,200);
assert(Number.isNaN(engine.calculateNutritionForMember([{id:'volume',amount:200,unit:'g'}],'bebe').kcal));
const localLabel=verify(makeLabel('reload'));
localLabel.nutritionCache={edited:false,base:{unitLabel:'g',per100g:localLabel.per100g}};
assert.equal(mergeIngredientNutrition(makeLabel('reload'),localLabel,localLabel).nutritionEvidence.status,'verified','Explicit source verification must survive a reload even when numbers did not change');
const incomplete=makeLabel('incomplete');incomplete.per100g.sodium=null;engine.data.ingredients.push(verify(incomplete));
assert(Number.isNaN(engine.calculateNutritionForMember([{id:'incomplete',amount:100,unit:'g'}],'bebe').kcal));
assert(labelConsistencyIssue({...makeLabel('bad'),servingSize:50,servingUnit:'g',perServing:{kcal:100,protein:10,carbs:10,fat:2,sodium:100}}));

// Current target + consumption change the budget and prompt; no person-specific override.
const input={weight:65,measuredOn:'2026-11-01',goal:'目前確認的目標',restrictions:'無',excludedIds:[],mealsRemaining:2,confirmed:true};
let consumed={kcal:200,protein:20,carbs:20,fat:5,sodium:100};
engine.getDailyLog=()=>({totals:consumed});
let context=buildMealContext(engine,'jason',input,'2026-11-04');assert.equal(context.mealBudget.kcal,800);
engine.profiles.jason.targetKcal=2000;context=buildMealContext(engine,'jason',input,'2026-11-04');assert.equal(context.mealBudget.kcal,900);
consumed={...consumed,kcal:2200};assert.equal(buildMealContext(engine,'jason',input,'2026-11-04').mealBudget.kcal,0);
assert.throws(()=>buildMealContext(engine,'jason',{...input,confirmed:false},'2026-11-04'));
assert.throws(()=>buildMealContext(engine,'jason',{...input,measuredOn:'2027-01-01'},'2026-11-04'));
consumed={kcal:0,protein:0,carbs:0,fat:0,sodium:0};context=buildMealContext(engine,'jason',input,'2026-11-04');
const expected={jason:[{id:'label',amount:100,unit:'g'}]};
const prompt=buildPortionPrompt({dish:'測試料理',slot:'dinner',contexts:[context],expected,engine});
assert(prompt.includes('目前確認的目標'));assert(prompt.includes('measuredOn'));assert(!prompt.includes('2200'));
validateMealLimits(engine,expected,[context]);
assert.throws(()=>validateMealLimits(engine,{jason:[{id:'label',amount:1001,unit:'g'}]},[context]));
assert.throws(()=>validateMealLimits(engine,expected,[{...context,excludedIds:['label']}]));
validateChefResult({chefComment:'測試',portions:expected},expected,engine);
assert.throws(()=>validateChefResult({chefComment:'測試',portions:{jason:[{id:'label',amount:1,unit:'包'}]}},expected,engine));

// Real modal: preserve blanks, retain old data on metadata-only save, verify a measured count.
const renderer=Vue.createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
function mount(component,props){let view;const root={};renderer.render(Vue.h({setup(){view=component.setup(props,{emit(){}});return()=>Vue.h('div');}}),root);return {view,close:()=>renderer.render(null,root)};}
let saved;
const fake={getIngredientById:id=>engine.getIngredientById(id),checkStock:()=>true,saveIngredient:async ing=>{saved=structuredClone(ing);},data:{ingredients:engine.data.ingredients,pantryInventory:{}},detectNutrientCategory:()=> 'proteins'};
const props=Vue.reactive({isOpen:false,mode:'edit',initialIngredient:engine.getIngredientById('egg_dumpling'),engine:fake});
const modal=mount(Modal,props);props.isOpen=true;await Vue.nextTick();
modal.view.form.brand='測試品牌';modal.view.evidenceSpec.value='每顆 10g 包裝測試';modal.view.evidenceBasis.value='as_sold';modal.view.gramsPerUnit.value=10;
modal.view.form.per100g={kcal:100,protein:10,carbs:10,fat:2,sodium:null};modal.view.on100gInput();
await modal.view.handleSave();assert.equal(saved.per100g.sodium,null);assert.equal(saved.nutritionEvidence.status,'pending');
modal.view.form.per100g.sodium=100;modal.view.on100gInput();modal.view.evidenceConfirmed.value=true;
await modal.view.handleSave();assert.equal(saved.perUnit.kcal,10);assert.equal(saved.nutritionEvidence.status,'verified');
engine.data.ingredients=engine.data.ingredients.filter(i=>i.id!==saved.id).concat(saved);
assert.equal(engine.calculateNutritionForMember([{id:saved.id,amount:2,unit:'顆'}],'bebe').kcal,20);
modal.view.form.per100g.kcal=120;assert.equal(modal.view.evidenceConfirmed.value,false);modal.close();

// Old unscoped calculation state is left untouched; body input never enters a cache.
values.clear();values.set('family_kitchen_calc_session_state','legacy-unscoped');
engine.data.dishes=[];engine.data.pantryInventory={foodStockStatus:{label:true}};engine.personalScope='household';
const app=mount(Calculator,{engine});engine.data.dishes=[{id:'home_cooking',name:'測試',recommendedProteins:['label'],defaultIngredients:[{id:'label',amount:100,unit:'g'}],memberPortions:{bebe:[{id:'label',amount:777,unit:'g'}]}}];await Vue.nextTick();
assert.equal(app.view.memberIngredients.value.bebe[0].amount,100,'Personal seed is not current advice');
Object.assign(app.view.mealInputs.bebe,input);app.view.memberIngredients.value.bebe[0].amount=123;await Vue.nextTick();
assert.equal(app.view.memberIngredients.value.bebe[0].amount,123,'Manual edit preserved');
assert.equal(values.get('family_kitchen_calc_session_state'),'legacy-unscoped');
app.view.mealInputs.bebe.confirmed=true;
app.view.mealInputs.bebe.excludedIds=['label'];
assert.equal(app.view.mealInputs.bebe.confirmed,false,'Changing exclusions invalidates confirmation');
app.view.mealInputs.bebe.confirmed=true;engine.profiles.bebe.targetKcal+=10;
assert.equal(app.view.mealInputs.bebe.confirmed,false,'Changing current targets invalidates confirmation');
const session=values.get('family_kitchen_calc_session_state:household');assert(session);assert(!session.includes('measuredOn'));assert(!session.includes('目前確認的目標'));
app.view.useHistoricalPortions('bebe');assert.equal(app.view.memberIngredients.value.bebe[0].amount,777,'History only on explicit request');
engine.personalScope='ariel';await Vue.nextTick();assert.equal(app.view.mealInputs.bebe.weight,'');
app.close();
assert(![...values.keys()].some(k=>k.startsWith('kitchen_v2_personal_state_')),'No Personal Kitchen state written');
const originalWrite=localStorage.setItem;
const beforeIngredients=JSON.stringify(engine.data.ingredients);
localStorage.setItem=(key,value)=>{if(key==='kitchen_v2_nutrition_edit_backup')throw Error('mock quota');originalWrite(key,value);};
await assert.rejects(engine.saveIngredient({...engine.getIngredientById('label'),price:99}),/mock quota/);
assert.equal(JSON.stringify(engine.data.ingredients),beforeIngredients,'Failed backup does not mutate ingredients');
localStorage.setItem=originalWrite;
// Confirm the source metadata survives real save/cache merge without certifying later edits.
await engine.saveIngredient({...engine.getIngredientById('label'),price:99});
assert(values.has('kitchen_v2_nutrition_edit_backup'));
assert.equal(engine.getIngredientById('label').nutritionEvidence.status,'verified');
await engine.saveIngredient({...engine.getIngredientById('label'),per100g:{...engine.getIngredientById('label').per100g,kcal:999}});
assert(engine.getNutritionIssues([{id:'label',amount:100,unit:'g'}]).length);
Vue.compile(Calculator.template,{decodeEntities:text=>text});Vue.compile(Modal.template,{decodeEntities:text=>text});
console.log('PASS: 99 evidence records, 89 audit reuse, three source classes, pending counts/placeholders, identity/snapshot guards, missing values, g/ml/count, changing targets/intake, exclusions, AI shape/limits, manual edits/history and isolated scope cache.');
