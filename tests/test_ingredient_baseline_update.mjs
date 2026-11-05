import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import {
    BASELINE_UPDATE_KEY, INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY,
    approvedIngredientBaseline, applyIngredientBaseline, recoverIngredientBaseline
} from '../web/src/utils/IngredientBaselineUpdate.js';
import { mergeIngredientNutrition } from '../web/src/utils/IngredientNutritionCache.js';
import { ingredientNutritionBasis } from '../web/src/utils/IngredientUnit.js';

// Historical 99-item catalog is pinned to its released commit; origin/main now carries 101 items.
const text = fs.readFileSync('src/data/ingredients.json', 'utf8');
const official = await approvedIngredientBaseline(text);
const previousApproved = await approvedIngredientBaseline(execFileSync('git',['show','71beb38709c85390a85744297ea2b24ecd1abf99:src/data/ingredients.json'],{encoding:'utf8'}));
assert.equal(Object.values(previousApproved).flat().length,99);
const flatten = value => Object.values(value).flat();
const find = (value, id) => flatten(value).find(item => item.id === id);
const zero = { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 };
const privateItem = { id: 'private-only', name: '私人測試食材', category: 'sauces', per100g: { kcal: 42 }, price: 19 };
const old = structuredClone(official);
for (const name of ['豆腐麵', '蛤蜊', '洋菇']) {
    const item = flatten(old).find(item => item.name === name);
    item.per100g = { ...zero };
    delete item.nutritionReviewRequired;
}
const noodle = find(old, 'steamed_noodle');
noodle.name = '蒸煮麵'; delete noodle.brand;
noodle.per100g.kcal = 100; delete noodle.gramsPerPack;
noodle.weightBasis = 'cooked'; noodle.price = 35; noodle.preferredStores = ['私用通路'];
noodle.storageZones = ['freezer']; noodle.priorityTier = 4;
const custom = [noodle, ...flatten(old).filter(item => ['豆腐麵', '蛤蜊', '洋菇'].includes(item.name)), privateItem];
const seeded = new Map([
    [INGREDIENT_CACHE_KEY, JSON.stringify(old, null, 1)],
    [CUSTOM_INGREDIENT_KEY, JSON.stringify(custom, null, 1)],
    ['kitchen_v2_personal_state_household', '{"pantryInventory":{"foodStockStatus":{"steamed_noodle":true},"shoppingList":[{"targetId":"steamed_noodle"}]}}'],
    ['kitchen_v2_personal_state_ariel', '{"pantryInventory":{"foodStockStatus":{"private-only":true}}}'],
    ['kitchen_v2_dishes.json', '{"dishes":[{"id":"recipe","defaultIngredients":[{"id":"steamed_noodle","amount":1,"unit":"包"}]}]}'],
    ['kitchen_v2_daily_logs.json', '{"logs":[{"keep":"original"}]}'],
    ['kitchen_v2_ingredients.json_pre_nutrition_v1', 'existing backup'],
    ['family_kitchen_auth_session', 'untouched fake identity']
]);
let values;
let fail = () => false;
let writes = [];
const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
        writes.push(key);
        if (fail(key, value)) throw Error('Simulated storage failure');
        values.set(key, String(value));
    },
    removeItem: key => values.delete(key)
};
const reset = () => { values = new Map(seeded); fail = () => false; writes = []; };
const unchanged = () => { for (const [key, value] of seeded) assert.equal(values.get(key), value, key); };
reset();
await assert.rejects(approvedIngredientBaseline(text + ' '), /99／101 項/);
assert.equal(writes.length, 0);
const updated = applyIngredientBaseline(official, storage);
assert.equal(flatten(updated).length, 102, '101 canonical plus the custom-only private item');
assert.equal(new Set(flatten(updated).map(item => item.id)).size, 102);
assert.deepEqual(find(updated, privateItem.id), privateItem);
const adoptedNoodle = find(updated, noodle.id);
for (const key of ['name', 'price', 'preferredStores', 'storageZones', 'priorityTier']) assert.deepEqual(adoptedNoodle[key], noodle[key]);
assert.equal(adoptedNoodle.gramsPerPack, 65);
assert.equal(adoptedNoodle.weightBasis, 'dry');
assert.equal(adoptedNoodle.per100g.kcal, 362.2);
const savedCustom = JSON.parse(values.get(CUSTOM_INGREDIENT_KEY));
for (const name of ['豆腐麵', '蛤蜊', '洋菇']) {
    const item = flatten(updated).find(item => item.name === name);
    const saved = savedCustom.find(entry => entry.id === item.id);
    const base = find(official, item.id);
    for (const entry of [item, saved, mergeIngredientNutrition(base, item, saved)]) {
        assert.equal(entry.per100g, undefined);
        assert.equal(entry.perServing, undefined);
        assert.equal(entry.perUnit, undefined);
        assert.equal(entry.nutritionReviewRequired, true);
        assert.equal(ingredientNutritionBasis(entry), null);
    }
}
const reloaded = mergeIngredientNutrition(find(official, noodle.id), adoptedNoodle, savedCustom.find(item => item.id === noodle.id));
assert.equal(reloaded.weightBasis, 'dry', 'Accepted nutrition survives a preserved local display name');
assert.equal(reloaded.gramsPerPack, 65);
assert.equal(mergeIngredientNutrition(find(official, noodle.id), reloaded, savedCustom[0]).weightBasis, 'dry');
for (const [key, value] of seeded) if (![INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].includes(key)) assert.equal(values.get(key), value, key);
const record = JSON.parse(values.get(BASELINE_UPDATE_KEY));
assert.equal(record.status, 'complete');
assert.equal(record.original[INGREDIENT_CACHE_KEY], seeded.get(INGREDIENT_CACHE_KEY));
assert.equal(record.original[CUSTOM_INGREDIENT_KEY], seeded.get(CUSTOM_INGREDIENT_KEY));
const later = JSON.parse(values.get(INGREDIENT_CACHE_KEY));
const tofu = flatten(later).find(item => item.name === '豆腐麵');
tofu.per100g = { kcal: 77, protein: 9, fat: 2, carbs: 3, sodium: 5 };
tofu.nutritionCache.edited = true; tofu.nutritionReviewRequired = false;
values.set(INGREDIENT_CACHE_KEY, JSON.stringify(later));
const count = writes.length;
assert.equal(applyIngredientBaseline(official, storage), null);
assert.equal(writes.length, count, 'Already-completed action performs no writes');
assert.equal(mergeIngredientNutrition(find(official, tofu.id), tofu).per100g.kcal, 77);

