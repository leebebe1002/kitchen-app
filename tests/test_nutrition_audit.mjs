import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const official = read('src/data/ingredients.json');
const audit = read('docs/audits/nutrition-2026-10-28.json');
const all = Object.values(official).flat();
const byId = new Map(all.map(i => [i.id, i]));
const keys = ['kcal', 'protein', 'fat', 'carbs', 'sodium'];
const countUnits = new Set(['顆', '個', '條', '包', '根']);
assert.equal(all.length, 89);
assert.equal(byId.size, 89);
assert.deepEqual(audit.ingredients.map(i => i.id), all.map(i => i.id));
const counts = {};
for (const row of audit.ingredients) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    const ing = byId.get(row.id);
    assert(row.decision.length > 0, row.id);
    for (const field of ['per100g', 'perServing', 'perUnit']) {
        if (row.id !== 'steamed_noodle') assert.deepEqual(ing[field], row.after[field], row.id + ':' + field);
        if (ing[field]) for (const key of keys) {
            assert(Number.isFinite(ing[field][key]) && ing[field][key] >= 0, row.id + ':' + key);
        }
    }
    if (row.status === '有來源的通用估算' && row.id !== 'steamed_noodle') {
        assert(row.sourcesAdopted && row.sourceRefs.length > 0);
        for (const key of keys) {
            const mean = row.sourceRefs.reduce((sum, ref) => {
                const source = audit.sources[ref];
                assert(source.recordId && source.url && source.checkedAt === '2026-10-28');
                assert(source.dataset === 'TFDA_20' || source.dataset === 'USDA_SR_LEGACY');
                assert(Number.isFinite(source.nutrients[key]), ref + ':' + key);
                return sum + source.nutrients[key];
            }, 0) / row.sourceRefs.length;
            assert(Math.abs(ing.per100g[key] - mean) <= 0.050000001, row.id + ': source rounding');
        }
    } else if (!['coffee_capsule', 'green_pepper_noodle', 'steamed_noodle'].includes(row.id)) {
        assert.deepEqual(row.after, row.beforeTask, row.id + ': unverified values must stay intact');
    }
}
assert.deepEqual(counts, audit.counts);
assert.deepEqual(all.filter(i => i.per100g && keys.every((k, j) => i.per100g[k] === [100, 10, 5, 10, 100][j])).map(i => i.id), ['shrimp_paste', 'prince_noodles']);
assert.equal(audit.ingredients.filter(i => i.originalPlaceholder).length, 15);
assert.deepEqual(byId.get('steamed_noodle').per100g,{kcal:362.2,protein:9.1,fat:1,carbs:79.2,sodium:712});
assert.equal(byId.get('steamed_noodle').gramsPerPack,65);
assert.equal(byId.get('steamed_noodle').brand,'維力');
assert.deepEqual(byId.get('angel_hair_pasta').per100g, {kcal:160, protein:3, carbs:35, fat:1, sodium:10});
assert.deepEqual(byId.get('edamame').per100g, {kcal:129, protein:14.6, fat:3.3, carbs:12.5, sodium:1});
assert.deepEqual(byId.get('sweet_potato').per100g, {kcal:86, protein:1.6, fat:0.1, carbs:20.1, sodium:55});
assert.equal(byId.get('cocoa_powder').per100g.kcal, 228);
assert.equal(audit.sources['USDA:169593'].fiber, 37);
const cocoa = audit.sources['USDA:169593'];
const factors = cocoa.conversionFactors.find(f => f.type === '.CalorieConversionFactor');
assert(Math.abs(cocoa.nutrients.protein * factors.proteinValue + cocoa.nutrients.fat * factors.fatValue + cocoa.nutrients.carbs * factors.carbohydrateValue - 228) < 1);
assert.equal(byId.get('yuzu_liqueur').per100g.kcal, 160, 'Alcohol energy cannot be discarded by 4/9/4');
assert.equal(byId.get('yuzu_liqueur').perServing.kcal, 48);
assert.equal(audit.ingredients.find(i => i.id === 'yuzu_liqueur').status, '來源待確認');
assert.equal(audit.ingredients.find(i => i.id === 'ing_1787563079531').status, '來源待確認');
assert.deepEqual(audit.salmonMethod.recordIds, [173686,173688,173689,173691,173715,175136,175138,175167]);
assert.deepEqual(byId.get('salmon').per100g, {kcal:151.6, protein:20.7, fat:7.1, carbs:0, sodium:55.8});

