const countUnits = new Set(['顆', '個', '條', '包', '根']);

export function ingredientNutritionBasis(ingredient, request = {}) {
    if (!ingredient) return null;
    const unit = request.unit || ingredient.unitLabel || (ingredient.isCount ? '顆' : 'g');
    const count = countUnits.has(ingredient.unitLabel) || ingredient.isCount || !!ingredient.perUnit;
    if (unit === '包' && ingredient.unitLabel === 'g'
        && ingredient.per100g && !ingredient.isCount && !ingredient.perUnit
        && Number.isFinite(ingredient.gramsPerPack) && ingredient.gramsPerPack > 0) {
        // Verified package mass: preserve the recipe's '包' quantity, calculate on dry grams.
        return { nutrients: ingredient.per100g, divisor: 100 / ingredient.gramsPerPack };
    }
    if (countUnits.has(unit)) {
        if (unit !== ingredient.unitLabel || !ingredient.perUnit) return null;
        return { nutrients: ingredient.perUnit, divisor: 1 };
    }
    // No density, package mass or strip mass has been verified; never infer them.
    if (count || unit !== (ingredient.unitLabel || 'g') || !ingredient.per100g) return null;
    return { nutrients: ingredient.per100g, divisor: 100 };
}

export function ingredientNutritionIssue(ingredient, request) {
    if (!(Number(request.amount) > 0)) return '';
    if (!ingredientNutritionBasis(ingredient, request)) {
        return `${ingredient?.name || request.id}：${request.unit || ingredient?.unitLabel || '單位'} 換算待確認`;
    }
    return ingredient.nutritionReviewRequired ? `${ingredient.name}：保留的自訂營養值待確認` : '';
}
