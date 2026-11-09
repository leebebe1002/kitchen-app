import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {officialNutritionEvidence} from '../web/src/utils/OfficialNutritionEvidence.js';
import {canonicalNutritionItem} from '../web/src/services/OfficialIngredientCatalogService.js';
import {evidenceSnapshot, withNutritionEvidence} from '../web/src/utils/NutritionEvidence.js';

const raw=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
assert.equal(raw.length,100,'Canonical catalog must remain 100 items');
const original=structuredClone(raw.find(i=>i.id==='egg'));
const evidence=officialNutritionEvidence.egg.evidence;
const source=evidence.sources[0];
assert.equal(source.ref,'TFDA:K01001');
assert.equal(source.recordId,'K01001');
assert.equal(evidence.kind,'database');
assert.equal(evidence.status,'estimated');
assert.equal(source.nutrients.kcal,135);
assert.equal(source.nutrients.protein,12.7);
assert.equal(source.nutrients.carbs,1.6);
assert.equal(source.nutrients.fat,8.9);
assert.equal(source.nutrients.sodium,138);
const next=structuredClone(original);
Object.assign(next, {
  per100g:structuredClone(evidence.snapshot.per100g),
  perUnit:structuredClone(evidence.snapshot.perUnit),
  gramsPerUnit:50,
  weightBasis:'raw',
  nutritionEvidence:structuredClone(evidence)
});
assert.deepEqual(evidenceSnapshot(next),evidence.snapshot,'Source snapshot must match proposed authoritative row');
for (const key of ['kcal','protein','carbs','fat','sodium']) {
 assert.equal(next.perUnit[key],next.per100g[key]/2,'One 50g edible egg scales TFDA per 100g');
}
const safe=canonicalNutritionItem(original,next);
assert.deepEqual(evidenceSnapshot(safe),evidence.snapshot);
assert.equal(safe.name,'蛋');
assert.equal(safe.id,'egg');
assert.equal(safe.unitLabel,'顆');
assert.equal(safe.isCount,true);
assert.equal(safe.gramsPerUnit,50);
assert.equal(safe.nutritionEvidence.status,'estimated');
assert.equal(original.gramsPerUnit,undefined,'Do not mutate the current canonical row');
assert.equal(original.perUnit.kcal,85,'Old official value must be preserved until authorized DB update');
const oldSource=withNutritionEvidence(original);
assert.equal(oldSource.nutritionEvidence.status,'pending',
 'Old official row must not get a false new estimate just from source-index rollout');
const newSource=withNutritionEvidence(safe);
assert.equal(newSource.nutritionEvidence.status,'estimated');

globalThis.localStorage={getItem:()=>null,setItem:()=>{throw Error('No persistent writes')}};
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const engine=new Engine();
engine.data.ingredients=structuredClone(raw);
for(const member of ['bebe','ariel','jason']){
 assert.equal(engine.getNutritionIssues([{id:'egg',amount:1,unit:'顆'}]).length,1);
 assert(Number.isNaN(engine.calculateNutritionForMember([{id:'egg',amount:1,unit:'顆'}],member).kcal));
}
engine.data.ingredients=engine.data.ingredients.map(item=>item.id==='egg'?safe:item);
for (const member of ['bebe','ariel','jason']) {
 assert.deepEqual(engine.getNutritionIssues([{id:'egg',amount:1,unit:'顆'}]),[]);
 const totals=engine.calculateNutritionForMember([{id:'egg',amount:1,unit:'顆'}],member);
 assert.deepEqual(totals,{kcal:67.5,protein:6.4,carbs:0.8,fat:4.5,sodium:69});
 const two=engine.calculateNutritionForMember([{id:'egg',amount:2,unit:'顆'}],member);
 assert.deepEqual(two,{kcal:135,protein:12.7,carbs:1.6,fat:8.9,sodium:138});
}
assert.equal(engine.data.ingredients.length,100);
assert.equal(engine.data.ingredients.filter(i=>i.id==='egg').length,1);
assert.deepEqual(raw.find(i=>i.id==='egg'),original);
console.log('PASS egg TFDA average proposed; original 100-item authority unchanged; new source validated for all 3 members.');