for (const stage of ['backup', 'custom', 'cache', 'complete']) {
    reset(); let thrown = false;
    fail = (key, value) => {
        const match = stage === 'backup' ? key === BASELINE_UPDATE_KEY
            : stage === 'custom' ? key === CUSTOM_INGREDIENT_KEY
            : stage === 'cache' ? key === INGREDIENT_CACHE_KEY
            : key === BASELINE_UPDATE_KEY && JSON.parse(value).status === 'complete';
        if (match && !thrown) { thrown = true; return true; }
        return false;
    };
    assert.throws(() => applyIngredientBaseline(official, storage));
    unchanged();
    if (stage === 'backup') assert.deepEqual(writes, [BASELINE_UPDATE_KEY]);
    fail = () => false;
    assert(applyIngredientBaseline(official, storage), 'A failed attempt can be retried');
    assert.equal(JSON.parse(values.get(BASELINE_UPDATE_KEY)).original[INGREDIENT_CACHE_KEY], seeded.get(INGREDIENT_CACHE_KEY));
}
for (const changedKeys of [[CUSTOM_INGREDIENT_KEY], [CUSTOM_INGREDIENT_KEY, INGREDIENT_CACHE_KEY]]) {
    reset();
    const before = Object.fromEntries([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => [key, values.get(key)]));
    values.set(BASELINE_UPDATE_KEY, JSON.stringify({ status: 'pending', before, original: before }));
    for (const key of changedKeys) values.set(key, 'interrupted write');
    assert.equal(recoverIngredientBaseline(storage), false);
    unchanged();
    recoverIngredientBaseline(storage); unchanged();
}
reset();
fail = (key, value) => key === INGREDIENT_CACHE_KEY || (key === BASELINE_UPDATE_KEY && JSON.parse(value).status === 'rolledBack');
assert.throws(() => applyIngredientBaseline(official, storage), error => error.requiresReload === true);
assert.equal(JSON.parse(values.get(BASELINE_UPDATE_KEY)).status, 'pending');
fail = () => false; recoverIngredientBaseline(storage); unchanged();
for (const [key, value] of [[CUSTOM_INGREDIENT_KEY, '{bad JSON'], [INGREDIENT_CACHE_KEY, '[]'],
    [CUSTOM_INGREDIENT_KEY, JSON.stringify([privateItem, privateItem])],
    [CUSTOM_INGREDIENT_KEY, JSON.stringify([{ ...privateItem, name: '豆腐麵' }])],
    [CUSTOM_INGREDIENT_KEY, JSON.stringify([{ ...privateItem, photoUrl: 'data:image/png;base64,FAKE' }])]]) {
    reset(); values.set(key, value);
    const original = new Map(values);
    assert.throws(() => applyIngredientBaseline(official, storage));
    assert.deepEqual(values, original); assert.equal(writes.length, 0);
}
reset(); values.delete(INGREDIENT_CACHE_KEY); values.delete(CUSTOM_INGREDIENT_KEY);
assert.equal(flatten(applyIngredientBaseline(official, storage)).length, 101);
assert.equal(values.has(CUSTOM_INGREDIENT_KEY), false);

