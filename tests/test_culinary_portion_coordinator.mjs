import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCulinaryMeal, validateCulinaryRoles, validateCulinaryReview,
    buildCulinaryRolePrompt } from '../web/src/services/CulinaryPortionCoordinator.js';
import { officialNutritionEvidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { validateMealLimits } from '../web/src/services/DynamicPortions.js';

const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('Network forbidden in culinary fixture'); };
globalThis.localStorage = { getItem() { throw Error('Storage forbidden'); }, setItem() { throw Error('Storage forbidden'); } };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const engine = Object.create(Engine.prototype);
engine.data = { ingredients: Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'))).flat() };
for (const [id, item] of Object.entries(officialNutritionEvidence)) {
    if (!['verified', 'estimated'].includes(item.evidence?.status)) continue;
    const evidence = structuredClone(item.evidence);
    const match = engine.data.ingredients.find(i => i.id === id);
    if (match) Object.assign(match, structuredClone(evidence.snapshot), { nutritionEvidence: evidence });
}
const empty = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
const targets = { kcal: 1500, protein: 95, carbs: 167, fat: 50, sodium: 1500 };
const context = (member = 'bebe', caps = {}) => ({
    member, targets: { ...targets }, consumed: { ...empty },
    mealBudget: { kcal: 750, protein: 47.5, carbs: 83.5, fat: 25, sodium: 1500, ...caps },
    mode: 'standard', mealsRemaining: 2, excludedIds: []
});
const make = (spec, members = ['bebe']) => ({
    expected: Object.fromEntries(members.map(member => [member,
        Object.entries(spec).map(([id, amount]) => ({
            id, amount, unit: engine.getIngredientById(id)?.unitLabel ?? 'g'
        }))])),
    contexts: members.map(m => context(m))
});
const rolesFor = expected => {
    const catalog = [...new Map(Object.values(expected).flat().map(i => [i.id, i])).values()];
    return { dishType: '簡易混合料理', reason: '保留主食材、限制配料',
        roles: catalog.map(i => {
            const ing = engine.getIngredientById(i.id);
            const role = ['greek_yogurt','plain_yogurt','greens'].includes(i.id) ? 'base'
                : ['pork_shoulder','egg','tofu','tuna','shrimp','whey_protein'].includes(i.id) ? 'protein'
                : ['granola','shin_ramen'].includes(i.id) ? 'starch'
                : ['olive_oil','truffle_olive_oil'].includes(i.id) ? 'seasoning'
                : ing.category === 'veggies' ? 'vegetable' : 'topping';
            const categoryCeiling = ({proteins:260,veggies:180,carbs:220,sauces:30})[ing.category] ?? 100;
            const max = i.unit !== 'g' ? 3 : Math.min(categoryCeiling, ({
                base: 250, protein: 180, starch: 110, vegetable: 130,
                topping: 70, seasoning: 15
            })[role]);
            return { id: i.id, role, minAmount: 1, maxAmount: max };
        }) };
};
const accept = { verdict: 'accept', reason: '比例與備料方式可行', adjustments: [] };
const ask = (expected, review = accept) => async ({ prompt }) => {
    if (prompt.includes('料理分類助理')) return rolesFor(expected);
    if (prompt.includes('料理實用性審查員')) return review;
    throw Error('Unexpected Gemini task');
};
const run = async (fixture, opts = {}) => planCulinaryMeal({
    engine, dish: { name: '黃金料理測試' }, ...fixture,
    apiKey: 'fake-test-key', signal: new AbortController().signal, deadline: performance.now() + 20000,
    ask: ask(fixture.expected, opts.review)
});
const valid = (result, fixture) => {
    for (const c of fixture.contexts) {
        const items = result.portions[c.member];
        const ids = fixture.expected[c.member].map(i => i.id);
        assert.deepEqual(items.map(i => i.id), ids);
        assert(items.every(i => i.amount > 0));
        assert.equal(engine.getNutritionIssues(items).length, 0);
        assert.deepEqual(result.nutrition[c.member], engine.calculateNutritionForMember(items, c.member));
        assert.doesNotThrow(() => validateMealLimits(engine, { [c.member]: items }, [c]));
        for (const i of items) if (i.unit !== 'g') assert(Number.isInteger(i.amount));
    }
};

test('yogurt bowl: real missing brand labels block; isolated hypothetical labels test proportions only', async () => {
    const f = make({ greek_yogurt: 100, plain_yogurt: 70, frozen_berry: 40, granola: 20, whey_protein: 10 });
    await assert.rejects(run(f), { code: 'culinary-invalid' },
        'Pending berries, granola and whey must not be passed off as real verified labels');
    const simulated = ['frozen_berry','granola','whey_protein'];
    const original = simulated.map(id => structuredClone(engine.data.ingredients.find(i => i.id === id)));
    try {
        for (const id of simulated) {
            const ing = engine.data.ingredients.find(i => i.id === id);
            // ONLY a synthetic label fixture: original legacy numbers are not verified in production.
            const synthetic = structuredClone(officialNutritionEvidence[id].evidence);
            synthetic.status = 'verified';
            synthetic.kind = 'product_label';
            synthetic.sources = [{ ref: 'SYNTHETIC-TEST', title: 'fixture only' }];
            ing.nutritionEvidence = synthetic;
        }
        const result = await run(f);
        valid(result, f);
        assert(result.reviewed); assert.equal(result.source, 'ai');
        console.log('YOGURT_SYNTHETIC_LABEL', result.portions.bebe, result.nutrition.bebe);
    } finally {
        for (let i=0;i<simulated.length;i++) Object.assign(engine.data.ingredients.find(item => item.id === simulated[i]), original[i]);
    }
    const missing = structuredClone(f);
    missing.expected.bebe.push({ id: 'kiwi_not_in_catalog', amount: 70, unit: 'g' });
    await assert.rejects(run(missing), { code: 'culinary-invalid' });
});
test('salad cucumber maximum is constrained by role instead of being grown arbitrarily for calories', async () => {
    const f = make({ greens: 80, cucumber: 45, cherry_tomatoes: 40, shrimp: 65, truffle_olive_oil: 5 });
    const out = await run(f);
    valid(out, f);
    assert(out.portions.bebe.find(i => i.id === 'cucumber').amount <= 90);
    console.log('SALAD', out.portions.bebe, out.nutrition.bebe);
});
test('seven-food Shin ramen keeps counts and canonical packaged seasoning nutrition', async () => {
    const f = make({ pork_shoulder: 80, egg: 1, cabbage: 100, tofu: 70, broccoli: 60, kimchi: 25, shin_ramen: 30 });
    const out = await run(f);
    valid(out, f);
    assert(out.portions.bebe.find(i => i.id === 'egg').amount === 1);
    assert(out.portions.bebe.find(i => i.id === 'shin_ramen').amount > 0);
    console.log('RAMEN', out.portions.bebe, out.nutrition.bebe);
});
test('three family members solved independently, same IDs and canonical units', async () => {
    const f = make({ pork_shoulder: 80, egg: 1, cabbage: 100, tofu: 70, broccoli: 60, kimchi: 25, shin_ramen: 30 },
        ['bebe', 'ariel', 'jason']);
    f.contexts[1].mealBudget = { ...f.contexts[1].mealBudget, kcal: 850, fat: 27 };
    f.contexts[1].targets = { ...targets, kcal: 1700, protein: 100 };
    f.contexts[2].mealBudget = { ...f.contexts[2].mealBudget, kcal: 1000, fat: 32 };
    f.contexts[2].targets = { ...targets, kcal: 2000, protein: 130 };
    const out = await run(f);
    valid(out, f);
    for (const member of ['bebe','ariel','jason']) console.log('MEMBER', member, out.nutrition[member]);
});
test('no-solution: no ingredient removed or fake positive result', async () => {
    const f = make({ egg: 1, shin_ramen: 30 });
    f.contexts[0].mealBudget.sodium = 1;
    await assert.rejects(run(f), { code: 'culinary-no-solution' });
});
test('review revision tightens maximum and recalculates, not falsely labeled AI-reviewed', async () => {
    const f = make({ greens: 80, cucumber: 45, cherry_tomatoes: 40, shrimp: 65, truffle_olive_oil: 5 });
    const review = { verdict: 'revise', reason: '小黃瓜與生菜比例不自然',
        adjustments: [{ id: 'cucumber', maxAmount: 35, reason: '本餐小黃瓜控制在 35g' }] };
    // Original reference 45g means 50% minimum 25g; tightening still feasible.
    const result = await run(f, { review });
    valid(result, f);
    assert.equal(result.source, 'estimate');
    assert.equal(result.reviewed, false);
    assert(result.portions.bebe.find(i => i.id === 'cucumber').amount <= 35);
});
test('malformed AI outputs, unknown or duplicate ids and over-limit quantities are rejected', async () => {
    const f = make({ greens: 80, cucumber: 45 });
    const roles = rolesFor(f.expected);
    for (const malformed of [
        { ...roles, roles: roles.roles.slice(0,1) },
        { ...roles, roles: [roles.roles[0], { ...roles.roles[1], id: 'unknown' }] },
        { ...roles, roles: [roles.roles[0], { ...roles.roles[0] }] },
        { ...roles, roles: [roles.roles[0], { ...roles.roles[1], maxAmount: 1000 }] }
    ]) assert.throws(() => validateCulinaryRoles(malformed, f.expected, engine), { code: 'culinary-invalid' });
    const constraints = validateCulinaryRoles(roles, f.expected, engine);
    assert.throws(() => validateCulinaryReview({
        verdict: 'revise', reason: 'bad', adjustments: [
            { id: 'cucumber', maxAmount: 1000, reason: 'increase' }]
    }, constraints), { code: 'culinary-invalid' });
    assert.match(buildCulinaryRolePrompt({dish:'沙拉',expected:f.expected,engine}), /cucumber/);
});
test('AI failure is not presented as reviewed, and original inputs stay unchanged', async () => {
    const f = make({ greens: 80, cucumber: 45 });
    const frozen = JSON.stringify(f);
    await assert.rejects(planCulinaryMeal({
        engine, dish: '沙拉', ...f, apiKey: 'fake', signal: new AbortController().signal,
        deadline: performance.now() + 20000,
        ask: async () => { throw Object.assign(new Error('HTTP 429'),{code:'429'}); }
    }), { code: '429' });
    assert.equal(JSON.stringify(f), frozen);
});
globalThis.fetch = originalFetch;
