import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { planLocalPortions } from '../web/src/services/LocalPortionPlanner.js';
import {buildMealContext,validateMealLimits} from '../web/src/services/DynamicPortions.js';
import {officialNutritionEvidence} from '../web/src/utils/OfficialNutritionEvidence.js';
import {isCountUnit} from '../web/src/utils/IngredientUnit.js';

globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
globalThis.localStorage={getItem(){return null},setItem(){throw Error('No storage writes allowed')}};
globalThis.window={addEventListener(){},removeEventListener(){}};
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const engine=new Engine();
engine.data.ingredients=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat().map(i=>structuredClone(i));
for(const id of ['egg','kimchi','shin_ramen']){
 const ingredient=engine.data.ingredients.find(i=>i.id===id);
 const evidence=officialNutritionEvidence[id].evidence;
 Object.assign(ingredient,structuredClone({
   ...evidence.snapshot, nutritionEvidence:evidence,
   ...(id==='egg'?{gramsPerUnit:50}: {})
 }));
}
const ids=['pork_shoulder','egg','cabbage','tofu','broccoli','kimchi','shin_ramen'];
const expected={};
for(const member of ['bebe','ariel','jason']){
 expected[member]=ids.map(id=>({id,amount:{pork_shoulder:80,egg:1,cabbage:100}[id]||0,unit:engine.getIngredientById(id).unitLabel}));
}
assert.equal(engine.getNutritionIssues(expected.bebe.map(i=>({...i,amount:1}))).length,0);
const original=JSON.stringify(expected);
engine.getDailyLog=()=>({totals:{kcal:0,protein:0,carbs:0,fat:0,sodium:0}});
const contexts=Object.keys(expected).map(member=>buildMealContext(engine,member,'2026-11-09','standard','lunch'));
const first=planLocalPortions(engine,expected,contexts);
assert(first && Object.keys(first.portions).length===3);
for(const ctx of contexts){
 const items=first.portions[ctx.member];
 assert.deepEqual(items.map(i=>i.id),ids);
 assert(items.every(i=>i.amount>0));
 assert(items.every(i=>!isCountUnit(i.unit)||Number.isInteger(i.amount)));
 assert.doesNotThrow(()=>validateMealLimits(engine,{[ctx.member]:items},[ctx]));
 const totals=engine.calculateNutritionForMember(items,ctx.member);
 assert(Object.values(totals).every(Number.isFinite));
 assert(totals.sodium < 1000,'A ramen lunch estimate should reserve sodium for later meals when feasible');
 assert(items.find(i=>i.id==='kimchi').amount<=25,'High-sodium kimchi should have a conservative default');
 assert(items.find(i=>i.id==='shin_ramen').amount<=30,'Whole-package ramen sodium requires a conservative default');
 console.log(ctx.member,JSON.stringify(items.map(i=>[i.id,i.amount])),totals);
}
assert.equal(JSON.stringify(expected),original,'Never mutate original recipe and saved portion defaults');
const second=planLocalPortions(engine,expected,contexts);
assert.deepEqual(second,first,'Same inputs must yield repeatable estimates');
const low=structuredClone(contexts[0]);
low.mealBudget={...low.mealBudget,sodium:1};
assert.equal(planLocalPortions(engine,{bebe:expected.bebe},[low]),null,
 'When one whole egg exceeds remaining sodium ceiling, no fabricated sub-egg allowance');
const blocked=structuredClone(expected.bebe);
blocked[3].id='unknown';
assert.equal(planLocalPortions(engine,{bebe:blocked},[contexts[0]]),null);
const excluded=structuredClone(contexts[0]);
excluded.excludedIds=['egg'];
assert.equal(planLocalPortions(engine,{bebe:expected.bebe},[excluded]),null);
console.log('PASS: 7-ingredient ramen + 3-member safe local estimate; count guards, daily nutrition budgets, impossible and stale inputs reject; no persisted data changes.');
