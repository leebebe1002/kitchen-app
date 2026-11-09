import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {officialNutritionEvidence as evidence} from '../web/src/utils/OfficialNutritionEvidence.js';
import {evidenceSnapshot, withNutritionEvidence, equalNutritionSnapshot} from '../web/src/utils/NutritionEvidence.js';
import {verifyOfficialCatalogRows} from '../web/src/services/OfficialIngredientCatalogService.js';
import {buildMealContext, buildPortionPrompt, validateMealLimits} from '../web/src/services/DynamicPortions.js';
import {validateChefResult} from '../web/src/services/ChefAdvisor.js';

const backupPath='/Users/bebelee/Development/_archives/kitchen-app/fk21-3-catalog-rows-before-20261109.json';
// Use the backed-up production row when available, or a pinned bootstrap fixture
// in CI; no test may write real data.
const rawCatalog=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const backup=fs.existsSync(backupPath)
  ? JSON.parse(fs.readFileSync(backupPath,'utf8'))
  : {rows:rawCatalog.filter(x=>['egg','kimchi','shin_ramen'].includes(x.id))
       .map(ingredient=>({ingredient_id:ingredient.id,ingredient,revision:1}))};
const baseline=Object.fromEntries(backup.rows.map(r=>[r.ingredient_id,r]));
assert.deepEqual(Object.keys(baseline).sort(),['egg','kimchi','shin_ramen']);
assert(backup.rows.every(r=>r.revision===1 && r.ingredient.nutritionEvidence===undefined));
const originalBytes=JSON.stringify(backup.rows);
const updates={};
for (const id of ['egg','kimchi','shin_ramen']){
 const row=structuredClone(baseline[id]);
 const info=evidence[id];
 const ing=row.ingredient;
 assert.equal(ing.id,id);
 assert.equal(info.evidence.status,'estimated');
 assert(info.evidence.sources[0]?.ref && info.evidence.sources[0]?.url);
 if(id==='egg'){
   Object.assign(ing,{per100g:structuredClone(info.evidence.snapshot.per100g),
      perUnit:structuredClone(info.evidence.snapshot.perUnit),
      gramsPerUnit:50,weightBasis:'raw',
      weightBasisSource:'食藥署雞蛋平均值，FK 標準 1 顆去殼可食部 50g（估算，非實測）'});
 } else if(id==='kimchi'){
   Object.assign(ing,{per100g:structuredClone(info.evidence.snapshot.per100g),
      weightBasisSource:'TFDA R4400301 韓式泡菜一般值，每 100g 即食可食部'});
 } else {
   Object.assign(ing,{name:'非油炸辛拉麵（97g）',brand:'農心',
     weightBasisSource:'農心非油炸97g整包含麵體、調味粉與配料；不可當純麵體重量'});
 }
 ing.nutritionEvidence=structuredClone(info.evidence);
 assert.equal(ing.name,info.evidence.identity.name);
 assert.equal(ing.brand||'',info.evidence.identity.brand||'');
 assert.deepEqual(evidenceSnapshot(ing),info.evidence.snapshot);
 assert.equal(withNutritionEvidence(ing).nutritionEvidence.status,'estimated');
 assert.equal(withNutritionEvidence(baseline[id].ingredient).nutritionEvidence.status,'pending');
 updates[id]=row;
}
assert.equal(JSON.stringify(backup.rows),originalBytes,'The backup must remain immutable');
for(const id of Object.keys(updates)){
 const old=baseline[id].ingredient,n=updates[id].ingredient;
 const allowed=new Set(['per100g','perUnit','gramsPerUnit','weightBasis','weightBasisSource','nutritionEvidence']);
 if(id==='shin_ramen'){allowed.add('name');allowed.add('brand');}
 for(const k of new Set([...Object.keys(old),...Object.keys(n)]))
   if(JSON.stringify(old[k])!==JSON.stringify(n[k])) assert(allowed.has(k),id+' unexpected modification '+k);
}
globalThis.localStorage={getItem:()=>null,setItem(){throw Error('No personal or official writes')}};
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const engine=new Engine();
const oldRows=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
assert.equal(oldRows.length,100);
engine.data.ingredients=oldRows.map(i=>structuredClone(updates[i.id]?.ingredient||i));
assert.equal(engine.data.ingredients.length,100);
const one={pork_shoulder:80,egg:1,cabbage:100,tofu:50,broccoli:50,kimchi:20,shin_ramen:30};
const items=Object.entries(one).map(([id,amount])=>({id,amount,unit:engine.getIngredientById(id).unitLabel}));
assert.equal(engine.getNutritionIssues(items).length,0);
// PostgreSQL jsonb deterministically sorts keys; the live request must not be
// blocked merely because its nested key order differs from a JS source snapshot.
const jsonbOrder=value=>Array.isArray(value) ? value.map(jsonbOrder)
    : value && typeof value==='object'
      ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,jsonbOrder(value[k])]))
      : value;
