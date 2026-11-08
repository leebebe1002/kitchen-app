import assert from 'node:assert/strict';
import { authorizeTestEngine, switchTestScope } from './personal_scope_fixture.mjs';
import {
  sharedIngredientIdentity, sameSharedIdentity, sharedNutritionPayload,
  validateSharedRow, applySharedNutrition, completeSharedNutrition
} from '../web/src/utils/SharedIngredientNutrition.js';
import { evidenceSnapshot } from '../web/src/utils/NutritionEvidence.js';
import { sameNutrition } from '../web/src/utils/IngredientNutritionCache.js';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key,val) => values.set(key,String(val)),
  removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
globalThis.Vue = { reactive:x=>x };
globalThis.window = { location:{ hostname:'test.invalid' }, addEventListener(){},removeEventListener(){} };
globalThis.fetch = async () => { throw Error('No real network'); };
const {default: Engine}=await import('../web/src/engine/KitchenEngine.js');
const copy=x=>structuredClone(x);
const nutrients = kcal => ({kcal,protein:3,fat:2,carbs:4,sodium:5});
const make = (kcal=75) => {
  const item = {
    id:'family_milk', name:'全脂鮮奶', brand:'品牌 A',category:'sauces',
    unitLabel:'ml',weightBasis:'as_sold',
    per100g:nutrients(kcal),perServing:{kcal:kcal*2,protein:6,fat:4,carbs:8,sodium:10},
    servingSize:200,servingUnit:'ml',photoUrl:'https://example.invalid/photo.jpg',
    price:79,preferredStore:'全聯',storageZones:['冷藏']
  };
  item.nutritionEvidence={kind:'product_label',status:'verified',identity:{name:item.name,brand:item.brand},
    checkedAt:'2026-11-08',specification:'',weightBasis:item.weightBasis};
  item.nutritionEvidence.snapshot=evidenceSnapshot(item);
  item.nutritionReviewRequired=false;
  return item;
};
const original=make(75), change=make(81);
const payload=sharedNutritionPayload(change,original);
assert(payload);
const row={...payload,revision:1};
assert(validateSharedRow(row));
const sortedJson = value => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sortedJson(v)]))
    : value;
assert(validateSharedRow({...row,identity:sortedJson(row.identity),nutrition:sortedJson(row.nutrition),evidence:sortedJson(row.evidence)}));
assert(!sameNutrition(original,change));
assert.equal(payload.nutrition.per100g.kcal,81);
assert(!('photoUrl' in payload.nutrition) && !('price' in payload.nutrition));
assert(!('photoUrl' in payload.evidence) && !('note' in payload.evidence));
assert(completeSharedNutrition(payload.nutrition));
const partialServing = make(81);
partialServing.perServing = {kcal:null,protein:null,carbs:null,fat:null,sodium:null};
partialServing.nutritionEvidence.snapshot = evidenceSnapshot(partialServing);
const normalized = sharedNutritionPayload(partialServing, original);
assert(normalized && !('perServing' in normalized.nutrition));
let passes=0;
const pass=label=>{passes++;console.log('PASS:',label)};
pass('verified complete correction only, full five nutrients and ml units');

for(const variation of [
  {...change,brand:'另一品牌'}, {...change,nutritionEvidence:{...change.nutritionEvidence,status:'pending'}},
  {...change,nutritionReviewRequired:true},
  {...change,per100g:{...change.per100g,kcal:null}},
  {...change,weightBasis:'unknown'},
  {...change,perServing:{...change.perServing,kcal:9}}
]){
  assert.equal(sharedNutritionPayload(variation,original),null);
}
assert.equal(sharedNutritionPayload({...change,id:'ing_private'},original),null);
const genericMultiBrand=copy(original);
genericMultiBrand.brand='義美 / 光泉';
const sameMultiBrand=copy(change);
sameMultiBrand.brand='義美 / 光泉';
sameMultiBrand.nutritionEvidence.identity.brand='義美 / 光泉';
sameMultiBrand.nutritionEvidence.snapshot=evidenceSnapshot(sameMultiBrand);
assert.equal(sharedNutritionPayload(sameMultiBrand,genericMultiBrand),null,
  'Multiple brands in one official record cannot identify one exact product');
assert(!sameSharedIdentity(sharedIngredientIdentity(change),sharedIngredientIdentity({...change,brand:'品牌 B'})));
const branded = copy(change);
branded.nutritionEvidence.specification = '地獄版';
branded.nutritionEvidence.snapshot = evidenceSnapshot(branded);
const variantPayload = sharedNutritionPayload(branded,original);
assert(variantPayload && variantPayload.identity.specification === '地獄版');
const conflicting=copy(original);
conflicting.nutritionEvidence.specification='一般版';
assert(!applySharedNutrition(conflicting,{...variantPayload,revision:1},original));
const sameCanonical=copy(original);
assert(applySharedNutrition(sameCanonical,{...variantPayload,revision:1},original));
assert.equal(sameCanonical.nutritionEvidence.specification,'地獄版');
assert(!completeSharedNutrition({...payload.nutrition,unitLabel:'g',per100g:{...change.per100g,kcal:NaN}}));
pass('brand, private ID, pending/incomplete, unknown basis and mismatched serving blocked');

