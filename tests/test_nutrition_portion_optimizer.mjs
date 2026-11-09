import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { optimizeNutritionPortions as optimize } from '../web/src/services/NutritionPortionOptimizer.js';
import { officialNutritionEvidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { ingredientNutritionBasis, isCountUnit } from '../web/src/utils/IngredientUnit.js';
import { validateMealLimits } from '../web/src/services/DynamicPortions.js';
import { requestChef } from '../web/src/services/ChefAdvisor.js';

let environmentAccesses = 0;
const forbidden = () => { environmentAccesses++; throw Error('No storage/network allowed'); };
globalThis.localStorage = { getItem: forbidden, setItem: forbidden, removeItem: forbidden };
globalThis.fetch = forbidden;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const engine = Object.create(Engine.prototype);
engine.data = { ingredients: Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'))).flat() };
// Same checked-in evidence snapshots as P1, not fetched production rows or invented panels.
for (const id of ['egg', 'kimchi', 'shin_ramen']) {
    const evidence = structuredClone(officialNutritionEvidence[id].evidence);
    Object.assign(engine.data.ingredients.find(i => i.id === id), structuredClone(evidence.snapshot), { nutritionEvidence: evidence });
}
const keys = ['kcal', 'protein', 'carbs', 'fat', 'sodium'];
const values = ns => Object.fromEntries(keys.map((k, n) => [k, ns[n]]));
const targets = values([1500, 95, 167, 50, 1500]);
const zero = values([0, 0, 0, 0, 0]);
const ramen = Object.entries({ pork_shoulder: 80, egg: 1, cabbage: 100, tofu: 70, broccoli: 60, kimchi: 25, shin_ramen: 30 })
    .map(([id, amount]) => ({ id, amount, unit: engine.getIngredientById(id).unitLabel }));
const context = (member = 'bebe') => ({ member, targets: { ...targets }, consumed: { ...zero },
    mealBudget: values([750, 47.5, 83.5, 25, 1500]), expectedMealsRemaining: 2, excludedIds: [] });
const input = () => ({ expected: { bebe: structuredClone(ramen) }, contexts: [context()] });
const run = (fixture = input(), options) => optimize(engine, fixture.expected, fixture.contexts, options);
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function verify(out, fixture) {
    for (const ctx of fixture.contexts) {
        const m = out.members[ctx.member];
        if (!m.feasible) { assert.equal(m.portions, null); continue; }
        assert.deepEqual(m.portions.map(i => [i.id, i.unit]), fixture.expected[ctx.member].map(i => [i.id, i.unit]));
        assert.deepEqual(m.totals, engine.calculateNutritionForMember(m.portions, ctx.member));
        assert.deepEqual(m.quality.after.totals, m.totals);
        assert.doesNotThrow(() => validateMealLimits(engine, { [ctx.member]: m.portions }, [ctx]));
        for (const k of ['kcal', 'carbs', 'fat', 'sodium']) assert(m.totals[k] <= ctx.mealBudget[k]);
        for (const [n, item] of m.portions.entries()) {
            const bound = m.diagnostics.bounds[n];
            assert(item.amount > 0 && item.amount >= bound.min && item.amount <= bound.max);
            assert.equal(item.amount % bound.step, 0);
            if (isCountUnit(item.unit)) assert(Number.isInteger(item.amount));
        }
        const scales = m.portions.map((i, n) => i.amount / fixture.expected[ctx.member][n].amount);
        assert(Math.max(...scales) <= 3 * Math.min(...scales) + 1e-12);
        for (const side of ['before', 'after']) {
            const obj = m.objective[side];
            assert.equal(obj.total, Object.values(obj.components).reduce((sum, t) => sum + t.loss, 0));
            assert(Object.values(obj.components).every(t => Number.isFinite(t.loss) && t.loss >= 0));
        }
        assert.equal(m.diagnostics.globalOptimality, false);
    }
}
function report(member, m) {
    const detail = (items, totals, quality) => ({ 'K/P/C/F/Na': keys.map(k => totals[k]),
        energyGap: quality.dimensions.energy.belowBy + quality.dimensions.energy.aboveBy,
        proteinGap: quality.dimensions.protein.shortfall,
        remainingFat: quality.remaining.after.fat, remainingSodium: quality.remaining.after.sodium,
        ingredients: items.map(i => {
            const ing = engine.getIngredientById(i.id);
            const grams = i.unit === 'g' ? i.amount : Number.isFinite(ing.gramsPerUnit) ? i.amount * ing.gramsPerUnit
                : i.unit === '包' && Number.isFinite(ing.gramsPerPack) ? i.amount * ing.gramsPerPack : null;
            return { ...i, grams, ...(grams === null ? { massNote: 'No verified mass conversion; original count retained' } : {}) };
        }) });
    console.log(JSON.stringify({ syntheticFixture: member,
        baseline: detail(m.baseline.portions, m.baseline.totals, m.quality.before),
        candidate: detail(m.portions, m.totals, m.quality.after),
        objective: m.objective, diagnostics: m.diagnostics }));
}

test('seven-food golden canonical baseline and measurable improvement under identical hard guards', () => {
    assert.deepEqual(engine.calculateNutritionForMember(ramen, 'bebe'), values([493.9, 33.8, 35.5, 24.8, 866.4]));
    const fixture = input(), out = run(fixture); verify(out, fixture);
    assert.equal(out.status, 'feasible');
    const m = out.members.bebe;
    assert.equal(m.baseline.source, 'LocalPortionPlanner');
    assert(m.baseline.withinMealBudget);
    assert(m.objective.after.total < m.objective.before.total);
    assert(m.quality.after.dimensions.energy.belowBy < m.quality.before.dimensions.energy.belowBy
        || m.quality.after.dimensions.protein.shortfall < m.quality.before.dimensions.protein.shortfall);
    report('bebe-seven-food', m);
});
test('three synthetic configurations solve exactly as individual calls, regardless of member order', () => {
    const fixture = { expected: {}, contexts: ['bebe', 'ariel', 'jason'].map(context) };
    fixture.contexts[1].targets = values([1600, 85, 200, 50, 1800]);
    fixture.contexts[1].mealBudget = values([800, 42.5, 100, 25, 1800]);
    fixture.contexts[2].targets = values([1800, 130, 200, 60, 2000]);
    fixture.contexts[2].mealBudget = values([900, 65, 100, 30, 2000]);
    fixture.contexts.forEach(c => { fixture.expected[c.member] = structuredClone(ramen); });
    const out = run(fixture); verify(out, fixture);
    for (const c of fixture.contexts) {
        assert.deepEqual(out.members[c.member], run({ expected: { [c.member]: fixture.expected[c.member] }, contexts: [c] }).members[c.member]);
        report(c.member, out.members[c.member]);
    }
    assert.deepEqual(run({ ...fixture, contexts: [...fixture.contexts].reverse() }).members, out.members);
});
test('breakfast protein gap uses caller allocation rather than slot guess', () => {
    const fixture = input();
    fixture.expected.bebe = ramen.map(i => ({ ...i, amount: i.unit === 'g' ? i.amount / 2 : i.amount }));
    fixture.contexts[0] = { ...context(), expectedMealsRemaining: 3, slotId: 'dinner' };
    const m = run(fixture).members.bebe;
    assert(Math.abs(m.quality.after.softTargets.proteinMinimum - 95 / 3) < 1e-12);
    assert(m.quality.before.dimensions.protein.shortfall > 0);
    assert(m.quality.after.dimensions.protein.shortfall <= m.quality.before.dimensions.protein.shortfall);
});
test('already met protein expectation does not invent a protein multiplier', () => {
    const fixture = input(); fixture.contexts[0].consumed.protein = 95;
    const m = run(fixture).members.bebe;
    assert(m.feasible); assert.equal(m.quality.after.softTargets.proteinMinimum, 0);
    assert.equal(m.quality.after.dimensions.protein.shortfall, 0);
});
test('low-protein recorded breakfast carries its actual consumed nutrients into lunch allocation', () => {
    for (const breakfast of [[{ id: 'cabbage', amount: 100, unit: 'g' }], [{ id: 'shin_ramen', amount: 60, unit: 'g' }]]) {
        const f = input(), ctx = f.contexts[0];
        ctx.consumed = engine.calculateNutritionForMember(breakfast, 'bebe');
        ctx.mealBudget = Object.fromEntries(keys.map(k => [k, (targets[k] - ctx.consumed[k]) / (k === 'sodium' ? 1 : 2)]));
        const out = run(f); verify(out, f);
        const m = out.members.bebe, quality = m.quality.after || m.quality.before;
        assert.equal(quality.softTargets.proteinMinimum, (95 - ctx.consumed.protein) * 0.5);
        assert.deepEqual(quality.progress.before, ctx.consumed);
        if (breakfast[0].id === 'cabbage') assert(m.feasible);
        else { assert.equal(m.status, 'infeasible'); assert(m.diagnostics.exceeded.includes('sodium')); }
    }
});
test('completed daily targets and zero/negative hard budgets yield infeasible', () => {
    for (const k of ['kcal', 'carbs', 'fat', 'sodium']) for (const limit of [0, -1]) {
        const fixture = input(); fixture.contexts[0].mealBudget[k] = limit;
        assert.equal(run(fixture).members.bebe.status, 'infeasible');
    }
    const fixture = input(); fixture.contexts[0].consumed = { ...targets };
    fixture.contexts[0].mealBudget = { ...zero };
    assert.equal(run(fixture).status, 'infeasible');
});
test('missing target, consumption or budget does not fabricate a recommendation', () => {
    for (const key of ['targets', 'consumed', 'mealBudget']) {
        const fixture = input(); delete fixture.contexts[0][key];
        assert.equal(run(fixture).members.bebe.status, 'insufficient-data');
    }
});
test('missing source, stale nutrition snapshot and unknown canonical ID reject', () => {
    for (const mutation of [i => { i.nutritionEvidence = { status: 'pending' }; },
        i => { i.per100g.kcal += 1; }]) {
        const isolated = Object.create(Engine.prototype); isolated.data = structuredClone(engine.data);
        const ing = isolated.data.ingredients.find(i => i.id === 'shin_ramen'); mutation(ing);
        const f = input(); assert.equal(optimize(isolated, f.expected, f.contexts).members.bebe.status, 'insufficient-data');
    }
    const fixture = input(); fixture.expected.bebe[0].id = 'unknown';
    assert.equal(run(fixture).members.bebe.status, 'insufficient-data');
});
test('count basis absent never guesses grams, package quantity or seasoning sodium', () => {
    for (const id of ['egg_dumpling', 'shin_ramen']) {
        const fixture = input(); fixture.expected.bebe = [{ id, amount: 1, unit: id === 'shin_ramen' ? '袋' : '顆' }];
        assert.equal(run(fixture).members.bebe.status, 'insufficient-data');
    }
});
test('excluded selected food gives conflict, preserving other members independently', () => {
    const fixture = input(); fixture.expected.ariel = structuredClone(ramen);
    fixture.contexts.push({ ...context('ariel'), excludedIds: ['egg'] });
    const out = run(fixture);
    assert.equal(out.status, 'partial'); assert.equal(out.members.ariel.portions, null);
    assert(out.members.ariel.reasons[0].includes('egg'));
    assert.deepEqual(out.members.bebe, run().members.bebe);
});
test('one whole egg cannot be fractionated to fit impossible sodium ceiling', () => {
    const fixture = input(); fixture.contexts[0].mealBudget.sodium = 1;
    const m = run(fixture).members.bebe;
    assert.equal(m.status, 'infeasible'); assert(m.diagnostics.exceeded.includes('sodium'));
});
test('both configurable gram lattices and positive integer count lattice are enforced', () => {
    for (const gramStep of [1, 5]) { const f = input(); verify(run(f, { gramStep }), f); }
});
test('repeated frozen inputs deterministic and no localStorage/network reads or writes', () => {
    const fixture = freeze(input()), snapshot = structuredClone(fixture);
    const data = structuredClone(engine.data), accesses = environmentAccesses;
    assert.deepEqual(run(fixture), run(fixture));
    assert.deepEqual(fixture, snapshot); assert.deepEqual(engine.data, data);
    assert.equal(environmentAccesses, accesses);
});
test('returned candidate/baseline/quality and caller objects do not contaminate one another', () => {
    const fixture = input(), out = run(fixture), clean = run(fixture);
    out.members.bebe.portions[0].amount = 999;
    out.members.bebe.totals.kcal = -1;
    out.members.bebe.quality.after.totals.kcal = -2;
    out.assumptions.weights.energyBand = 999;
    assert.deepEqual(run(fixture), clean);
    assert.equal(out.members.bebe.baseline.portions[0].amount, clean.members.bebe.baseline.portions[0].amount);
    fixture.expected.bebe[0].amount = 1;
    assert.equal(clean.members.bebe.baseline.portions[0].amount, 80);
});
test('slot alone, conflicting allocation, invalid share and missing positive recipe amount reject', () => {
    for (const change of [{ expectedMealsRemaining: undefined, slotId: 'lunch' }, { mealShare: 0.4 },
        { expectedMealsRemaining: undefined, mealShare: -1 }]) {
        const f = input(); Object.assign(f.contexts[0], change);
        assert.equal(run(f).members.bebe.status, 'insufficient-data');
    }
    for (const amount of [0, -1, NaN, Infinity, '80']) {
        const f = input(); f.expected.bebe[0].amount = amount;
        assert.equal(run(f).members.bebe.status, 'insufficient-data');
    }
});
test('explicit standard allocation and explicit remaining mode are independently supported', () => {
    const f = input(); delete f.contexts[0].expectedMealsRemaining; f.contexts[0].mealShare = 0.5;
    const a = run(f).members.bebe, b = run().members.bebe;
    assert.deepEqual(a.portions, b.portions); assert.deepEqual(a.objective, b.objective);
    assert.deepEqual(a.quality.after.dimensions, b.quality.after.dimensions);
    assert.equal(a.quality.after.metadata.allocation.source, 'caller-meal-share');
    delete f.contexts[0].mealShare; f.contexts[0].mode = 'remaining';
    f.contexts[0].mealBudget = {...targets};
    const remaining = run(f);
    assert(remaining.members.bebe.feasible);
    assert.equal(remaining.members.bebe.quality.after.metadata.allocation.share,1);
    assert.equal(remaining.members.bebe.quality.after.metadata.allocation.source,'explicit-remaining-mode');
    f.contexts[0].expectedMealsRemaining = 2;
    assert.equal(run(f).status,'insufficient-data','Remaining mode must reject a conflicting per-meal allocation');
});
test('budget-limited search returns honest diagnostics and validated candidate', () => {
    const f = input(), out = run(f, { maxEvaluations: 1 }); verify(out, f);
    assert.equal(out.members.bebe.diagnostics.termination, 'evaluation-limit');
    assert(out.members.bebe.diagnostics.evaluations <= 1);
});
test('invalid solver options, duplicate members/IDs, unsupported units and extreme references reject', () => {
    for (const options of [{ gramStep: 2 }, { maxPasses: Infinity }, { maxEvaluations: 0 }]) assert.equal(run(input(), options).status, 'insufficient-data');
    let f = input(); f.contexts.push(context()); assert.equal(run(f).status, 'insufficient-data');
    f = input(); f.expected.bebe.push({ ...ramen[0] }); assert.equal(run(f).status, 'insufficient-data');
    f = input(); f.expected.bebe[0].unit = 'ml'; assert.equal(run(f).status, 'insufficient-data');
    f = input(); f.expected.bebe[0].amount = 10000; assert.equal(run(f).status, 'infeasible');
});
test('canonical rates independently reproduce candidate totals to Engine rounding', () => {
    const m = run().members.bebe;
    for (const key of keys) {
        const exact = m.portions.reduce((sum, i) => {
            const basis = ingredientNutritionBasis(engine.getIngredientById(i.id), i);
            return sum + basis.nutrients[key] * i.amount / basis.divisor;
        }, 0);
        assert.equal(m.totals[key], Math.round(exact * 10) / 10);
    }
});
test('rounded gram minima satisfy ratio bound without false infeasibility', () => {
    const f = input(); f.expected.bebe.find(i => i.id === 'kimchi').amount = 3;
    const out = run(f); assert.equal(out.status, 'feasible'); verify(out, f);
});
test('AI timeout shadow harness uses identical deterministic core; no actual Gemini request', async () => {
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = () => { calls++; return new Promise(() => {}); };
    try {
        await assert.rejects(requestChef({ apiKey: 'synthetic-fixture', prompt: 'synthetic',
            signal: new AbortController().signal, deadline: performance.now() + 10 }), e => e.code === 'timeout');
        const fallback = run(); assert.deepEqual(fallback, run()); assert.equal(fallback.status, 'feasible');
        assert(calls >= 1 && calls <= 2);
    } finally { globalThis.fetch = originalFetch; }
});
test('seeded budget/recipe perturbations preserve hard and identity properties', () => {
    for (let n = 0; n < 12; n++) {
        const f = input();
        f.expected.bebe = ramen.map(i => ({ ...i, amount: i.unit === 'g' ? i.amount + n : 1 + n % 2 }));
        f.contexts[0].mealBudget.fat = 15 + n * 2;
        f.contexts[0].mealBudget.sodium = 500 + n * 70;
        const out = run(f, { maxPasses: 10 }); verify(out, f);
        assert.deepEqual(out, run(f, { maxPasses: 10 }));
    }
});
