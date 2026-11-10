import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { ingredientSourceStatus, INGREDIENT_SOURCE_LABELS } from '../web/src/utils/IngredientSourceStatus.js';
import { officialNutritionEvidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { nutritionEvidenceIssue } from '../web/src/utils/NutritionEvidence.js';

const foods = Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'))).flat();
const byId = id => structuredClone(foods.find(item => item.id === id));
const classify = id => ingredientSourceStatus(byId(id));

test('three labels describe evidence, not official catalog membership or stock status', () => {
    assert.deepEqual(Object.values(INGREDIENT_SOURCE_LABELS), ['產品標示','通用','待確認']);
    assert.equal(classify('sous_vide_chicken').code, 'generic');
    assert.equal(classify('edamame').code, 'generic');
    assert.equal(classify('shrimp').code, 'generic');
    assert.equal(classify('broccoli').code, 'generic');
    assert.equal(classify('angel_hair_pasta').code, 'product');
    assert.equal(classify('tuna').code, 'pending');
    assert.equal(classify('sugar_free_peanut_butter').code, 'pending');
    assert.equal(classify('corn').code, 'pending');
    assert.match(classify('corn').reason, /好市多|綠巨人/);
    assert.equal(classify('edamame').sources[0].dataset, 'TFDA_20');
});

test('snapshot mismatch, brand mismatch, unknown foods and unsupported count units fail closed', () => {
    const fish = byId('shrimp'); fish.per100g.kcal += 1;
    assert.equal(ingredientSourceStatus(fish).code, 'pending');
    assert.match(ingredientSourceStatus(fish).reason,/變更|快照不同/);
    const tuna = byId('tuna'); tuna.brand = 'different';
    assert.equal(ingredientSourceStatus(tuna).code, 'pending');
    assert.equal(ingredientSourceStatus({id:'unknown',name:'未登錄食材',unitLabel:'g'}).code, 'pending');
    const dumpling = byId('egg_dumpling');
    assert.equal(ingredientSourceStatus(dumpling).code,'pending');
});

test('explicit verified product label and checked database source accepted; missing sources stay pending', () => {
    const sample = byId('egg');
    Object.assign(sample, structuredClone(officialNutritionEvidence.egg.evidence.snapshot),
        {nutritionEvidence: structuredClone(officialNutritionEvidence.egg.evidence)});
    assert.equal(nutritionEvidenceIssue(sample), '');
    assert.equal(ingredientSourceStatus(sample).code, 'generic');

    const labeled = byId('greek_yogurt');
    const original = JSON.stringify(labeled);
    labeled.nutritionEvidence = {
        kind:'product_label',status:'verified',
        identity:{name:labeled.name,brand:labeled.brand||''},
        snapshot:structuredClone(officialNutritionEvidence.greek_yogurt.evidence.snapshot),
        note:'使用者核對過實際產品'
    };
    assert.equal(ingredientSourceStatus(labeled).code,'product');
    labeled.nutritionReviewRequired = true;
    assert.equal(ingredientSourceStatus(labeled).code,'pending');
    assert.equal(JSON.stringify(byId('greek_yogurt')),original);

    const generic = byId('shrimp');
    generic.nutritionEvidence = structuredClone(officialNutritionEvidence.shrimp.evidence);
    generic.nutritionEvidence.sources = [];
    assert.equal(ingredientSourceStatus(generic).code,'pending');
});

test('no network or storage, and full local catalog has precisely one status per canonical ID', () => {
    const before = JSON.stringify(foods);
    const tally = {product:0,generic:0,pending:0};
    for (const item of foods) {
        const a = ingredientSourceStatus(item);
        assert.equal(ingredientSourceStatus(item).code,a.code);
        assert(Object.hasOwn(tally,a.code),item.id);
        tally[a.code]++;
    }
    assert.equal(Object.values(tally).reduce((a,b)=>a+b,0),foods.length);
    assert.equal(JSON.stringify(foods),before);
});

test('pantry shows filter/count/reason and edit modal shows current saved tag', () => {
    const pantry = fs.readFileSync('web/src/views/PantryView.js','utf8');
    const modal = fs.readFileSync('web/src/components/IngredientDetailModal.js','utf8');
    assert.match(pantry,/nutritionStatusOverview/);
    assert.match(pantry,/filteredNutritionStatuses/);
    assert.match(pantry,/openFoodDetail\(entry\.ingredient\)/);
    assert.match(modal,/sourceStatus\.label/);
    assert.match(modal,/sourceStatus\.reason/);
});

test('Vue pantry source list counts and filters current effective ingredients, and both templates compile', async () => {
    globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue',
        { console, setTimeout, clearTimeout });
    const { default: PantryView } = await import('../web/src/views/PantryView.js');
    const { default: Modal } = await import('../web/src/components/IngredientDetailModal.js');
    const data = Vue.reactive(foods.map(item => structuredClone(item)));
    const engine = {
        data: { ingredients: data, pantryInventory: { foodStockStatus: {}, shoppingList: [] },
            householdSupplies: { supplies: [] } },
        checkStock: () => false, checkSupplyStock: () => false
    };
    const view = PantryView.setup({ engine });
    const tally = view.nutritionStatusOverview.value.counts;
    assert.equal(view.nutritionStatusOverview.value.total, foods.length);
    assert.deepEqual({...tally}, {product: 1, generic: 51, pending: 48});
    for (const code of ['product', 'generic', 'pending']) {
        view.nutritionStatusFilter.value = code;
        assert.equal(view.filteredNutritionStatuses.value.length, tally[code]);
        assert(view.filteredNutritionStatuses.value.every(i => i.status.code === code));
    }
    const ref = view.nutritionStatusOverview.value.entries.find(i => i.id === 'edamame');
    data.find(i => i.id === 'edamame').nutritionReviewRequired = true;
    assert.equal(view.nutritionStatusOverview.value.entries.find(i => i.id === 'edamame').status.code, 'pending');
    assert.equal(ref.status.code, 'generic', 'previous derived object is immutable');

    assert.equal(typeof Vue.compile(PantryView.template, {decodeEntities: s => s}), 'function');
    assert.equal(typeof Vue.compile(Modal.template, {decodeEntities: s => s}), 'function');
});
