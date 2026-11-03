import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { authorizeTestEngine } from './personal_scope_fixture.mjs';

const renderErrors = [];
const originalError = console.error;
console.error = (...args) => { renderErrors.push(args); originalError(...args); };

const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
globalThis.sessionStorage = localStorage;
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {}, removeEventListener() {} };
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.alert = () => {};
globalThis.confirm = () => true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.fetch = () => { throw Error('Real network forbidden'); };
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const { default: Calculator } = await import('../web/src/views/CalculatorView.js');
const official = Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'))).flat();
const { h, createRenderer, nextTick } = Vue;
const renderer = createRenderer({ createElement: () => ({}), insert() {}, remove() {}, setElementText() {}, patchProp() {}, createText: () => ({}), createComment: () => ({}), setText() {}, setComment() {}, parentNode: () => null, nextSibling: () => null });
function mount(engine) {
    let view;
    const root = {};
    renderer.render(h({ setup() { view = Calculator.setup({ engine }); return () => h('div'); } }), root);
    return { view, close: () => renderer.render(null, root) };
}

for (const scope of ['household', 'ariel', null]) {
    values.clear();
    const engine = new Engine();
    if (scope) authorizeTestEngine(engine, scope);
    engine.data.householdSupplies = { supplies: [] };
    engine.personalKitchenSync = { enabled: false };
    engine.canAccessMeal = member => (scope === 'household' ? ['bebe', 'jason'] : scope === 'ariel' ? ['ariel'] : []).includes(member);
    engine.data.ingredients = structuredClone(official);
    const customCounts = ['個', '根', '片', '盒', '罐', '袋'].map((unitLabel, index) => ({ id: 'custom_count_' + index, name: ['藍莓', '優格', '胡椒', '蜂蜜', '可可', '燕麥脆片'][index], category: 'proteins', unitLabel, per100g: { kcal: 100 } }));
    engine.data.ingredients.push(...customCounts);
    engine.data.pantryInventory = { foodStockStatus: Object.fromEntries(engine.data.ingredients.map(i => [i.id, true])), shoppingList: [], foodCart: [] };
    const { view, close } = mount(engine);
    const dish = { id: 'home_cooking', name: '隔離測試料理', recommendedProteins: [], defaultIngredients: [], memberPortions: { bebe: [], jason: [], ariel: [] } };
    engine.data.dishes = [dish];
    engine.data.rawDishes = { dishes: engine.data.dishes };
    await nextTick();
    view.diners.value = { bebe: true, jason: true, ariel: true };
    const pending = ['century_egg', 'mushroom_meatball', 'egg_dumpling', 'taro_meatball', 'potato_ramen'];
    for (const id of [...pending, 'egg', ...customCounts.map(i => i.id)]) {
        const ing = engine.getIngredientById(id);
        await view.addExistingToDish(ing);
        await nextTick();
        assert.equal(dish.defaultIngredients.find(i => i.id === id).amount, 1, id + ': count must not inherit a gram default');
        for (const member of ['bebe', 'jason', 'ariel']) {
            assert.equal(dish.memberPortions[member].find(i => i.id === id).amount, 1, member + ':' + id);
            assert.equal(view.memberIngredients.value[member].find(i => i.id === id).amount, 1);
            assert.equal(view.memberIngredients.value[member].find(i => i.id === id).unit, ing.unitLabel);
        }
        assert.equal(view.totalIngredientsList.value.find(i => i.id === id).amount, 3);
    }
    // Shared modal's new-ingredient callback uses the same count-safe add path.
    const created = { id: 'fresh_count', name: '新加測試食材', category: 'proteins', unitLabel: '顆', per100g: { kcal: 99 } };
    await engine.saveIngredient(created);
    await view.handleSharedModalSaved(engine.getIngredientById(created.id), true);
    for (const member of ['bebe', 'jason', 'ariel']) {
        const item = view.memberIngredients.value[member].find(i => i.id === created.id);
        assert.deepEqual({amount:item.amount,unit:item.unit},{amount:1,unit:'顆'});
        view.adjustMemberAmount(member, item, 1);
        assert.equal(item.amount, 2, 'Missing nutrition must not prevent manual quantity input');
    }
    engine.getIngredientById('salmon').isCount = true;
    await view.addExistingToDish(engine.getIngredientById('salmon'));
    await nextTick();
    assert.equal(dish.memberPortions.bebe.find(i => i.id === 'salmon').amount, 60);
    assert.equal(dish.memberPortions.jason.find(i => i.id === 'salmon').amount, 78);
    const saved = JSON.parse(values.get('kitchen_v2_dishes.json')).dishes[0];
    assert.equal(saved.memberPortions.jason.find(i => i.id === 'egg_dumpling').amount, 1);
    for (const id of pending) {
        assert(engine.getNutritionIssues([{ id, amount: 1, unit: engine.getIngredientById(id).unitLabel }]).length);
        assert(Number.isNaN(engine.calculateNutritionForMember([{ id, amount: 1 }], 'bebe').kcal));
    }
    const pendingPortions = () => Object.fromEntries(Object.entries(view.memberIngredients.value).map(([member, list]) => [member, list.filter(i => engine.getNutritionIssues([i]).length)]));
    const beforeCalculate = JSON.stringify(pendingPortions());
    await view.calculate();
    assert.equal(JSON.stringify(pendingPortions()), beforeCalculate, 'Pending count quantities are preserved during calculation');
    let recorded = 0;
    engine.recordMeal = async () => { recorded++; };
    await view.recordMeal();
    assert.equal(recorded, 0, 'Unverified count nutrition must still block meal recording');

    // Re-selecting a recommended ingredient must fill missing member rows by unit,
    // even when a food name would otherwise trigger a gram-based role.
    for (const custom of customCounts) {
        view.toggleIngredient(custom.id);
        for (const member of ['bebe', 'jason', 'ariel']) {
            const list = view.memberIngredients.value[member];
            list.splice(list.findIndex(i => i.id === custom.id), 1);
        }
        view.toggleIngredient(custom.id);
        for (const member of ['bebe', 'jason', 'ariel']) {
            const item = view.memberIngredients.value[member].find(i => i.id === custom.id);
            assert.deepEqual({amount:item.amount,unit:item.unit},{amount:1,unit:custom.unitLabel});
        }
    }

    // Old/manual quantities cannot be silently reinterpreted or overwritten by re-adding.
    for (const member of ['bebe', 'jason']) {
        const amount = member === 'bebe' ? 60 : 78;
        dish.memberPortions[member].find(i => i.id === 'egg_dumpling').amount = amount;
        view.memberIngredients.value[member].find(i => i.id === 'egg_dumpling').amount = amount;
    }
    await view.addExistingToDish(engine.getIngredientById('egg_dumpling'));
    await nextTick();
    assert.equal(dish.memberPortions.bebe.find(i => i.id === 'egg_dumpling').amount, 60);
    assert.equal(dish.memberPortions.jason.find(i => i.id === 'egg_dumpling').amount, 78);
    for (const member of ['bebe', 'jason']) view.savePortionMemory(member);
    await view.calculate();
    assert.equal(view.memberIngredients.value.bebe.find(i => i.id === 'egg_dumpling').amount, 60);
    assert.equal(view.memberIngredients.value.jason.find(i => i.id === 'egg_dumpling').amount, 78);
    assert(engine.getNutritionIssues([{ id: 'egg_dumpling', amount: 60, unit: '顆' }]).length);
    close();
    const reopened = mount(engine);
    await nextTick();
    assert.equal(reopened.view.memberIngredients.value.bebe.find(i => i.id === 'egg_dumpling').amount, 60);
    assert.equal(reopened.view.memberIngredients.value.jason.find(i => i.id === 'egg_dumpling').amount, 78);
    reopened.close();
}
Vue.compile(Calculator.template, { decodeEntities: text => text });
// Check each unit alone so another unresolved ingredient cannot mask an unsafe recording.
for (const scope of ['household', 'ariel', null]) {
    for (const unit of ['顆', '個', '條', '包', '根', '片', '盒', '罐', '袋']) {
        values.clear();
        const engine = new Engine();
        if (scope) authorizeTestEngine(engine, scope);
    engine.data.householdSupplies = { supplies: [] };
        engine.personalKitchenSync = { enabled: false };
    engine.canAccessMeal = member => (scope === 'household' ? ['bebe', 'jason'] : scope === 'ariel' ? ['ariel'] : []).includes(member);
        engine.data.ingredients = [{ id: 'unit_fixture', name: '隔離單位測試', category: 'proteins', unitLabel: unit, per100g: { kcal: 100 } }];
        engine.data.pantryInventory = { foodStockStatus: { unit_fixture: true } };
        const app = mount(engine);
        engine.data.dishes = [{ id: 'home_cooking', name: '隔離料理', recommendedProteins: ['unit_fixture'], memberPortions: {} }];
        await nextTick();
        app.view.diners.value = { bebe: true, jason: true, ariel: true };
        await nextTick();
        let recorded = 0;
        engine.recordMeal = async () => { recorded++; };
        for (const member of ['bebe', 'jason', 'ariel']) {
            const req = [{ id: 'unit_fixture', amount: 2, unit }];
            assert(engine.getNutritionIssues(req).length, unit + ': missing unit nutrition must block');
            assert(Number.isNaN(engine.calculateNutritionForMember(req, member).kcal));
            assert.equal(engine.calculateNutritionForMember([{ ...req[0], amount: 0 }], member).kcal, 0);
        }
        await app.view.recordMeal();
        assert.equal(recorded, 0, unit + ': unresolved recording must be blocked independently');
        engine.getIngredientById('unit_fixture').perUnit = { kcal: 50, protein: 5 };
        for (const member of ['bebe', 'jason', 'ariel']) {
            const req = [{ id: 'unit_fixture', amount: 2, unit }];
            assert.deepEqual(engine.getNutritionIssues(req), []);
            assert.equal(engine.calculateNutritionForMember(req, member).kcal, 100);
            assert.equal(engine.calculateNutritionForMember(req, member).protein, 10);
            assert(engine.getNutritionIssues([{ ...req[0], unit: 'g' }]).length, 'No inferred conversion to grams');
        }
        await app.view.recordMeal();
        assert.equal(recorded, scope === 'household' ? 2 : scope === 'ariel' ? 1 : 0, unit + ': verified unit nutrition permits recording only for authorized members');
        app.close();
    }
}
console.error = originalError;
assert.equal(renderErrors.length, 0, 'Opening a saved dish must not emit setup/watch errors');
console.log('PASS: both scopes and signed-out count defaults/all members, gram regression, legacy quantities/memory, blocked unverified recording and Vue template; isolated fixtures only.');
