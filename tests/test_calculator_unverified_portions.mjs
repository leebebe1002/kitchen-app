import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.sessionStorage={getItem:()=>null,setItem(){}};
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.document={body:{classList:{add(){},remove(){}}},getElementById:()=>null};
globalThis.alert=()=>{};
globalThis.confirm=()=>true;
let requestCount=0;
globalThis.fetch=async()=>{requestCount++;throw Error('Network forbidden in test');};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const {default:Calculator}=await import('../web/src/views/CalculatorView.js');
const ids=['pork_shoulder','egg','cabbage','tofu','broccoli','kimchi','shin_ramen'];
const catalog=Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'))).flat();
const dishes=JSON.parse(fs.readFileSync('src/data/dishes.json','utf8')).dishes;
const engine=Vue.reactive(new Engine());
engine.data.ingredients=structuredClone(catalog);
engine.data.dishes=[];
engine.data.pantryInventory={foodStockStatus:Object.fromEntries(ids.map(id=>[id,true]))};
engine.personalScope='household';
const renderer=Vue.createRenderer({
 createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},
 createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},
 parentNode:()=>null,nextSibling:()=>null
});
let view;const root={};
renderer.render(Vue.h({setup(){view=Calculator.setup({engine});return()=>Vue.h('div');}}),root);
engine.data.dishes=[dishes.find(d=>d.id==='ramen_meal')];
await Vue.nextTick();
for(const id of ids) if(!view.selectedMasterIngredients.value.includes(id)) view.toggleIngredient(id);
await Vue.nextTick();
assert.deepEqual([...view.selectedMasterIngredients.value].sort(),ids.sort());
const original=JSON.stringify(view.memberIngredients.value.bebe);
assert.equal(view.memberIngredients.value.bebe.find(x=>x.id==='pork_shoulder').amount,80);
assert.equal(view.memberIngredients.value.bebe.find(x=>x.id==='egg').amount,1);
assert.equal(view.memberIngredients.value.bebe.find(x=>x.id==='cabbage').amount,100);
for (const id of ['tofu','broccoli','kimchi','shin_ramen'])
 assert.equal(view.memberIngredients.value.bebe.find(x=>x.id===id).amount,0);
await view.calculate();
assert.equal(view.isCalculated.value,true);
assert.equal(view.aiChefAdvice.value?.source,'partial');
assert.deepEqual(view.aiChefAdvice.value.nutritionIssues.map(x=>x.id).sort(),['egg','kimchi','shin_ramen'].sort());
assert(view.aiChefAdvice.value.chefComment.includes('部分備料參考'));
const prior = JSON.parse(original);
for(const id of ['egg','kimchi','shin_ramen']){
    assert.deepEqual(view.memberIngredients.value.bebe.find(x=>x.id===id),prior.find(x=>x.id===id),
        id+': unverified ingredient quantity must not change');
    assert.equal(view.needsNutritionReview(view.memberIngredients.value.bebe.find(x=>x.id===id)),true);
}
for(const id of ['pork_shoulder','cabbage','tofu','broccoli']){
    const row = view.memberIngredients.value.bebe.find(x=>x.id===id);
    assert(row.amount > 0,id+': verified ingredient should receive positive partial estimate');
    assert.equal(view.needsNutritionReview(row),false);
    assert(view.aiChefAdvice.value.portions.bebe.some(x=>x.id===id));
}
assert.equal(view.aiChefAdvice.value.portions.bebe.length,4,'partial result excludes all unknown foods');
assert.equal(view.getSelectedNutritionIssues('bebe').length,3,'zero-quantity pending still blocks whole-meal totals');
assert.equal(requestCount,0,'Partial calculation must not call Gemini API');
let savedMeals=0;
engine.recordMeal=async()=>{savedMeals++;};
await view.recordMeal();
assert.equal(savedMeals,0,'Even selected unverified foods at 0g must block recording a partial meal');
assert(Calculator.template.includes('部分份量已估算'));
assert(Calculator.template.includes('待確認'));
assert(Calculator.template.includes('openIngredientDetail(problem.id)'));
assert(!Calculator.template.includes('系統已精算'));
assert(!Calculator.template.includes('系統配比'));
assert(!Calculator.template.includes('本餐目標與限制'));
// Once the pending foods are deselected, they must stop blocking the meal.
// The original selected recipes and data remain untouched.
view.selectedMasterIngredients.value=view.selectedMasterIngredients.value.filter(id=>!['egg','kimchi','shin_ramen'].includes(id));
await Vue.nextTick();
await view.calculate();
assert.notEqual(view.aiChefAdvice.value?.source,'blocked','Reliable subset should reach the regular AI path');
assert.equal(view.aiChefAdvice.value?.source,'estimate','Verified foods without a Gemini key should receive a clearly labeled local estimate');
assert(view.getMemberActiveIngredients('bebe').every(item => item.amount > 0),'No selected ingredient may be silently left at 0g');
assert.equal(requestCount,0,'Local estimate must not call Gemini without a key');
renderer.render(null,root);
Vue.compile(Calculator.template,{decodeEntities:x=>x});
console.log('PASS: real seven-ingredient ramen: 3 evidence blockers, no false success/0g recommendation, preserved quantities, actionable photo review, no network or state writes.');
