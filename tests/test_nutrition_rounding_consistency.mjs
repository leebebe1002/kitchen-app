import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../web/src/engine/KitchenEngine.js';
import { evidenceSnapshot } from '../web/src/utils/NutritionEvidence.js';

const mock = (id, nutrition, extra = {}) => {
    const ingredient = { id, name: '測試'+id, category: 'carbs',
        unitLabel: 'g', per100g: nutrition, ...extra };
    ingredient.nutritionEvidence = { kind: 'product_label', status: 'verified',
        identity: { name: ingredient.name, brand: '' }, snapshot: evidenceSnapshot(ingredient) };
    return ingredient;
};
const ingredients = [
    mock('dry_noodle', { kcal: 362.2, protein: 9.1, fat: 1, carbs: 79.2, sodium: 712 },
        { gramsPerPack: 65, weightBasis: 'dry' }),
    mock('chicken', { kcal: 119, protein: 23.3, fat: 2.1, carbs: 0, sodium: 50 },
        { weightBasis: 'raw' }),
    mock('egg', { kcal: 143, protein: 12.5, fat: 9.5, carbs: 0.7, sodium: 145 },
        { unitLabel: '顆', isCount: true, perUnit: { kcal: 72, protein: 6.3, fat: 4.8, carbs: 0.4, sodium: 72.5 }, weightBasis: 'raw' })
];
const engine = Object.create(Engine.prototype);
engine.data = { ingredients };
const calc = items => engine.calculateNutritionForMember(items, 'fixture');
const req = (id, amount, unit) => ({ id, amount, unit });

test('65 g of verified dry noodles equals 1 complete 65 g pack, including fat tie', () => {
    const grams = calc([req('dry_noodle', 65, 'g')]);
    const pack = calc([req('dry_noodle', 1, '包')]);
    assert.deepEqual(engine.getNutritionIssues([req('dry_noodle', 1, '包')]), []);
    assert.deepEqual(pack, grams);
    assert.equal(pack.fat, 0.7);
    assert.equal(pack.kcal, 235.4);
    assert.equal(pack.sodium, 462.8);
});

test('100.3 g at a half-decimal boundary rounds consistently across operation orders', () => {
    const actual = calc([req('chicken', 100.3, 'g')]);
    assert.equal(actual.sodium, 50.2);
    assert.equal(actual.kcal, 119.4);
});

test('multiple ingredients are summed before stable one-decimal rounding', () => {
    const actual = calc([req('dry_noodle', 65, 'g'), req('chicken', 100.3, 'g')]);
    assert.equal(actual.kcal, 354.8);
    assert.equal(actual.sodium, 513.0);
    assert.equal(actual.fat, 2.8);
});

test('verified counted eggs keep per-unit semantics and cannot be silently used as grams', () => {
    const actual = calc([req('egg', 2, '顆')]);
    assert.equal(actual.kcal, 144);
    assert.equal(actual.protein, 12.6);
    assert.equal(actual.sodium, 145);
    assert(engine.getNutritionIssues([req('egg', 2, 'g')]).length);
});

test('unverified ingredients still propagate unknown nutrition as NaN', () => {
    const ingredient = mock('pending', { kcal: 120, protein: 10, fat: 4, carbs: 12, sodium: 30 });
    ingredient.nutritionEvidence.status = 'pending';
    ingredients.push(ingredient);
    try {
        const reqs = [req('pending', 10, 'g')];
        assert(engine.getNutritionIssues(reqs).length);
        assert(Number.isNaN(calc(reqs).kcal));
    } finally { ingredients.pop(); }
});
