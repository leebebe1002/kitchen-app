import {
    evidenceSnapshot, completeNutrients, nutritionEvidenceIssue, labelConsistencyIssue
} from './NutritionEvidence.js?v=20261109_FK21_THREE_FOODS_V2';

const NUTRITION_FIELDS = ['unitLabel','isCount','per100g','perServing','perUnit','servingSize',
    'servingUnit','gramsPerPack','gramsPerUnit','weightBasis'];
const NUTRIENT_FIELDS = ['kcal','protein','carbs','fat','sodium'];
const normalize = value => String(value || '').trim().toLowerCase();
const hasAmbiguousBrand = ingredient => /[\/／]/.test(ingredient?.brand || '');
const canonicalJson = value => Array.isArray(value) ? value.map(canonicalJson)
    : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]))
        : value;
const sameJsonData = (a,b) => JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));

export function sharedIngredientIdentity(item) {
    return {
        name: normalize(item?.name),
        brand: normalize(item?.brand),
        specification: normalize(item?.nutritionEvidence?.specification)
    };
}

export const sameSharedIdentity = (left, right) =>
    left?.name === right?.name && left?.brand === right?.brand
    // A canonical ID may not yet have a specification. A known conflicting
    // variant must never inherit another variant's verified nutrition.
    && (!left?.specification || !right?.specification
        || left.specification === right.specification);

export function completeSharedNutrition(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
    const safe = object => NUTRIENT_FIELDS.every(key =>
        typeof object?.[key] === 'number' && Number.isFinite(object[key])
        && object[key] >= 0);
    const unit = values.unitLabel;
    const basis = unit === 'g' || unit === 'ml'
        ? safe(values.per100g)
        : safe(values.perUnit) || (
            (Number(values.gramsPerUnit) > 0 || Number(values.gramsPerPack) > 0)
            && safe(values.per100g));
    if (!basis || !values.weightBasis || values.weightBasis === 'unknown') return false;
    if (values.perServing && !safe(values.perServing)) return false;
    if (values.perUnit && !safe(values.perUnit)) return false;
    if (values.per100g && !safe(values.per100g)) return false;
    return !labelConsistencyIssue(values);
}

export function sharedNutritionPayload(ingredient, official) {
    if (!official || !ingredient || ingredient.id !== official.id
        || hasAmbiguousBrand(official)
        || !sameSharedIdentity(sharedIngredientIdentity(ingredient), sharedIngredientIdentity(official)))
        return null;
    if (ingredient.nutritionEvidence?.kind !== 'product_label'
        || ingredient.nutritionEvidence?.status !== 'verified'
        || ingredient.nutritionReviewRequired || nutritionEvidenceIssue(ingredient)) return null;
    const nutrition = evidenceSnapshot(ingredient);
    // A verified per-100g/mL label may not provide a complete per-serving panel.
    // Never publish partial nutrients as zeros or pretend they were measured.
    for (const field of ['per100g','perServing','perUnit']) {
        if (nutrition[field] !== undefined && !completeNutrients(nutrition[field])) delete nutrition[field];
    }
    if (!completeSharedNutrition(nutrition)) return null;
    // Only the complete numeric basis and minimal verification metadata are shared.
    const identity = sharedIngredientIdentity(ingredient);
    return {
        ingredient_id: ingredient.id,
        identity,
        nutrition,
        evidence: {
            kind: 'product_label', status: 'verified',
            checkedAt: ingredient.nutritionEvidence.checkedAt || null,
            identity: { name: ingredient.name, brand: ingredient.brand || '' },
            specification: ingredient.nutritionEvidence.specification || '',
            weightBasis: ingredient.weightBasis,
            snapshot: nutrition
        }
    };
}

export function validateSharedRow(row) {
    if (!row || typeof row.ingredient_id !== 'string'
        || !Number.isSafeInteger(Number(row.revision)) || Number(row.revision) < 1
        || !row.identity || !row.evidence || !row.nutrition
        || row.evidence.kind !== 'product_label' || row.evidence.status !== 'verified'
        || !completeSharedNutrition(row.nutrition)
        || !sameJsonData(row.evidence.snapshot,row.nutrition)
        || !sameJsonData(row.identity, sharedIngredientIdentity({
            name: row.evidence.identity?.name, brand: row.evidence.identity?.brand,
            nutritionEvidence: { specification: row.evidence.specification }
        }))) return false;
    return true;
}

export function applySharedNutrition(ingredient, row, official) {
    if (!official || hasAmbiguousBrand(official)
        || ingredient?.id !== official.id || !validateSharedRow(row)
        || ingredient.id !== row.ingredient_id
        || !sameSharedIdentity(sharedIngredientIdentity(ingredient),row.identity)
        || !sameSharedIdentity(sharedIngredientIdentity(official),row.identity)) return false;
    // Replace the nutrition fields atomically, never merge an old per-unit value
    // with a newer per-100 value. Keep local photos, prices, stores and identity.
    for (const key of NUTRITION_FIELDS) delete ingredient[key];
    for (const key of NUTRITION_FIELDS) if (Object.hasOwn(row.nutrition,key))
        ingredient[key] = structuredClone(row.nutrition[key]);
    ingredient.nutritionEvidence = structuredClone(row.evidence);
    ingredient.nutritionReviewRequired = false;
    ingredient.nutritionCache = { ...ingredient.nutritionCache, edited: true, sharedRevision: Number(row.revision) };
    ingredient.weightBasisSource = '';
    return true;
}
