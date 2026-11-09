import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateNutritionQuality as evaluate } from '../web/src/services/NutritionQualityEvaluator.js';
import { officialNutritionEvidence } from '../web/src/utils/OfficialNutritionEvidence.js';
import { buildMealContext } from '../web/src/services/DynamicPortions.js';
import { planLocalPortions } from '../web/src/services/LocalPortionPlanner.js';
import { requestChef } from '../web/src/services/ChefAdvisor.js';

// Only repository fixtures and existing canonical calculations; never initialize/sync.
const forbidden = () => { throw Error('Environment access forbidden'); };
globalThis.localStorage = { getItem: forbidden, setItem: forbidden, removeItem: forbidden };
globalThis.fetch = forbidden;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const engine = Object.create(Engine.prototype);
engine.data = { ingredients: Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json', 'utf8'))).flat() };
for (const id of ['egg', 'kimchi', 'shin_ramen']) {
    const evidence = structuredClone(officialNutritionEvidence[id].evidence);
    Object.assign(engine.data.ingredients.find(i => i.id === id), evidence.snapshot, { nutritionEvidence: evidence });
}
const keys = ['kcal', 'protein', 'carbs', 'fat', 'sodium'];
const values = xs => Object.fromEntries(keys.map((k, i) => [k, xs[i]]));
const zero = values([0, 0, 0, 0, 0]);
const targets = values([1500, 95, 167, 50, 1500]);
const item = (id, amount) => ({ id, amount, unit: engine.getIngredientById(id)?.unitLabel || 'g' });
const ramen = Object.entries({ pork_shoulder:80, egg:1, cabbage:100, tofu:70, broccoli:60, kimchi:25, shin_ramen:30 }).map(([id, amount]) => item(id, amount));
const calc = items => engine.calculateNutritionForMember(items, 'synthetic-member');
const golden = calc(ramen);
const base = () => ({ targets: structuredClone(targets), consumed: {...zero}, totals: {...golden}, expectedMealsRemaining: 2 });
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function finiteTree(value) {
    if (typeof value === 'number') assert(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree);
}
function checked(input) {
    const before = structuredClone(input);
    freeze(input);
    const out = evaluate(input);
    assert.deepEqual(input, before, 'Input never mutates');
    assert.deepEqual(out, evaluate(input), 'Deterministic output');
    finiteTree(out);
    if (out.status === 'evaluated') {
        for (const k of keys) {
            assert.equal(out.remaining.before[k], input.targets[k] - input.consumed[k]);
            assert.equal(out.progress.after[k], input.consumed[k] + input.totals[k]);
            assert.equal(out.remaining.after[k], input.targets[k] - out.progress.after[k]);
        }
        for (const f of out.flags) {
            const expectedActual = f.code.startsWith('daily-') ? out.progress.after[f.nutrient] : out.totals[f.nutrient];
            assert.equal(f.actual, expectedActual);
            const threshold = f.basis.split('.').reduce((v, k) => v[k], { ...out, targets:input.targets });
            assert.equal(f.threshold, threshold);
            assert.equal(f.difference, f.actual - f.threshold);
            assert(f.operator === '<' ? f.actual < f.threshold : f.actual > f.threshold, f.code);
            assert(f.reason.length > 0);
        }
    } else {
        assert.equal(out.flags[0].code, 'insufficient-data');
        assert(out.flags[0].paths.length > 0);
    }
    return out;
}
const has = (out, code) => out.flags.some(f => f.code === code);

test('canonical seven-food golden totals; no prior meals', () => {
    assert.deepEqual(golden, values([493.9, 33.8, 35.5, 24.8, 866.4]));
    const out = checked(base());
    assert.equal(out.remaining.before.kcal, 1500);
    assert.equal(out.softTargets.proteinMinimum, 47.5);
    assert(has(out, 'protein-shortfall'));
    assert(has(out, 'meal-energy-below-target'));
    assert(has(out, 'sodium-high-share'));
    assert(!has(out, 'fat-high-share'));
});
test('same meal after a canonical breakfast with insufficient protein', () => {
    const consumed = calc([item('shin_ramen', 60)]);
    const out = checked({...base(), consumed});
    assert.equal(out.remaining.before.kcal, 1500 - consumed.kcal);
    assert(has(out, 'protein-shortfall'));
    assert(out.dimensions.protein.shortfall > 0);
    assert(!out.flags.some(f => f.nutrient === 'protein' && f.severity === 'hard-risk'));
});
test('breakfast protein shortfall is a soft warning', () => {
    const out = checked({...base(), totals:calc([item('cabbage', 100)]), expectedMealsRemaining:3});
    assert(Math.abs(out.softTargets.proteinMinimum - 95 / 3) < 1e-12);
    assert(has(out, 'protein-shortfall'));
});
test('lunch high fat share still leaves daily room', () => {
    const consumed = calc([item('egg', 1)]);
    const out = checked({...base(), consumed});
    assert(has(out, 'fat-high-share'));
    assert(out.remaining.after.fat > 0);
    assert(!has(out, 'daily-fat-target-exceeded'));
});
test('all high-fat meals accumulate daily fat excess, not hidden by energy undershoot', () => {
    const meal = calc([item('pork_shoulder', 100), item('egg', 2)]);
    const out = checked({...base(), totals:meal, consumed:values(keys.map(k => meal[k] * 2))});
    assert(has(out, 'daily-fat-target-exceeded'));
    assert.equal(out.dimensions.fat.remainingAfter, targets.fat - meal.fat * 3);
});
test('vegetables only compare worse on protein and energy than golden meal', () => {
    const veg = checked({...base(), totals:calc([item('cabbage', 100), item('broccoli', 60)])});
    const balanced = checked(base());
    assert(veg.dimensions.protein.shortfall > balanced.dimensions.protein.shortfall);
    assert(veg.dimensions.energy.belowBy > balanced.dimensions.energy.belowBy);
});
test('single ingredient remains assessable', () => {
    assert.equal(checked({...base(), totals:calc([item('tofu', 70)])}).status, 'evaluated');
});
test('zero energy remaining is finite and warns about daily excess', () => {
    const out = checked({...base(), consumed:{...zero, kcal:1500}});
    assert.equal(out.remaining.before.kcal, 0);
    assert(has(out, 'daily-energy-exceeded'));
    assert.equal(out.softTargets.energyRange.upper, 0);
});
test('already exceeded day retains negative remaining', () => {
    assert.equal(checked({...base(), consumed:{...zero, kcal:1600}}).remaining.before.kcal, -100);
});
test('unknown ingredient NaN becomes insufficient data, never false quality', () => {
    const out = checked({...base(), totals:calc([item('unknown-fixture', 1)])});
    assert.equal(out.status, 'insufficient-data');
    assert.equal(out.totals, null);
});
test('pending count nutrition is insufficient data', () => {
    checked({...base(), totals:calc([item('egg_dumpling', 2)])});
    assert.equal(evaluate({...base(), totals:calc([item('egg_dumpling', 2)])}).status, 'insufficient-data');
});
test('gram ingredient without nutrition is insufficient data from canonical engine', () => {
    const isolated = Object.create(Engine.prototype);
    isolated.data = {ingredients:[{id:'no_nutrition',name:'Synthetic missing panel',unitLabel:'g'}]};
    const totals = isolated.calculateNutritionForMember([{id:'no_nutrition',amount:10,unit:'g'}], 'fixture');
    assert.equal(checked({...base(), totals}).status, 'insufficient-data');
});
test('verified count amounts use canonical per-unit values for one and two', () => {
    for (const amount of [1, 2]) {
        const totals = calc([item('egg', amount)]);
        assert.equal(totals.kcal, 67.5 * amount);
        assert.equal(totals.sodium, 69 * amount);
        assert.equal(checked({...base(), totals}).totals.kcal, totals.kcal);
    }
});
test('three synthetic members with different targets stay independent', () => {
    const goals = [targets, values([1600,85,200,50,1800]), values([1800,130,200,50,2000])];
    const outputs = goals.map(targets => checked({...base(), targets}));
    assert.deepEqual(outputs.map(o => o.softTargets.proteinMinimum), [47.5,42.5,65]);
    assert.deepEqual(outputs.map(o => o.remaining.after.sodium), goals.map(t => t.sodium - golden.sodium));
});
test('standard vs explicit remaining allocation', () => {
    const standard = checked(base());
    const {expectedMealsRemaining, ...input} = base();
    const remaining = checked({...input, mode:'remaining'});
    assert.equal(remaining.softTargets.proteinMinimum, standard.softTargets.proteinMinimum * 2);
    assert.deepEqual(remaining.remaining, standard.remaining);
});
test('caller share and configured energy band are transparent product assumptions', () => {
    const {expectedMealsRemaining, ...input} = base();
    const out = checked({...input, mealShare:0.3, energyRangeFactors:[0.9,1.1]});
    assert.equal(out.softTargets.energyRange.lower, 1500 * 0.3 * 0.9);
    assert.equal(out.metadata.allocation.share, 0.3);
});
test('legacy context mealBudget and inferred mealsRemaining do not dictate evaluation', () => {
    const context = {targets, consumed:zero, mode:'standard', mealsRemaining:2, mealBudget:{kcal:1}};
    const out = checked({...context, totals:golden, expectedMealsRemaining:2});
    assert.equal(out.softTargets.shares.kcal, 750);
    assert.equal(evaluate({...context, totals:golden}).status, 'insufficient-data');
});
test('Gemini failure and local result can be evaluated by identical pure function (shadow harness only)', async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return {ok:false, status:429}; };
    try {
        await assert.rejects(requestChef({apiKey:'synthetic-fixture', prompt:'synthetic', signal:new AbortController().signal,
            deadline:performance.now()+1000}), e => e.code === '429');
    } finally { globalThis.fetch = previousFetch; }
    assert.equal(calls, 1);
    const expected = {fixture:ramen.map(i => ({...i}))};
    const context = {...base(), member:'fixture', mealBudget:values([750,47.5,83.5,25,1500]), excludedIds:[]};
    const before = structuredClone({expected, context});
    const planned = planLocalPortions(engine, expected, [context]);
    assert(planned);
    assert.deepEqual({expected,context}, before);
    const totals = calc(planned.portions.fixture);
    assert.deepEqual(checked({...base(), totals}), checked({...base(), totals:calc(ramen)}));
});
test('rounding and tiny portion changes stay finite and preserve canonical totals', () => {
    for (const delta of [-0.05, 0, 0.05, 0.1]) {
        const totals = calc(ramen.map(i => i.unit === 'g' ? {...i,amount:i.amount+delta} : i));
        assert.deepEqual(checked({...base(), totals}).totals, totals);
    }
});
test('allergy, fiber, fat loss and muscle retention never inferred even with extra fields', () => {
    const a = checked(base());
    const b = checked({...base(), allergies:[], fiber:30, tdee:2000, healthMemory:'ignored'});
    assert.deepEqual(a, b);
    for (const field of ['allergies','fiber','fatLoss','muscleRetention']) {
        assert.equal(a.fieldAssessments[field], 'not-assessed');
        assert(a.unassessedFields.includes(field));
    }
    assert.equal(a.metadata.sodiumTargetMeaning, 'personal-setting-not-medical-limit');
});
test('caller totals cannot escape through output references', () => {
    const input = base(); const out = evaluate(input); out.totals.kcal = 0;
    assert.equal(input.totals.kcal, golden.kcal);
});
for (const [name, change] of Object.entries({
    'missing daily targets':{targets:undefined}, 'zero daily target':{targets:{...targets, kcal:0}},
    'missing consumption':{consumed:undefined}, 'missing meal nutrient':{totals:{kcal:10}},
    'negative input':{consumed:{...zero, fat:-1}}, 'NaN input':{totals:{...golden, protein:NaN}},
    'infinite input':{totals:{...golden, sodium:Infinity}}, 'numeric string':{totals:{...golden, kcal:'493.9'}},
    'ambiguous allocation':{mealShare:0.3}, 'invalid meal count':{expectedMealsRemaining:0},
    'invalid mode':{mode:'invented'}, 'nonfinite mode':{mode:NaN}, 'invalid band':{energyRangeFactors:[1.2,0.8]},
    'arithmetic overflow':{consumed:values(keys.map(() => Number.MAX_VALUE)), totals:values(keys.map(() => Number.MAX_VALUE))}
})) test(name, () => assert.equal(checked({...base(), ...change}).status, 'insufficient-data'));
test('absent input returns structured insufficient data', () => {
    assert.equal(evaluate().status, 'insufficient-data'); assert.equal(evaluate(null).status, 'insufficient-data');
});
test('explicit zero meal is low adequacy, never a healthy pass because under targets', () => {
    const out = checked({...base(), totals:zero});
    assert(has(out, 'protein-shortfall')); assert(has(out, 'meal-energy-below-target'));
    assert.equal(out.dimensions.protein.status, 'below-expectation');
});
test('daily sodium exceedance is a personal-target advisory with exact arithmetic', () => {
    const out = checked({...base(), consumed:{...zero,sodium:1000}});
    assert(has(out, 'daily-sodium-target-exceeded'));
    assert(out.flags.filter(f => f.nutrient === 'sodium').every(f => f.severity === 'soft'));
});
test('existing context may be consumed without trusting inferred schedule', () => {
    const context = buildMealContext({profiles:{fixture:{targetKcal:1500,targetProtein:95,targetCarbs:167,targetFat:50,targetSodium:1500}},
        getDailyLog:()=>({totals:zero})}, 'fixture', 'synthetic-date', 'standard', 'lunch');
    assert.deepEqual(checked({...context, totals:golden, expectedMealsRemaining:2}), checked(base()));
});
test('meeting the allocation shows adequate energy and protein without a mysterious score', () => {
    const out = checked({...base(), targets:values(keys.map(k => golden[k] * 2))});
    assert.equal(out.dimensions.energy.status, 'within-band');
    assert.equal(out.dimensions.protein.status, 'meets-expectation');
    assert.equal(out.flags.length, 0);
    assert.equal(out.score, undefined);
});
test('exact energy and protein boundaries do not warn', () => {
    const out = checked({...base(), targets:{...targets,kcal:golden.kcal * 2,protein:golden.protein * 2}, energyRangeFactors:[1,1]});
    assert(!has(out, 'protein-shortfall'));
    assert(!has(out, 'meal-energy-below-target'));
    assert(!has(out, 'meal-energy-above-target'));
});
test('remaining-mode allocation is explicit and rejects conflicting count', () => {
    assert.equal(checked({...base(), mode:'remaining'}).status, 'insufficient-data');
});
test('invalid share or missing allocation never silently guesses from slot', () => {
    const {expectedMealsRemaining, ...input} = base();
    for (const mealShare of [0, -1, 1.1, NaN, '0.3'])
        assert.equal(checked({...input, mealShare}).status, 'insufficient-data');
    assert.equal(checked({...input, slotId:'lunch'}).status, 'insufficient-data');
});
test('complete zero meal and completed daily targets have no false shortfalls', () => {
    const {expectedMealsRemaining, ...input} = base();
    const out = checked({...input, consumed:targets, totals:zero, mode:'remaining'});
    assert.equal(out.flags.length, 0);
    assert.deepEqual(out.remaining.before, zero);
});
