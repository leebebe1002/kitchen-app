import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import Badge, { getWeightBasis, weightBasisText } from '../web/src/components/WeightBasisBadge.js';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = { addEventListener() {}, removeEventListener() {}, isSecureContext: true };
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.alert = () => {};
let copied;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async text => { copied = text; } } }, configurable: true });
globalThis.fetch = async () => { throw Error('Unexpected network request'); };
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8') + ';Vue', { console, setTimeout, clearTimeout });
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const { default: Calculator } = await import('../web/src/views/CalculatorView.js');
const official = JSON.parse(fs.readFileSync('src/data/ingredients.json'));
const before = JSON.parse(execFileSync('git', ['show','HEAD:src/data/ingredients.json'], {encoding:'utf8'}));
const stripped = JSON.parse(JSON.stringify(official));
for (const list of Object.values(stripped)) for (const ing of list) { delete ing.weightBasis; delete ing.weightBasisSource; }
assert.deepEqual(stripped, before, 'All 89 ingredient values except basis metadata must be unchanged');
const engineSource = fs.readFileSync('web/src/engine/KitchenEngine.js','utf8');
const oldEngineSource = execFileSync('git',['show','HEAD:web/src/engine/KitchenEngine.js'],{encoding:'utf8'});
const calculation = s => s.slice(s.indexOf('    calculateNutritionForMember('), s.indexOf('\n    }', s.indexOf('    calculateNutritionForMember(')) + 6);
assert.equal(calculation(engineSource), calculation(oldEngineSource), 'Nutrition formula unchanged');
for (const basis of ['raw','cooked','dry','as_sold','unknown']) {
    const ing = { weightBasis: basis, unitLabel: 'g' };
    assert.equal(getWeightBasis(ing,'g'),basis);
    assert(weightBasisText(ing,'g').length > 0);
    assert.equal(Badge.computed.info.call({basis}).label.length,1);
}
for (const unit of ['顆','條','包','根','個']) {
    assert.equal(getWeightBasis({weightBasis:'raw'},unit),'count');
    assert.equal(weightBasisText({},unit),'');
}
assert.equal(getWeightBasis({isCount:true},'g'),'unknown');
for (const ing of [undefined, {}, {weightBasis:'toString'}, {weightBasis:'count'}, {name:'乾麵'}, {name:'熟麵'}]) assert.equal(getWeightBasis(ing,'g'),'unknown');
const engine = new Engine();
engine.data.ingredients = Object.values(official).flat();
for (const member of ['bebe','ariel','jason']) {
    const portions = engine.data.ingredients.map(i => ({id:i.id,amount:i.isCount ? 1 : 100,unit:i.unitLabel || 'g'}));
    const nutrients = engine.calculateNutritionForMember(portions,member);
    const snapshot = JSON.stringify(portions);
    portions.forEach(i => {getWeightBasis(engine.getIngredientById(i.id),i.unit);weightBasisText(engine.getIngredientById(i.id),i.unit);});
    assert.deepEqual(engine.calculateNutritionForMember(portions,member),nutrients);
    assert.equal(JSON.stringify(portions),snapshot);
}
const rice = engine.getIngredientById('brown_rice');
const merge = local => engine.mergeUserState('ingredients.json',{carbs:[local]},{carbs:[rice]}).carbs[0];
assert.equal(merge(before.carbs.find(i=>i.id==='brown_rice')).weightBasis,'cooked');
for (const local of [{...rice,name:'私房飯',weightBasis:undefined},{...rice,per100g:{kcal:370},weightBasis:undefined}]) {
    const merged=merge(local); assert.equal(merged.weightBasis,'unknown'); assert.deepEqual(merged.per100g,local.per100g);
}
assert.equal(merge({...rice,weightBasis:'dry'}).weightBasis,'dry', 'Explicit local metadata preserved');
for (const scope of ['household', 'ariel']) {
    engine.personalScope = scope;
    const legacy = before.carbs.find(i => i.id === 'brown_rice');
    const local = { carbs: [legacy, {id:'custom',name:'私房食材',unitLabel:'g',per100g:{kcal:42}}] };
    const saved = JSON.stringify(local);
    const emptyRemote = engine.mergeUserState('ingredients.json',local,{});
    assert.deepEqual(emptyRemote.carbs,local.carbs, 'Empty remote retains local ingredients');
    assert.equal(getWeightBasis(emptyRemote.carbs[0],'g'),'unknown');
    const populated = engine.mergeUserState('ingredients.json',local,official);
    assert.equal(populated.carbs.find(i=>i.id==='brown_rice').weightBasis,'cooked');
    assert.equal(getWeightBasis(populated.carbs.find(i=>i.id==='custom'),'g'),'unknown');
    assert.equal(JSON.stringify(local),saved, 'Merge does not mutate local cache input or references');
}
const { reactive, h, createRenderer, nextTick }=Vue;
const renderer=createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
engine.profiles=reactive(engine.profiles);
engine.data.pantryInventory={foodStockStatus:{brown_rice:true,egg:true,broccoli:true,chia_seeds:true,salmon:true}};
engine.data.dishes=[];
let view;
const root={};
renderer.render(h({setup(){view=Calculator.setup({engine});return()=>h('div');}}),root);
engine.data.dishes=[{id:'home_cooking',name:'測試料理',recommendedProteins:['egg','salmon'],recommendedVeggies:['broccoli'],recommendedCarbs:['brown_rice'],recommendedSauces:['chia_seeds'],sopSteps:['測試 SOP']}];
await nextTick();
view.diners.value={bebe:true,ariel:true,jason:true};
await nextTick();
const ing=view.getMemberActiveIngredients('bebe').find(i=>i.id==='brown_rice');
const amount=ing.amount;
view.adjustMemberAmount('bebe',ing,1);assert.equal(ing.amount,amount+1);
view.adjustMemberAmount('bebe',ing,-1);assert.equal(ing.amount,amount);
ing.amount=-2;view.onAmountBlur(ing);assert.equal(ing.amount,0);
ing.amount=amount;
await view.copySOP();
for (const text of ['【熟重】','【生重】','【乾重】','【重量基準待確認】','蛋：','測試 SOP']) assert(copied.includes(text),text);
for (const item of view.totalIngredientsList.value) assert.equal(item.amount,item.breakdown.reduce((n,b)=>n+Number(b.amount),0));
assert(!copied.includes('undefined'));
Vue.compile(Calculator.template, { decodeEntities: text => text });Vue.compile(Badge.template, { decodeEntities: text => text });
renderer.render(null,root);
console.log('PASS: five bases, count placeholders, legacy cache, 89 unchanged nutrition records, all members, steppers, totals, clipboard and Vue templates; no real storage/network.');