// Exercise the real Engine entry point, loader and edit path with no real browser or network.
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {}, removeEventListener() {} };
globalThis.document = {};
globalThis.Vue = { reactive: value => value };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
for (const scope of [null, 'household', 'ariel']) {
    reset();
    let requests = 0;
    globalThis.fetch = async (url, options) => {
        requests++;
        assert.equal(new URL(url).pathname.endsWith('/src/data/ingredients.json'), true);
        assert.equal(options.method, undefined, 'Only a static GET is allowed');
        return { ok: true, text: async () => text };
    };
    const engine = new Engine(); engine.personalScope = scope;
    engine.personalKitchenSync = { getState() { throw Error('No sync permitted'); }, saveState() { throw Error('No sync permitted'); } };
    assert.equal(await engine.adoptIngredientBaseline(), true);
    assert.equal(engine.data.ingredientBaselineApplied, true);
    assert.equal(requests, 1);
    assert.equal(await engine.adoptIngredientBaseline(), false); assert.equal(requests, 1);
    assert.equal(engine.getNutritionIssues([{ id: tofu.id, amount: 100, unit: 'g' }]).length, 1);
    await engine.saveIngredient({ ...engine.getIngredientById(tofu.id), per100g: { kcal: 77, protein: 9, fat: 2, carbs: 3, sodium: 5 } });
    globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(official) });
    const rebooted = new Engine();
    await rebooted.fetchJson('ingredients.json', 'rawIngredients', {});
    assert.equal(find(rebooted.data.rawIngredients, tofu.id).per100g.kcal, 77, 'Subsequent mobile edits survive a fresh official load');
    assert.equal(rebooted.data.ingredientBaselineApplied, true);
    for (const [key, value] of seeded) if (![INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].includes(key)) assert.equal(values.get(key), value, key);
}
reset();
const engine = new Engine();
globalThis.fetch = async () => ({ ok: true, text: async () => '{}' });
await assert.rejects(engine.adoptIngredientBaseline(), /99／101 項/); unchanged();
globalThis.fetch = async () => { throw Error('offline'); };
await assert.rejects(engine.adoptIngredientBaseline(), /offline/); unchanged();

const Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
globalThis.Vue = Vue;
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.alert = () => {};
globalThis.confirm = () => true;
const { default: Modal } = await import('../web/src/components/IngredientDetailModal.js');
reset(); applyIngredientBaseline(official, storage);
const modalEngine = new Engine();
modalEngine.data.rawIngredients = JSON.parse(values.get(INGREDIENT_CACHE_KEY));
modalEngine.data.ingredients = flatten(modalEngine.data.rawIngredients);
const modalProps = Vue.reactive({ engine: modalEngine, isOpen: false, mode: 'edit', initialIngredient: modalEngine.getIngredientById(tofu.id), context: 'pantry' });
let modalView;
const renderer = Vue.createRenderer({ createElement: () => ({}), insert() {}, remove() {}, setElementText() {}, patchProp() {},
    createText: () => ({}), createComment: () => ({}), setText() {}, setComment() {}, parentNode: () => null, nextSibling: () => null });
const root = {};
renderer.render(Vue.h({ setup() { modalView = Modal.setup(modalProps, { emit() {} }); return () => Vue.h('div'); } }), root);
modalProps.isOpen = true; await Vue.nextTick();
modalView.form.price = 123; await modalView.handleSave();
assert.equal(modalEngine.getIngredientById(tofu.id).per100g, undefined, 'A metadata save cannot turn missing nutrition into zero');
modalView.form.per100g.kcal = 77; modalView.on100gInput(); await modalView.handleSave();
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(official) });
const modalReboot = new Engine(); await modalReboot.fetchJson('ingredients.json', 'rawIngredients', {});
assert.equal(find(modalReboot.data.rawIngredients, tofu.id).per100g.kcal, 77, 'Actual modal nutrition edits survive reload');
renderer.render(null, root);
let App;
const uiVue = { ...Vue, onMounted() {}, onBeforeUnmount() {}, createApp: app => { App = app; return { mount() {} }; } };
const source = fs.readFileSync('web/src/main.js', 'utf8').replace(/^import .*;$/gm, '');
let accepted = false;
vm.runInNewContext(source, { Vue: uiVue, KitchenEngine: Engine, CalculatorView: {}, TrackerView: {}, PantryView: {}, ShoppingView: {},
    authService: { message: 'fake logged out' }, confirm: () => accepted });
Vue.compile(App.template, { decodeEntities: text => text, onError: error => { throw error; } });
const view = App.setup();
view.engine.value = new Engine();
let calls = 0;
view.engine.value.adoptIngredientBaseline = async () => { calls++; view.engine.value.data.ingredientBaselineApplied = true; };
await view.adoptIngredientBaseline(); assert.equal(calls, 0, 'Cancel leaves this device unchanged');
accepted = true;
await view.adoptIngredientBaseline(); assert.equal(calls, 1);
await view.adoptIngredientBaseline(); assert.equal(calls, 1);
assert(view.baselineMessage.value.includes('仍待補營養'));
console.log('PASS: pinned 99/101-item baseline; opt-in/cancel/once; exact backups, quota failures and crash recovery; custom-only and private metadata; both scopes/logged-out unchanged; three missing nutrients; actual Engine save/reload retains later edits; no real network.');