assert(equalNutritionSnapshot(jsonbOrder(evidence.egg.evidence.snapshot),evidence.egg.evidence.snapshot));
assert(!equalNutritionSnapshot({...evidence.egg.evidence.snapshot,gramsPerUnit:45},evidence.egg.evidence.snapshot));
engine.data.ingredients=engine.data.ingredients.map(jsonbOrder);
assert.equal(engine.getNutritionIssues(items).length,0,
  'Actual Supabase JSONB field ordering must not invalidate legitimate nutrients');
const consumed={kcal:0,protein:0,carbs:0,fat:0,sodium:0};
engine.getDailyLog=()=>({totals:consumed});
for(const member of ['bebe','ariel','jason']){
  const totals=engine.calculateNutritionForMember(items,member);
  assert.deepEqual(totals,{kcal:469.5,protein:31.5,carbs:34.2,fat:23.6,sodium:837.3});
  const context=buildMealContext(engine,member,'2026-11-09','standard','lunch');
  assert.equal(context.mealBudget.sodium,engine.profiles[member].targetSodium,
    'Sodium limit must not be arbitrarily cut in half for lunch');
  assert.equal(context.mealBudget.kcal,engine.profiles[member].targetKcal/2);
  validateChefResult({chefComment:'估算；辛拉麵整包含全份調味料',portions:{[member]:items}}, {[member]:items},engine);
  validateMealLimits(engine,{[member]:items},[context]);
  assert(buildPortionPrompt({dish:'營養滿滿泡麵',slot:'lunch',contexts:[context],expected:{[member]:items},engine}).includes('半包調味粉'));
  assert.equal(buildMealContext(engine,member,'2026-11-09','remaining','breakfast').mealBudget.sodium,engine.profiles[member].targetSodium);
}
consumed.sodium=1200;
const over=buildMealContext(engine,'bebe','2026-11-09','standard','lunch');
assert.equal(over.mealBudget.sodium,300);
assert.throws(()=>validateMealLimits(engine,{bebe:items},[over]),/超出/,'Must still enforce the daily sodium cap');
assert.equal(backup.rows.length,3);
console.log('PASS three authoritative candidates, seven-ingredient ramen, three members, source snapshots, both portion modes and daily sodium guard.');

// Production candidate and recovery backup are kept outside the repository.
// This test is pure and reproducible, including on CI without those local files.
const proposedPath='/Users/bebelee/Development/_archives/kitchen-app/fk21-3-catalog-rows-proposed-20261109.json';
if (fs.existsSync(proposedPath)) {
 const stored=JSON.parse(fs.readFileSync(proposedPath,'utf8'));
 assert.deepEqual(Object.keys(Object.fromEntries(stored.rows.map(r=>[r.ingredient_id,r]))).sort(),
   ['egg','kimchi','shin_ramen']);
 assert.deepEqual(stored.rows.map(r=>r.ingredient),Object.values(updates).map(r=>r.ingredient));
}
