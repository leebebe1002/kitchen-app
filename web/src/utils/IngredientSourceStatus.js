import { withNutritionEvidence, nutritionEvidenceIssue } from './NutritionEvidence.js?v=20261109_FK21_THREE_FOODS_V2';
import { ingredientNutritionBasis } from './IngredientUnit.js?v=20261109_FK21_THREE_FOODS_V2';

// Read-only presentation of FK's existing canonical evidence.
// This does not create a second source of nutrition values or modify the database.
export const INGREDIENT_SOURCE_LABELS = Object.freeze({
    product: '產品標示',
    generic: '通用',
    pending: '待確認'
});

export function ingredientSourceStatus(rawIngredient) {
    const ingredient = withNutritionEvidence(rawIngredient);
    const evidence = ingredient?.nutritionEvidence;
    const issue = ingredient ? nutritionEvidenceIssue(ingredient) : '食材不存在';
    const unit = ingredient?.unitLabel || (ingredient?.isCount ? '顆' : 'g');
    const basis = ingredient && !issue
        ? ingredientNutritionBasis(ingredient, { id: ingredient.id, unit, amount: 1 })
        : null;
    let code = 'pending';
    let reason = issue || (!basis ? '營養數值或計數單位換算尚未確認' : '');
    if (reason === '營養來源待確認' && evidence?.note) reason = evidence.note;

    if (!reason && (evidence?.weightBasis === 'unknown' || ingredient?.weightBasis === 'unknown')) {
        reason = '生熟／乾濕重量基準待確認';
    }
    if (!reason && evidence?.kind === 'product_label' && evidence.status === 'verified') {
        code = 'product';
    } else if (!reason && evidence?.kind === 'database' && evidence.status === 'estimated'
        && Array.isArray(evidence.sources) && evidence.sources.length > 0) {
        code = 'generic';
    } else if (!reason) {
        reason = evidence?.note || '缺少對應商品標示或可信通用資料來源';
    }
    return {
        code,
        label: INGREDIENT_SOURCE_LABELS[code],
        reason,
        sources: evidence?.sources || [],
        checkedAt: evidence?.checkedAt || null,
        // This flag is only for display. The KitchenEngine remains the authority
        // that decides whether to calculate every nutrient and selected amount.
        displayReady: code !== 'pending'
    };
}
