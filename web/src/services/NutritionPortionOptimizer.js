import { ingredientNutritionBasis, isCountUnit } from '../utils/IngredientUnit.js?v=20261109_FK21_THREE_FOODS_V2';
import { planLocalPortions } from './LocalPortionPlanner.js?v=20261109_FK21_ESTIMATE_FALLBACK_V1';
import { evaluateNutritionQuality } from './NutritionQualityEvaluator.js';

const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sodium'];
const CAPS = ['kcal', 'carbs', 'fat', 'sodium'];
const WEIGHTS = Object.freeze({ energyBand: 4, proteinMinimum: 4, fatFlexibility: 0.5,
    sodiumFlexibility: 0.5, carbohydrateShare: 0.1, recipeRatio: 0.03, referencePortion: 0.02 });
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const copyItems = items => items.map(({ id, amount, unit }) => ({ id, amount, unit }));

/**
 * Isolated experimental prototype; no UI registration, storage, network or AI.
 * expected = {member: [{id, amount, unit}]}; contexts carry mealBudget, targets,
 * consumed and an explicit standard allocation (mealShare / expectedMealsRemaining),
 * or a caller-selected remaining mode which uses all today's remainder.
 * Positive recipe reference amounts are required; zero defaults need caller review.
 * Each member is solved alone. A selected excluded food makes that member infeasible:
 * preserving every selected ID with positive quantity precludes silently removing it.
 * All coefficients/bounds below are unvalidated PRODUCT assumptions, not medicine.
 */
