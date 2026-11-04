import { completeNutrients, nutritionEvidenceIssue } from './NutritionEvidence.js?v=20261104_NUTRITION_V3';
const countUnits = new Set(['顆', '個', '條', '包', '根', '片', '盒', '罐', '袋']);

export const isCountUnit = unit => countUnits.has(unit);

export function ingredientNutritionBasis(ingredient, request = {}) {
    if (!ingredient || nutritionEvidenceIssue(ingredient)) return null;
    const result = basis => completeNutrients(basis.nutrients) ? basis : null;
    const unit = request.unit || ingredient.unitLabel || (ingredient.isCount ? '顆' : 'g');
    const count = countUnits.has(ingredient.unitLabel) || ingredient.isCount || !!ingredient.perUnit;
    if (unit === '包' && ingredient.unitLabel === 'g'
        && ingredient.per100g && !ingredient.isCount && !ingredient.perUnit
        && Number.isFinite(ingredient.gramsPerPack) && ingredient.gramsPerPack > 0) {
        // Verified package mass: preserve the recipe's '包' quantity, calculate on dry grams.
        return result({ nutrients: ingredient.per100g, divisor: 100 / ingredient.gramsPerPack });
    }
    if (countUnits.has(unit)) {
        if (unit !== ingredient.unitLabel || !ingredient.perUnit) return null;
        return result({ nutrients: ingredient.perUnit, divisor: 1 });
    }
    // No density, package mass or strip mass has been verified; never infer them.
    if (count || unit !== (ingredient.unitLabel || 'g') || !ingredient.per100g) return null;
    return result({ nutrients: ingredient.per100g, divisor: 100 });
}

export function ingredientNutritionIssue(ingredient, request) {
    if (!Number.isFinite(Number(request.amount)) || Number(request.amount) < 0) return `${ingredient?.name || request.id}：份量無效`;
    if (!(Number(request.amount) > 0)) return '';
    const evidenceIssue = nutritionEvidenceIssue(ingredient);
    if (evidenceIssue) return `${ingredient?.name || request.id}：${evidenceIssue}`;
    if (!ingredientNutritionBasis(ingredient, request)) {
        return `${ingredient?.name || request.id}：${request.unit || ingredient?.unitLabel || '單位'} 換算待確認`;
    }
    return ingredient.nutritionReviewRequired ? `${ingredient.name}：保留的自訂營養值待確認` : '';
}
