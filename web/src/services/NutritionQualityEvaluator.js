export const evaluatorVersion = '1.0.0-shadow';
const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sodium'];
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const record = fn => Object.fromEntries(KEYS.map(key => [key, fn(key)]));

/**
 * Read-only shadow assessment, with no imports or environment access.
 * Caller supplies reliable daily targets, complete already-consumed totals (explicit
 * zeros for no meals), and known totals or KitchenEngine-calculated totals. Never
 * pass AI-reported totals. Units: kcal, protein/carbs/fat in g, sodium in mg.
 * Existing meal context targets/consumed/mode may be spread
 * into this input; its legacy mealBudget/mealsRemaining are deliberately ignored.
 * Standard mode needs explicit mealShare or expectedMealsRemaining INCLUDING this
 * meal. Remaining mode explicitly allocates all available daily budget to this meal.
 * No inferred slot schedule. Range factors are configurable PRODUCT assumptions,
 * not clinical thresholds. Output has no pass/fail, blocking action or aggregate score.
 */
export function evaluateNutritionQuality(input = {}) {
    const { targets, consumed, totals, mode = 'standard', mealShare,
        expectedMealsRemaining, energyRangeFactors = [0.8, 1.2] } = input ?? {};
    const result = {
        evaluatorVersion, status: 'insufficient-data', shadowOnly: true,
        totals: null, progress: null, remaining: null, softTargets: null,
        dimensions: null, flags: [], reasons: [],
        unassessedFields: ['allergies', 'fiber', 'tdee', 'fatLoss', 'muscleRetention'],
        fieldAssessments: { allergies: 'not-assessed', fiber: 'not-assessed', tdee: 'not-assessed',
            fatLoss: 'not-assessed', muscleRetention: 'not-assessed' },
        metadata: { mode: ['standard', 'remaining'].includes(mode) ? mode : null,
            sodiumTargetMeaning: 'personal-setting-not-medical-limit',
            allocation: null, productAssumptions: [] }
    };
    const missing = [];
    for (const [name, values] of Object.entries({ targets, consumed, totals })) {
        for (const key of KEYS) {
            if (!nonnegative(values?.[key]) || (name === 'targets' && values[key] === 0))
                missing.push(`${name}.${key}`);
        }
    }
    if (!missing.some(path => path.startsWith('totals.'))) result.totals = record(k => totals[k]);
    let share;
    if (!['standard', 'remaining'].includes(mode)) missing.push('mode');
    if (mealShare !== undefined && expectedMealsRemaining !== undefined) missing.push('allocation.ambiguous');
    if (mode === 'remaining') {
        share = 1;
        if (mealShare !== undefined || expectedMealsRemaining !== undefined) missing.push('allocation.ambiguous');
    } else if (mealShare !== undefined) {
        if (nonnegative(mealShare) && mealShare > 0 && mealShare <= 1) share = mealShare;
        else missing.push('mealShare');
    } else if (Number.isSafeInteger(expectedMealsRemaining) && expectedMealsRemaining > 0) {
        share = 1 / expectedMealsRemaining;
    } else missing.push('expectedMealsRemaining');
    if (!Array.isArray(energyRangeFactors) || energyRangeFactors.length !== 2
        || !energyRangeFactors.every(nonnegative) || energyRangeFactors[0] <= 0
        || energyRangeFactors[0] > 1 || energyRangeFactors[1] < 1) missing.push('energyRangeFactors');
    const insufficient = paths => {
        result.flags.push({ code: 'insufficient-data', severity: 'data', paths: [...paths] });
        result.reasons.push('Complete finite nonnegative nutrition, positive daily targets and explicit allocation are required.');
        return result;
    };
    if (missing.length) return insufficient(missing);

    const after = record(k => consumed[k] + totals[k]);
    const beforeRemaining = record(k => targets[k] - consumed[k]);
    const afterRemaining = record(k => targets[k] - after[k]);
    const soft = record(k => Math.max(0, beforeRemaining[k]) * share);
    const lower = soft.kcal * energyRangeFactors[0], upper = soft.kcal * energyRangeFactors[1];
    const beforeRatio = record(k => consumed[k] / targets[k]);
    const afterRatio = record(k => after[k] / targets[k]);
    if ([...Object.values(after), ...Object.values(beforeRatio), ...Object.values(afterRatio), lower, upper]
        .some(value => !Number.isFinite(value))) return insufficient(['arithmetic-overflow']);

    result.status = 'evaluated';
    result.progress = { before: record(k => consumed[k]), after, beforeRatio, afterRatio };
    // Signed remaining preserves target - consumed, including an already exceeded day.
    result.remaining = { before: beforeRemaining, after: afterRemaining,
        availableBefore: record(k => Math.max(0, beforeRemaining[k])) };
    result.softTargets = { shares: soft, energyRange: { lower, upper }, proteinMinimum: soft.protein };
    result.metadata.allocation = { share, source: mode === 'remaining' ? 'explicit-remaining-mode'
        : mealShare !== undefined ? 'caller-meal-share' : 'caller-expected-meals' };
    result.metadata.productAssumptions = [
        { name: 'energy-range-factors', value: [...energyRangeFactors] },
        { name: 'remaining-budget-share', value: share, meaning: 'soft planning allocation, not a meal ceiling' }
    ];
    const flag = (code, severity, nutrient, actual, threshold, operator, basis, reason) => {
        result.flags.push({ code, severity, nutrient, actual, threshold, operator,
            difference: actual - threshold, basis, reason });
    };
    if (totals.kcal < lower) flag('meal-energy-below-target', 'soft', 'kcal', totals.kcal, lower, '<',
        'softTargets.energyRange.lower', 'Meal energy is below the configured planning band.');
    if (totals.kcal > upper) flag('meal-energy-above-target', 'soft', 'kcal', totals.kcal, upper, '>',
        'softTargets.energyRange.upper', 'Meal energy is above the configured planning band.');
    if (after.kcal > targets.kcal) flag('daily-energy-exceeded', 'hard-risk', 'kcal', after.kcal, targets.kcal, '>',
        'targets.kcal', 'Recorded intake plus this meal exceeds the personal daily energy target; this does not establish a deficit relative to TDEE.');
    if (totals.protein < soft.protein) flag('protein-shortfall', 'soft', 'protein', totals.protein, soft.protein, '<',
        'softTargets.proteinMinimum', 'Protein is below the allocated minimum expectation, not a hard failure.');
    for (const key of ['fat', 'sodium']) {
        if (totals[key] > soft[key]) flag(`${key}-high-share`, 'soft', key, totals[key], soft[key], '>',
            `softTargets.shares.${key}`, 'Meal uses more than the planned share; inspect the daily remaining budget.');
        if (after[key] > targets[key]) flag(`daily-${key}-target-exceeded`, 'soft', key, after[key], targets[key], '>',
            `targets.${key}`, 'Personal daily target exceeded; not a general medical limit.');
    }
    result.dimensions = {
        energy: { priority: 'high', status: totals.kcal < lower ? 'below-band' : totals.kcal > upper ? 'above-band' : 'within-band',
            belowBy: Math.max(0, lower - totals.kcal), aboveBy: Math.max(0, totals.kcal - upper),
            dailyExcess: Math.max(0, after.kcal - targets.kcal) },
        protein: { priority: 'high', status: totals.protein < soft.protein ? 'below-expectation' : 'meets-expectation',
            shortfall: Math.max(0, soft.protein - totals.protein) },
        fat: { priority: 'advisory', aboveShareBy: Math.max(0, totals.fat - soft.fat), remainingAfter: afterRemaining.fat },
        sodium: { priority: 'advisory', aboveShareBy: Math.max(0, totals.sodium - soft.sodium), remainingAfter: afterRemaining.sodium },
        carbs: { priority: 'flexible', differenceFromShare: totals.carbs - soft.carbs }
    };
    result.reasons.push('Quality compares energy adequacy and protein expectation alongside flexible daily fat, sodium and carbohydrate budgets.',
        'Allergy safety, fiber adequacy, actual fat loss and muscle retention are not assessed by these five nutrient totals.');
    return result;
}