export function optimizeNutritionPortions(engine, expected, contexts, options = {}) {
    const { gramStep = 5, maxPasses = 40, maxEvaluations = 12000, culinaryConstraints = null } = options;
    const assumptions = {
        experimental: true, clinicalValidation: false, gramStep,
        weights: { ...WEIGHTS }, energyRangeFactors: [0.8, 1.2], proteinMultiplier: 1,
        referenceScaleRange: [0.5, 2], maximumRelativeRecipeScale: 3,
        absoluteMaximum: { grams: 1000, count: 20 }, maxPasses, maxEvaluations,
        objectiveFormula: 'sum(weight * normalizedResidual^2); arithmetic mean for recipe/reference terms',
        normalization: 'energy/protein/carbs/fat/sodium use max(1, P1 allocated share); recipe uses reference amount',
        allocation: 'explicit caller allocation only; context.mode/slot ignored; mealShare=1 allocates all remaining',
        sodiumModel: 'canonical whole-food values only; no seasoning or package inference',
        limitations: ['bounded discrete local search; no global optimality claim',
            'reference amounts are caller recipe quantities, not validated typical servings',
            'allergies, fiber, TDEE, medical conditions and clinical outcomes are not assessed']
    };
    const result = { prototypeOnly: true, algorithm: 'deterministic-bounded-coordinate-and-pair-search',
        assumptions, status: 'insufficient-data', members: {} };
    const fail = (status, reason) => ({ status, feasible: false, reasons: [reason],
        portions: null, totals: null, baseline: null, quality: { before: null, after: null },
        objective: null, diagnostics: null });
    if (![1, 5].includes(gramStep) || !Number.isSafeInteger(maxPasses) || maxPasses < 1 || maxPasses > 100
        || !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > 50000
        || !expected || !Array.isArray(contexts) || !contexts.length
        || contexts.some(c => !c || typeof c.member !== 'string' || !c.member)
        || new Set(contexts.map(c => c.member)).size !== contexts.length
        || Object.keys(expected).sort().join('|') !== contexts.map(c => c.member).sort().join('|')) {
        result.reasons = ['Invalid solver options or member mapping.'];
        return result;
    }
    for (const context of contexts) {
        const member = context.member;
        // Own property avoids special member names changing the output object prototype.
        Object.defineProperty(result.members, member, { value: solve(context), enumerable: true });
    }
    const statuses = Object.values(result.members).map(m => m.status);
    result.status = statuses.every(s => s === 'feasible') ? 'feasible'
        : statuses.some(s => s === 'feasible') ? 'partial' : statuses.includes('insufficient-data') ? 'insufficient-data' : 'infeasible';
    return result;

    function solve(context) {
        const { member } = context;
        const original = expected[member];
        if (!Array.isArray(original) || !original.length || original.length > 30
            || new Set(original.map(i => i?.id)).size !== original.length
            || original.some(i => !i || typeof i.id !== 'string' || !positive(i.amount)))
            return fail('insufficient-data', 'Require 1–30 distinct selected IDs with positive recipe reference amounts.');
        if (context.excludedIds !== undefined && (!Array.isArray(context.excludedIds)
            || context.excludedIds.some(id => typeof id !== 'string')))
            return fail('insufficient-data', 'Invalid excludedIds.');
        const excluded = original.filter(i => context.excludedIds?.includes(i.id));
        if (excluded.length) return fail('infeasible', `Selected excluded IDs conflict with positive portions: ${excluded.map(i => i.id).join(', ')}.`);
        if (CAPS.some(k => typeof context.mealBudget?.[k] !== 'number' || !Number.isFinite(context.mealBudget[k])))
            return fail('insufficient-data', 'Missing finite mealBudget ceilings.');
        if (CAPS.some(k => context.mealBudget[k] <= 0))
            return fail('infeasible', 'Zero or negative mealBudget ceiling; no positive-portion proposal.');
        // Standard mode requires an explicit allocation; 'remaining' is itself an
        // explicit request to allocate all leftover daily budget, not a slot guess.
        const mode = context.mode ?? 'standard';
        if (!['standard', 'remaining'].includes(mode)
            || (mode === 'remaining' && (context.mealShare !== undefined || context.expectedMealsRemaining !== undefined))
            || (mode === 'standard'
                && ((context.mealShare === undefined) === (context.expectedMealsRemaining === undefined))))
            return fail('insufficient-data', 'Use explicit remaining mode or exactly one standard allocation.');
        const qualityInput = { targets: context.targets, consumed: context.consumed, mode,
            mealShare: context.mealShare, expectedMealsRemaining: context.expectedMealsRemaining };
        const assess = totals => evaluateNutritionQuality({ ...qualityInput, totals });
        const bounds = [];
        if (culinaryConstraints && (typeof culinaryConstraints !== 'object' || Array.isArray(culinaryConstraints)
            || Object.keys(culinaryConstraints).sort().join('|') !== original.map(i => i.id).sort().join('|')))
            return fail('insufficient-data', 'Culinary constraints must match every selected canonical ID.');
        for (const item of original) {
            const ing = engine.getIngredientById(item.id);
            const basis = ingredientNutritionBasis(ing, item);
            if (!ing || ing.id !== item.id || !['verified', 'estimated'].includes(ing.nutritionEvidence?.status)
                || !basis || engine.getNutritionIssues([{ ...item, amount: 1 }]).length
                || (!isCountUnit(item.unit) && item.unit !== 'g'))
                return fail('insufficient-data', `Missing canonical source/unit basis: ${item.id}.`);
            const step = isCountUnit(item.unit) ? 1 : gramStep;
            const limits = culinaryConstraints?.[item.id];
            if (limits && (!Number.isFinite(limits.min) || !Number.isFinite(limits.max)
                || limits.min <= 0 || limits.max < limits.min))
                return fail('insufficient-data', `Invalid culinary constraints: ${item.id}.`);
            const min = Math.max(step, Math.ceil(Math.max(item.amount * 0.5, limits?.min ?? 0) / step) * step);
            const max = Math.floor(Math.min(item.amount * 2, isCountUnit(item.unit) ? 20 : 1000,
                limits?.max ?? Infinity) / step) * step;
            if (min > max) return fail('infeasible', `No step-aligned amount within reference bounds: ${item.id}.`);
            bounds.push({ id: item.id, unit: item.unit, reference: item.amount, min, max, step });
        }
        const totalsFor = items => engine.calculateNutritionForMember(items, member);
        const finite = t => KEYS.every(k => typeof t[k] === 'number' && Number.isFinite(t[k]) && t[k] >= 0);
        const withinCaps = t => finite(t) && CAPS.every(k => t[k] <= context.mealBudget[k]);
        const legal = items => {
            if (items.some((i, n) => i.amount < bounds[n].min || i.amount > bounds[n].max
                || i.amount % bounds[n].step !== 0)) return false;
            const scales = items.map((i, n) => i.amount / bounds[n].reference);
            return Math.max(...scales) <= 3 * Math.min(...scales) + 1e-12;
        };
        const minimum = original.map((i, n) => ({ id: i.id, unit: i.unit, amount: bounds[n].min }));
        // Ratio requires every scale >= the largest mandatory minimum scale / 3.
        const minimumScale = Math.max(...minimum.map((i, n) => i.amount / bounds[n].reference)) / 3;
        minimum.forEach((i, n) => {
            i.amount = Math.max(i.amount, Math.ceil(minimumScale * bounds[n].reference / bounds[n].step - 1e-12) * bounds[n].step);
        });
        const minimumTotals = totalsFor(minimum);
        const referenceQuality = assess(totalsFor(original));
        if (referenceQuality.status !== 'evaluated')
            return fail('insufficient-data', 'Incomplete targets/consumed/allocation or canonical totals.');
        if (!withinCaps(minimumTotals)) {
            const out = fail('infeasible', 'Componentwise minimum exceeds mealBudget within experimental reference bounds.');
            out.diagnostics = { bounds, minimumTotals, exceeded: CAPS.filter(k => minimumTotals[k] > context.mealBudget[k]) };
            out.quality.before = referenceQuality;
            return out;
        }
        if (!legal(minimum)) return fail('infeasible', 'Step-aligned minima violate recipe ratio bound.');
        const soft = referenceQuality.softTargets;
        const components = (items, totals) => {
            const scales = items.map((i, n) => i.amount / bounds[n].reference);
            const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
            const residuals = {
                energyBand: Math.max(0, soft.energyRange.lower - totals.kcal, totals.kcal - soft.energyRange.upper) / Math.max(1, soft.shares.kcal),
                proteinMinimum: Math.max(0, soft.proteinMinimum - totals.protein) / Math.max(1, soft.proteinMinimum),
                fatFlexibility: Math.max(0, totals.fat - soft.shares.fat) / Math.max(1, soft.shares.fat),
                sodiumFlexibility: Math.max(0, totals.sodium - soft.shares.sodium) / Math.max(1, soft.shares.sodium),
                carbohydrateShare: (totals.carbs - soft.shares.carbs) / Math.max(1, soft.shares.carbs)
            };
            const terms = Object.fromEntries(Object.entries(residuals).map(([k, residual]) => [k,
                { residual, weight: WEIGHTS[k], loss: WEIGHTS[k] * residual ** 2 }]));
            for (const [key, center] of [['recipeRatio', mean], ['referencePortion', 1]]) {
                const meanSquaredResidual = scales.reduce((s, v) => s + (v - center) ** 2, 0) / scales.length;
                terms[key] = { meanSquaredResidual, weight: WEIGHTS[key], loss: WEIGHTS[key] * meanSquaredResidual };
            }
            return { components: terms, total: Object.values(terms).reduce((s, t) => s + t.loss, 0) };
        };
        const baselineItems = planLocalPortions(engine, { [member]: copyItems(original) }, [context])?.portions[member];
        const beforeItems = baselineItems || copyItems(original);
        const beforeTotals = totalsFor(beforeItems);
        let current = minimum;
        let objective = components(current, minimumTotals);
        let evaluations = 0, passes = 0, termination = 'pass-limit';
        const inspect = items => {
            if (evaluations >= maxEvaluations) return null;
            evaluations++;
            if (!legal(items)) return null;
            const totals = totalsFor(items);
            if (!withinCaps(totals)) return null;
            return { items, totals, objective: components(items, totals) };
        };
        if (baselineItems) {
            const projected = baselineItems.map((i, n) => ({ ...i, amount: Math.max(bounds[n].min,
                Math.min(bounds[n].max, Math.round(i.amount / bounds[n].step) * bounds[n].step)) }));
            const warm = inspect(projected);
            if (warm && warm.objective.total < objective.total) {
                current = warm.items; objective = warm.objective;
            }
        }
        for (; passes < maxPasses && evaluations < maxEvaluations;) {
            passes++;
            let best = null;
            const consider = items => {
                const candidate = inspect(items);
                if (candidate && candidate.objective.total < (best?.objective.total ?? objective.total) - 1e-12) best = candidate;
            };
            for (let i = 0; i < bounds.length && evaluations < maxEvaluations; i++) {
                for (const jump of [-16, -8, -4, -2, -1, 1, 2, 4, 8, 16]) {
                    const amount = current[i].amount + jump * bounds[i].step;
                    if (amount < bounds[i].min || amount > bounds[i].max) continue;
                    const items = copyItems(current); items[i].amount = amount; consider(items);
                }
            }
            // A paired exchange can escape a hard-cap corner that blocks single moves.
            if (!best) for (let i = 0; i < bounds.length && evaluations < maxEvaluations; i++) {
                for (let j = i + 1; j < bounds.length && evaluations < maxEvaluations; j++) {
                    for (const a of [-1, 1]) for (const b of [-1, 1]) {
                        const items = copyItems(current);
                        items[i].amount += a * bounds[i].step; items[j].amount += b * bounds[j].step;
                        if ([i, j].every(n => items[n].amount >= bounds[n].min && items[n].amount <= bounds[n].max)) consider(items);
                    }
                }
            }
            if (!best) { termination = evaluations >= maxEvaluations ? 'evaluation-limit' : 'local-neighborhood-exhausted'; break; }
            current = best.items; objective = best.objective;
        }
        if (evaluations >= maxEvaluations) termination = 'evaluation-limit';
        // Recompute through canonical Engine, never trust search bookkeeping or AI totals.
        const verified = totalsFor(current);
        if (!withinCaps(verified) || !legal(current) || engine.getNutritionIssues(current).length)
            return fail('infeasible', 'Final canonical validation failed.');
        const after = assess(verified);
        return { status: 'feasible', feasible: true, portions: copyItems(current), totals: verified,
            baseline: { source: baselineItems ? 'LocalPortionPlanner' : 'caller-reference-fallback',
                portions: copyItems(beforeItems), totals: beforeTotals, withinMealBudget: withinCaps(beforeTotals) },
            quality: { before: assess(beforeTotals), after },
            objective: { before: components(beforeItems, beforeTotals), after: components(current, verified) },
            reasons: ['Feasible under mealBudget and experimental recipe bounds; soft goals may remain unmet.',
                ...after.flags.map(f => f.code)],
            diagnostics: { bounds, evaluations, passes, termination, globalOptimality: false,
                hardSlack: Object.fromEntries(CAPS.map(k => [k, context.mealBudget[k] - verified[k]])),
                dailyRemaining: { ...after.remaining.after },
                activeBounds: current.filter((i, n) => i.amount === bounds[n].min || i.amount === bounds[n].max).map(i => i.id) } };
    }
}
