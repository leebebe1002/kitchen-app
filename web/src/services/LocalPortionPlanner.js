import { ingredientNutritionBasis, isCountUnit } from '../utils/IngredientUnit.js?v=20261109_FK21_THREE_FOODS_V2';

const CEILINGS = ['kcal', 'carbs', 'fat', 'sodium'];
const NORMAL_GRAMS = Object.freeze({
    proteins: 70, veggies: 60, carbs: 45, sauces: 15
});

// Conservative, deterministic *estimated* portions when Gemini cannot produce
// a validated answer. Never present this as Gemini output or medical advice.
// Never write these estimates to pantry, profiles, meals or nutrition catalogs.
export function planLocalPortions(engine, expected, contexts) {
    const portions = {};
    for (const context of contexts) {
        const original = expected[context.member];
        if (!Array.isArray(original) || !original.length) return null;
        const items = original.map(item => {
            const ingredient = engine.getIngredientById(item.id);
            const basis = ingredientNutritionBasis(ingredient, item);
            if (!ingredient || !basis || engine.getNutritionIssues([{ ...item, amount: 1 }]).length) return null;
            const count = isCountUnit(item.unit);
            const supplied = Number(item.amount);
            const sodiumPerUnit = basis.nutrients.sodium / basis.divisor;
            const usualGrams = NORMAL_GRAMS[ingredient.category] || 40;
            // Use smaller *starting* portions for high-sodium gram ingredients,
            // so a standard lunch does not consume nearly all daily sodium.
            // This is a planning heuristic, not a new per-meal hard limit.
            const defaultGrams = sodiumPerUnit > 10 ? Math.min(usualGrams,30)
                : sodiumPerUnit > 3 ? Math.min(usualGrams,25) : usualGrams;
            const proposed = supplied > 0 ? supplied : count ? 1 : defaultGrams;
            const amount = count ? Math.max(1, Math.min(20, Math.round(proposed)))
                : Math.max(1, Math.min(1000, Math.round(proposed * 10) / 10));
            return { id: item.id, amount, unit: item.unit };
        });
        if (items.some(item => !item)) return null;
        if (items.some(item => context.excludedIds?.includes(item.id))) return null;
        const limit = context.mealBudget;
        if (CEILINGS.some(key => !Number.isFinite(limit[key]) || limit[key] <= 0)) return null;

        // Reduce whichever included ingredient contributes most to the exceeded
        // nutrient. Counted ingredients cannot be fractionated below 1 item.
        // Non-count items have a 1g minimum: if all foods cannot fit, return null.
        for (let pass = 0; pass < 120; pass++) {
            const total = engine.calculateNutritionForMember(items, context.member);
            if (CEILINGS.some(key => !Number.isFinite(total[key]))) return null;
            const over = CEILINGS.filter(key => total[key] > limit[key] + 0.05);
            if (!over.length) {
                portions[context.member] = items;
                break;
            }
            const key = over.reduce((worst, candidate) =>
                total[candidate] / limit[candidate] > total[worst] / limit[worst] ? candidate : worst);
            const options = items.map((item, index) => {
                const ingredient = engine.getIngredientById(item.id);
                const basis = ingredientNutritionBasis(ingredient, item);
                const count = isCountUnit(item.unit);
                const rate = basis.nutrients[key] / basis.divisor;
                const reducible = count ? item.amount > 1 : item.amount > 1;
                return { index, rate, count, reducible,
                    contribution: Number.isFinite(rate) ? rate * item.amount : 0 };
            }).filter(item => item.reducible && item.rate > 0);
            options.sort((a,b) => b.contribution - a.contribution);
            if (!options.length) return null;
            const winner = options[0], selected = items[winner.index];
            if (winner.count) {
                selected.amount = Math.max(1, Math.floor(selected.amount - Math.max(1, (total[key] - limit[key]) / winner.rate)));
            } else {
                // Integer decigrams, including a margin for 1-decimal nutrition
                // rounding performed by the existing KitchenEngine.
                const excess = total[key] - limit[key];
                const next = Math.floor(10 * Math.max(1, selected.amount - excess / winner.rate - 0.2)) / 10;
                if (next >= selected.amount) return null;
                selected.amount = next;
            }
        }
        if (!portions[context.member]) return null;
    }
    return { portions };
}