const oldLocal={...original,per100g:nutrients(44),perServing:{...original.perServing,kcal:88},nutritionCache:{edited:true}};
const toUpdate=copy(oldLocal);
assert(applySharedNutrition(toUpdate,row,original));
assert.equal(toUpdate.per100g.kcal,81);
assert.equal(toUpdate.perServing.kcal,162);
assert.equal(toUpdate.nutritionCache.sharedRevision,1);
assert.equal(toUpdate.photoUrl,oldLocal.photoUrl);
assert.equal(toUpdate.price,oldLocal.price);
assert.equal(toUpdate.preferredStore,oldLocal.preferredStore);
assert.equal(toUpdate.nutritionEvidence.status,'verified');
assert(!applySharedNutrition(copy(toUpdate),{...row,revision:0},original));
assert(!applySharedNutrition(copy(toUpdate),{...row,identity:{...row.identity,brand:'品牌 B'}},original));
pass('shared revision overlays local stale nutrition while preserving photos/price/stores');

function engine(scope='household') {
  const e=new Engine();
  authorizeTestEngine(e,scope);
  e.data.rawIngredients={proteins:[],veggies:[],carbs:[],sauces:[copy(oldLocal)]};
  e.data.ingredients=e.data.rawIngredients.sauces;
  e.data.pantryInventory={foodStockStatus:{family_milk:true},supplyStockStatus:{},shoppingList:[{id:'ss',targetId:'family_milk'}],foodCart:[]};
  e.data.householdSupplies={supplies:[{id:'preserve'}]};
  e.officialIngredientById.set(original.id,copy(original));
  return e;
}
// Both scopes receive exactly the same effective nutrition, no pantry mutation.
for (const scope of ['household','ariel']) {
  const e=engine(scope);
  const before=JSON.stringify({pantry:e.data.pantryInventory,supplies:e.data.householdSupplies});
  e.sharedNutritionService={list:async()=>[copy(row)]};
  await e.loadSharedIngredientNutrition();
  assert(e.sharedNutritionLoaded);
  assert.equal(e.sharedNutritionRevision.get('family_milk'),1);
  assert.equal(e.getIngredientById('family_milk').per100g.kcal,81);
  assert.equal(JSON.stringify({pantry:e.data.pantryInventory,supplies:e.data.householdSupplies}),before);
  assert.equal(e.data.rawIngredients.sauces[0].photoUrl,original.photoUrl);
}
pass('both scopes use one effective value, pantry and supply scopes unchanged');

{
  const e=engine();e.sharedNutritionService={list:async()=>{throw Error('offline')}};
  const old=copy(e.getIngredientById('family_milk'));
  await e.loadSharedIngredientNutrition();
  assert(!e.sharedNutritionLoaded);
  assert.equal(e.getIngredientById('family_milk').per100g.kcal,old.per100g.kcal);
  assert.match(e.sharedNutritionMessage,/無法確認/);
}
pass('offline remote read cannot imply synchronized nutrition');

// Save use: CAS revision is required. Cloud error must leave local unchanged.
for (const scope of ['household','ariel']) {
  values.clear();
  const e=engine(scope);e.sharedNutritionLoaded=true;
  e.sharedNutritionRevision.set('family_milk',2);
  localStorage.setItem('kitchen_v2_ingredients.json',JSON.stringify(e.data.rawIngredients));
  localStorage.setItem('kitchen_v2_custom_ingredients','[]');
  let writes=0;
  e.sharedNutritionService={publish:async (p,rev)=>{writes++;assert.equal(rev,2);assert.equal(p.ingredient_id,original.id);return {...p,revision:3};}};
  e.saveJson=async()=>{};
  const saved=await e.saveIngredient(copy(change));
  assert.equal(saved.per100g.kcal,81);assert.equal(writes,1);
  assert.equal(e.sharedNutritionRevision.get('family_milk'),3);
  assert.equal(e.getIngredientById('family_milk').per100g.kcal,81);
  assert.equal(e.data.pantryInventory.shoppingList[0].targetId,'family_milk');
}
pass('verified edits publish before local commit for Bebe and Ariel');

for (const scenario of ['conflict','offline','not-loaded']) {
  values.clear();const e=engine();
  e.sharedNutritionLoaded=scenario!=='not-loaded';
  e.sharedNutritionService={publish:async()=>{throw Error(scenario)}};
  localStorage.setItem('kitchen_v2_ingredients.json',JSON.stringify(e.data.rawIngredients));
  localStorage.setItem('kitchen_v2_custom_ingredients','[]');
  const primary=localStorage.getItem('kitchen_v2_ingredients.json');
  await assert.rejects(e.saveIngredient(copy(change)),scenario==='not-loaded'?/無法確認/:new RegExp(scenario));
  assert.equal(localStorage.getItem('kitchen_v2_ingredients.json'),primary);
  assert.equal(e.getIngredientById('family_milk').per100g.kcal,44);
}
pass('network conflicts/offline/unknown version fail closed, no local nutrition commit');

// Pure prices never publish; private items never share.
{
  values.clear();const e=engine();
  e.sharedNutritionLoaded=true;
  let publishes=0;e.sharedNutritionService={publish:async()=>{publishes++;throw Error('forbidden')}};
  e.saveJson=async()=>{};
  const priceOnly={...copy(oldLocal),price:99};
  await e.saveIngredient(priceOnly);
  assert.equal(publishes,0);
  assert.equal(e.getIngredientById('family_milk').price,99);
}
pass('price-only changes do not sync');
console.log('SHARED NUTRITION ALL PASS:',passes);