// All storage, authentication and sync scenarios below use isolated in-memory fakes.
const values = new Map();
globalThis.localStorage = { getItem:k => values.get(k) ?? null, setItem:(k,v) => values.set(k,String(v)), removeItem:k => values.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = { addEventListener() {}, location:{hostname:'audit.invalid'} };
globalThis.document = {};
globalThis.fetch = async () => { throw Error('Real network forbidden in nutrition audit tests'); };
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8') + ';Vue', {console,setTimeout,clearTimeout});
const {default: KitchenEngine} = await import('../web/src/engine/KitchenEngine.js');
const {readPersonalKitchenState, writePersonalKitchenState, emptyPersonalKitchenState} = await import('../web/src/services/PersonalKitchenState.js');
const engine = new KitchenEngine();
engine.data.ingredients = all;
const single = (id,amount,unit) => [{id,amount,unit}];
for (const member of ['bebe','ariel','jason']) {
    assert.equal(engine.calculateNutritionForMember(single('coffee_capsule',1,'顆'),member).kcal,20);
    assert.equal(engine.calculateNutritionForMember(single('coffee_capsule',2,'顆'),member).sodium,36);
    assert.equal(engine.calculateNutritionForMember(single('green_pepper_noodle',1,'包'),member).kcal,390.9);
    assert.equal(engine.calculateNutritionForMember(single('salmon',150,'g'),member).kcal,227.4);
    assert.equal(engine.calculateNutritionForMember(single('smoked_sea_salt',1,'g'),member).sodium,388);
    assert.equal(engine.calculateNutritionForMember(single('soy_sauce',5,'g'),member).sodium,274.5);
    assert.equal(engine.calculateNutritionForMember(single('full_fat_milk_250',250,'g'),member).kcal,157.5);
    assert.equal(engine.calculateNutritionForMember(single('angel_hair_pasta',100,'g'),member).kcal,160);
}
const dishes = read('src/data/dishes.json').dishes;
const home = dishes.find(d => d.id === 'home_cooking');
assert.equal(engine.calculateNutritionForMember(home.memberPortions.bebe,'bebe').kcal,464.2);
const recipeRisks = [];
for (const dish of dishes) {
    const sets = {default:dish.defaultIngredients || [], ...dish.memberPortions};
    for (const [member,portions] of Object.entries(sets)) {
        for (const req of portions) {
            const ing = byId.get(req.id);
            assert(ing, dish.id + ': missing ' + req.id);
            if (((countUnits.has(req.unit) !== countUnits.has(ing.unitLabel)) ||
                (req.unit === 'ml' && ing.unitLabel === 'g')) && engine.getNutritionIssues([req]).length) {
                recipeRisks.push({dish:dish.id,member,id:req.id,recipeUnit:req.unit,ingredientUnit:ing.unitLabel});
            }
        }
        const snapshot = JSON.stringify(portions);
        const result = engine.calculateNutritionForMember(portions, member);
        const missingBasis = portions.some(req => Number(req.amount) > 0 && engine.getNutritionIssues([req]).length);
        for (const value of Object.values(result)) assert(missingBasis ? Number.isNaN(value) : Number.isFinite(value) && value >= 0);
        assert.equal(JSON.stringify(portions), snapshot);
    }
}
assert(recipeRisks.some(r => r.id === 'bacon' && r.recipeUnit === 'g'), 'Known unresolved bacon grams/strip conflict must stay visible');
assert(!recipeRisks.some(r => r.id === 'steamed_noodle'), 'Verified 65g pack must no longer be a conversion risk');
const unresolvedCounts = all.filter(i => countUnits.has(i.unitLabel) && !i.isCount && !i.perUnit).map(i => i.id);
assert.deepEqual(unresolvedCounts,['century_egg','mushroom_meatball','egg_dumpling','taro_meatball','potato_ramen']);

const legacy = Object.fromEntries(Object.entries(official).map(([cat,group]) => [cat,group.map(i => {
    const row = audit.ingredients.find(r => r.id === i.id);
    const result = {...i,...row.atHead};
    for (const field of ['per100g','perServing','perUnit']) if (!row.atHead[field]) delete result[field];
    return result;
})]));
for (const scope of ['household','ariel']) {
    engine.personalScope = scope;
    const state = {...emptyPersonalKitchenState(), pantryInventory:{foodStockStatus:{salmon:scope==='household'}, supplyStockStatus:{}, shoppingList:[{id:scope,targetId:'salmon'}],foodCart:[]}};
    writePersonalKitchenState(scope,state);
    const stored = localStorage.getItem('kitchen_v2_personal_state_'+scope);
    const cached = structuredClone(legacy);
    cached.proteins.find(i => i.id === 'salmon').preferredStores = ['義美'];
    const custom = {id:'custom_test',name:'稽核測試專用食材',category:'veggies',unitLabel:'g',per100g:{kcal:42}};
    cached.veggies.push(custom);
    const snapshot = JSON.stringify(cached);
    const merged = engine.mergeUserState('ingredients.json',cached,official);
    assert.equal(merged.proteins.find(i => i.id === 'salmon').per100g.kcal,151.6, 'Recognized legacy defaults receive corrected official nutrition');
    assert.deepEqual(merged.proteins.find(i => i.id === 'salmon').preferredStores,['義美']);
    assert.deepEqual(merged.veggies.find(i => i.id === custom.id),custom);
    assert.equal(JSON.stringify(cached),snapshot);
    assert.equal(localStorage.getItem('kitchen_v2_personal_state_'+scope),stored);
    const edited = structuredClone(cached);
    edited.proteins.find(i => i.id === 'salmon').per100g.kcal=321;
    assert.equal(engine.mergeUserState('ingredients.json',edited,official).proteins.find(i => i.id === 'salmon').per100g.kcal,321,'User edits protected');
    assert.deepEqual(engine.mergeUserState('ingredients.json',cached,{}).proteins,cached.proteins,'Empty remote retains local');
    assert.equal(engine.mergeUserState('ingredients.json',null,official).proteins.find(i => i.id === 'salmon').per100g.kcal,151.6,'Fresh install receives new values');
    // Exercise the actual loader with fake responses; no real browser cache or API.
    localStorage.setItem('kitchen_v2_ingredients.json',JSON.stringify(cached));
    globalThis.fetch=async () => ({ok:true,json:async () => structuredClone(official)});
    await engine.fetchJson('ingredients.json','rawIngredients',{});
    assert.equal(engine.data.rawIngredients.proteins.find(i => i.id === 'salmon').per100g.kcal,151.6);
    globalThis.fetch=async () => {throw Error('Real network forbidden');};
    engine.data.rawIngredients=structuredClone(official);
    const duplicate={...custom,id:'custom_duplicate',name:'洋蔥'};
    engine.data.rawIngredients.veggies.push(duplicate);
    const pantry = structuredClone(readPersonalKitchenState(scope).pantryInventory);
    engine.data.pantryInventory={...pantry,foodStockStatus:{...pantry.foodStockStatus,custom_duplicate:true},shoppingList:[...pantry.shoppingList,{targetId:'custom_duplicate',name:'洋蔥'}]};
    localStorage.setItem('kitchen_v2_custom_ingredients',JSON.stringify([custom,duplicate]));
    engine.cleanDuplicateIngredients();
    engine.mergeCustomUserIngredients();
    assert.equal(engine.data.pantryInventory.foodStockStatus.onion,true);
    assert.equal(engine.data.pantryInventory.shoppingList.find(i => i.name==='洋蔥').targetId,'onion');
    assert(engine.data.rawIngredients.veggies.some(i => i.id===custom.id));
    assert(!engine.data.rawIngredients.veggies.some(i => i.id===duplicate.id));
}
assert.equal(readPersonalKitchenState('household').pantryInventory.foodStockStatus.salmon,true);
assert.equal(readPersonalKitchenState('ariel').pantryInventory.foodStockStatus.salmon,false);

for (const scope of ['household','ariel']) {
    engine.personalScope=scope;
    engine.applyPersonalKitchenState(readPersonalKitchenState(scope));
    engine.personalKitchenSync={enabled:false};
    assert.equal(await engine.syncPersonalKitchenState(),false,'Logged out does not use remote');
    let saved;
    engine.personalKitchenSync={enabled:true,getState:async id => {
        assert.equal(id,scope);
        return {...emptyPersonalKitchenState(),updatedAt:'2999-01-01T00:00:00Z'};
    },saveState:async (id,state) => {assert.equal(id,scope);saved=JSON.parse(JSON.stringify(state));return {...state,updatedAt:'2026-10-28T00:00:00Z'};}};
    await engine.syncPersonalKitchenState();
    assert(saved.pantryInventory.shoppingList.length>0,'Empty newer remote cannot wipe local data');
    const remote={...emptyPersonalKitchenState(),pantryInventory:{foodStockStatus:{edamame:true},supplyStockStatus:{},shoppingList:[{id:scope+'_remote'}],foodCart:[]},updatedAt:'2999-01-01T00:00:00Z'};
    engine.personalKitchenSync={enabled:true,getState:async () => remote,saveState:async () => {throw Error('Newer populated remote should be read');}};
    await engine.syncPersonalKitchenState();
    assert.equal(engine.data.pantryInventory.shoppingList[0].id,scope+'_remote');
    assert.equal(readPersonalKitchenState(scope).pantryInventory.foodStockStatus.edamame,true);
}
assert.equal(readPersonalKitchenState('household').pantryInventory.shoppingList[0].id,'household_remote');
assert.equal(readPersonalKitchenState('ariel').pantryInventory.shoppingList[0].id,'ariel_remote');
console.log('PASS: 89 audit records, primary-source arithmetic, protected labels, count calculations, 10 recipes/all members, cache compatibility, duplicates and isolated scope/sync fakes.');
console.log('PENDING SOURCE CONFIRMATION (guarded, no guessed conversion):',JSON.stringify({unresolvedCounts,recipeUnitConflicts:recipeRisks.length,oldCacheOverrides:false}));
