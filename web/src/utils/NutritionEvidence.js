import { officialNutritionEvidence } from './OfficialNutritionEvidence.js?v=20261109_FK21_THREE_FOODS_V2';
export const nutrientKeys = ['kcal', 'protein', 'carbs', 'fat', 'sodium'];
export const nutrientNumber = value => value === null || value === undefined || value === ''
    || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
export const completeNutrients = values => nutrientKeys.every(key => nutrientNumber(values?.[key]) !== null);
// Supabase jsonb does not preserve object key insertion order. Compare semantic
// JSON values rather than serialized field order; retain exact values and types.
export function equalNutritionSnapshot(a, b) {
    if (Object.is(a,b)) return true;
    if (Array.isArray(a) || Array.isArray(b))
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length
            && a.every((value,i) => equalNutritionSnapshot(value,b[i]));
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const aa = Object.keys(a).sort(), bb = Object.keys(b).sort();
    return aa.length === bb.length && aa.every((key,i) =>
        key === bb[i] && equalNutritionSnapshot(a[key],b[key]));
}

export function evidenceSnapshot(ingredient) {
    return Object.fromEntries(['unitLabel','isCount','per100g','perServing','perUnit','servingSize','servingUnit','gramsPerPack','gramsPerUnit','weightBasis']
        .filter(key => ingredient?.[key] !== undefined).map(key => [key, key.startsWith('per') && ingredient[key] && typeof ingredient[key] === 'object'
            ? Object.fromEntries(nutrientKeys.filter(n => ingredient[key][n] !== undefined).map(n => [n, ingredient[key][n]])) : ingredient[key]]));
}
export function nutritionEvidenceIssue(ingredient) {
    const evidence = ingredient?.nutritionEvidence;
    if (ingredient?.nutritionReviewRequired) return '保留的自訂營養值待確認';
    if (!evidence) return ''; // Legacy values are marked pending at load/save boundaries.
    if (evidence.snapshot && !equalNutritionSnapshot(evidence.snapshot,evidenceSnapshot(ingredient))) return '營養或重量資料已變更，請重新核對';
    if (!['verified', 'estimated'].includes(evidence.status)) return '營養來源待確認';
    if (evidence.identity?.name !== ingredient.name || (evidence.identity?.brand || '') !== (ingredient.brand || '')) return '商品身分已變更，請重新核對';
    if (evidence.kind === 'database' && evidence.status !== 'estimated') return '資料庫估算狀態待確認';
    return '';
}
export function nutritionEvidenceText(ingredient) {
    const issue = nutritionEvidenceIssue(ingredient);
    if (issue) return issue;
    return ingredient?.nutritionEvidence?.status === 'estimated' ? '官方資料庫估算' : ingredient?.nutritionEvidence?.status === 'verified' ? '產品標示已核實' : '營養來源待確認';
}

export function withNutritionEvidence(ingredient) {
    if (!ingredient || ingredient.nutritionEvidence) return ingredient;
    const official = officialNutritionEvidence[ingredient.id];
    if (!official) return {...ingredient,nutritionEvidence:{kind:'missing',status:'pending',note:'裝置私房食材來源待核對。'}};
    // A spec-specific product (e.g. non-fried Shin Ramen) cannot be certified
    // from an old generic record with numerically identical nutrient values.
    // Only the canonical Supabase row carrying explicit evidence may authorize it.
    const matches = !official.evidence.specification
        && ingredient.name === official.name && (ingredient.brand || '') === official.brand
        && equalNutritionSnapshot(evidenceSnapshot(ingredient),official.evidence.snapshot);
    return {...ingredient, nutritionEvidence: matches ? official.evidence : {kind:'missing',status:'pending',note:'自訂值或舊快取與來源快照不同，原值保留待核對。'}};
}

export function labelConsistencyIssue(ingredient) {
    if (!ingredient.perServing || !completeNutrients(ingredient.perServing) || !completeNutrients(ingredient.per100g)) return '';
    if (!['g','ml'].includes(ingredient.unitLabel) || ingredient.servingUnit?.toLowerCase() !== ingredient.unitLabel) return '';
    if (!(ingredient.servingSize > 0)) return '每份重量或容量待確認';
    return nutrientKeys.some(key => Math.abs(ingredient.perServing[key] - ingredient.per100g[key] * ingredient.servingSize / 100)
        > Math.max(1, ingredient.perServing[key] * 0.05)) ? '每份與每百單位數值不一致，請核對標示' : '';
}
