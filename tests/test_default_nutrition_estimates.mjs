import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { officialNutritionEvidence as evidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { evidenceSnapshot, nutritionEvidenceIssue, nutritionEvidenceText } from '../web/src/utils/NutritionEvidence.js';
import { approvedIngredientBaseline } from '../web/src/utils/IngredientBaselineUpdate.js';

// Historical 99-item catalog is pinned to its released commit; origin/main now carries 101 items.
const currentText = fs.readFileSync('src/data/ingredients.json','utf8');
const priorText = execFileSync('git',['show','71beb38709c85390a85744297ea2b24ecd1abf99:src/data/ingredients.json'],{encoding:'utf8'});
const current = JSON.parse(currentText);
const prior = JSON.parse(priorText);
const rows = value => Object.values(value).flat();
const find = (catalog,id) => rows(catalog).find(i=>i.id===id);
const currentIds = new Set(rows(current).map(i=>i.id));
assert.equal(currentIds.size,100);
assert.equal(rows(prior).length,99);
assert.equal(Object.keys(evidence).length,101);
assert.equal(rows(current).filter(i=>i.id==='white_rice').length,1);
assert.equal(rows(current).filter(i=>i.id==='snow_white_mushroom').length,1);
assert.equal(rows(current).filter(i=>i.id==='brown_rice').length,1);
assert.equal(find(current,'brown_rice').name,'糙米飯');
assert.equal(find(current,'beech_mushroom').name,'鴻喜菇');
assert.equal(find(current,'greek_yogurt').per100g.kcal,97);
assert.equal(find(current,'greek_yogurt').per100g.fat,5);
assert.equal(find(current,'chicken_thigh').per100g.kcal,221);
assert.equal(find(current,'white_rice').weightBasis,'cooked');
assert.equal(find(current,'brown_rice').weightBasis,'cooked');
assert.equal(find(current,'banana').unitLabel,'g');
assert.equal(find(current,'banana').per100g.kcal,89);
assert.equal(find(current,'bacon').unitLabel,'g');
assert.equal(find(current,'bagel').unitLabel,'g');
for (const id of ['shrimp_paste','prince_noodles','bacon']) {
 const item=find(current,id);
 assert(Object.values(item.per100g).every(n=>n===null),id);
 assert.equal(evidence[id].evidence.status,'pending');
}
for (const id of ['egg','century_egg','mushroom_meatball','egg_dumpling','taro_meatball','potato_ramen']) {
 assert(!['g','ml'].includes(find(current,id).unitLabel),id);
 assert.equal(evidence[id].evidence.status,'pending');
}
const report=JSON.parse(fs.readFileSync('docs/audits/nutrition-2026-11-05.json'));
assert.deepEqual(report.counts,{pending:48,estimated:52,verified:1});
assert.equal(report.catalogSize,101);
assert.equal(report.newBaselineChanges.length,18);
for (const i of rows(current)) {
 const ev=evidence[i.id]?.evidence;
 assert(ev, i.id);
 assert.equal(ev.identity.name,i.name,i.id);
 assert.equal(ev.identity.brand,i.brand||'',i.id);
 assert.deepEqual(JSON.parse(JSON.stringify(ev.snapshot)),JSON.parse(JSON.stringify(evidenceSnapshot(i))),i.id);
 if (ev.status==='estimated') {
   assert.equal(ev.kind,'database');
   assert(ev.sources?.length,i.id);
   assert(ev.sources.every(s=>s.ref && s.url && s.checkedAt && s.basis),i.id);
 }
}
assert.equal(evidence.greek_yogurt.evidence.sources[0].ref,'USDA:171304');
assert.equal(evidence.chicken_thigh.evidence.sources[0].ref,'USDA:172385');
assert.equal(evidence.white_rice.evidence.sources[0].ref,'USDA:169757');
assert.equal(evidence.snow_white_mushroom.evidence.sources[0].ref,'TFDA:G0600101');
assert.equal(rows(current).some(i=>i.id==='egg_dumpling'&&i.perUnit),false);
assert.equal(rows(current).length,100);
assert.equal(rows(await approvedIngredientBaseline(currentText)).length,100);
assert.equal(rows(await approvedIngredientBaseline(priorText)).length,99);
await assert.rejects(approvedIngredientBaseline(currentText+' '),/基準未經版本核准/);

const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.sessionStorage=globalThis.localStorage;
globalThis.window={location:{hostname:'nutrition.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.document={body:{classList:{add(){},remove(){}}}};
globalThis.alert=()=>{};globalThis.confirm=()=>true;
globalThis.fetch=async()=>{throw Error('External requests forbidden')};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const { default:Engine }=await import('../web/src/engine/KitchenEngine.js');
const { default:Modal }=await import('../web/src/components/IngredientDetailModal.js');
const engine=new Engine();
engine.data.ingredients=rows(current);
for(const member of ['bebe','jason','ariel']) {
 for (const [id,kcal] of [['greek_yogurt',97],['chicken_thigh',221],['white_rice',130],['brown_rice',123],['shrimp',99],['tofu',96],['banana',89],['beech_mushroom',30],['snow_white_mushroom',36],['bagel',264],['truffle_olive_oil',884]]) {
  assert.equal(engine.calculateNutritionForMember([{id,unit:'g',amount:100}],member).kcal,kcal,id);
 }
 for (const id of ['egg','egg_dumpling','century_egg','mushroom_meatball','taro_meatball','potato_ramen','shrimp_paste','prince_noodles','bacon']) {
  const i=find(current,id);
  assert(Number.isNaN(engine.calculateNutritionForMember([{id,amount:1,unit:i.unitLabel}],member).kcal),id);
 }
 assert.equal(engine.calculateNutritionForMember([{id:'banana',amount:0,unit:'根'}],member).kcal,0);
 assert(Number.isNaN(engine.calculateNutritionForMember([{id:'banana',amount:1,unit:'根'}],member).kcal));
}
for (const scope of ['household','ariel',null]) {
 store.clear();engine.personalScope=scope;
 const oldCache=structuredClone(prior);
 const oldState=JSON.stringify(oldCache);
 const merged=engine.mergeUserState('ingredients.json',oldCache,current);
 assert.equal(JSON.stringify(oldCache),oldState);
 assert.equal(find(merged,'greek_yogurt').per100g.kcal,97);
 assert.equal(find(merged,'chicken_thigh').per100g.kcal,221);
 assert.equal(find(merged,'brown_rice').name,'糙米飯');
 assert.equal(find(merged,'beech_mushroom').name,'鴻喜菇');
 assert.equal(find(merged,'white_rice').per100g.kcal,130);
 assert.equal(find(merged,'snow_white_mushroom').per100g.kcal,36);
 assert.equal(find(merged,'banana').unitLabel,'g');
 // Scope keys were never touched by the catalog merge.
 assert(![...store.keys()].some(k=>k.startsWith('kitchen_v2_personal_state_')));
 // An explicit saved nutrition label or edited local amount outranks estimated catalog.
 const branded=structuredClone(prior);
 const greek=find(branded,'greek_yogurt');
 greek.nutritionEvidence={kind:'product_label',status:'verified',identity:{name:greek.name,brand:greek.brand||''},specification:'本人核實品項',checkedAt:'2026-11-05',snapshot:evidenceSnapshot(greek)};
 const labelResult=find(engine.mergeUserState('ingredients.json',branded,current),'greek_yogurt');
 assert.equal(labelResult.per100g.kcal,59);
 assert.equal(labelResult.nutritionEvidence.status,'verified');
 assert(!nutritionEvidenceIssue(labelResult));
 const changed=structuredClone(prior);
 find(changed,'greek_yogurt').per100g.kcal=115;
 const edited=find(engine.mergeUserState('ingredients.json',changed,current),'greek_yogurt');
 assert.equal(edited.per100g.kcal,115);
 assert(edited.nutritionReviewRequired);
 // A new canonical ID cannot displace the old local custom with same normalized name.
 const privateWhite={id:'private-white-rice',name:'白飯（熟重）',category:'carbs',unitLabel:'g',per100g:{kcal:145}};
 const local=structuredClone(prior);
 local.carbs.push(privateWhite);
 store.set('kitchen_v2_custom_ingredients',JSON.stringify([privateWhite]));
 const collision=engine.mergeUserState('ingredients.json',local,current);
 assert.equal(find(collision,'white_rice'),undefined,'Canonical addition must not eat private custom');
 assert.equal(find(collision,privateWhite.id).per100g.kcal,145);
 assert.equal(JSON.parse(store.get('kitchen_v2_custom_ingredients'))[0].id,privateWhite.id);
 const privateBeech={id:'private-beech',name:'鴻喜菇',category:'veggies',unitLabel:'g',per100g:{kcal:33}};
 const oldShimeji=structuredClone(prior);oldShimeji.veggies.push(privateBeech);
 store.set('kitchen_v2_custom_ingredients',JSON.stringify([privateBeech]));
 const shimeji=engine.mergeUserState('ingredients.json',oldShimeji,current);
 assert.equal(find(shimeji,'beech_mushroom').name,'鴻喜菇/雪白菇');
 assert.equal(find(shimeji,privateBeech.id).per100g.kcal,33);
 assert.equal(JSON.parse(store.get('kitchen_v2_custom_ingredients'))[0].id,privateBeech.id);
}
const props=Vue.reactive({isOpen:false,mode:'edit',initialIngredient:engine.getIngredientById('greek_yogurt'),engine});
const renderer=Vue.createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
let view;
const root={};renderer.render(Vue.h({setup(){view=Modal.setup(props,{emit(){}});return()=>Vue.h('div');}}),root);
props.isOpen=true;await Vue.nextTick();
assert.equal(view.showLabelReview.value,false);
assert.equal(nutritionEvidenceText(engine.getIngredientById('greek_yogurt')),'官方資料庫估算');
view.showLabelReview.value=true;assert.equal(view.showLabelReview.value,true);
Vue.compile(Modal.template,{decodeEntities:t=>t});renderer.render(null,root);
console.log('PASS: official 101 vs historical 99, user choices, source snapshots, clear missing placeholders, count safety, local edits/verified labels, all scopes, legacy cache, custom name collision, pinned baseline and collapsed product-only UI');
