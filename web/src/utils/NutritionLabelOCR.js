import { completeNutrients, nutrientKeys, nutrientNumber } from './NutritionEvidence.js?v=20261109_FK21_THREE_FOODS_V2';

const unitOf = value => {
    const text = String(value || '').trim().toLowerCase();
    return text === 'g' || text === '克' ? 'g' : text === 'ml' || text === '毫升' ? 'ml' : null;
};
const nutrientsOf = value => Object.fromEntries(nutrientKeys.map(key => [key, nutrientNumber(value?.[key])]));
const scale = (values, ratio) => Object.fromEntries(nutrientKeys.map(key => [key,
    nutrientNumber(values?.[key]) === null || !(ratio > 0) ? null : Math.round(values[key] * ratio * 100) / 100]));
const percentDifference = (left, right) => Math.abs(left - right) > Math.max(1, Math.abs(left) * 0.05, Math.abs(right) * 0.05);

// A product specification identifies the actual package (flavor, net quantity,
// version), not its nutrition serving instructions. Reject ambiguous OCR text
// rather than letting it satisfy the verified-label specification guard.
export function productSpecificationFromOCR(value) {
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!text) return { value: '', notice: null };
    const servingText = /\b(servings?\s*(?:per|\/)\s*container|serving\s*size|tsp|tbsp|teaspoons?|tablespoons?)\b|每份(?:量|容量)|每包裝(?:所含)?份數|茶匙|湯匙/i;
    if (servingText.test(text)) return {
        value: '',
        notice: 'AI 將「每包裝份數／每份容量」誤當商品規格，已清空規格欄。請依商品瓶身核對淨容量、口味或版本；每份容量會另外記錄。'
    };
    return { value: text, notice: null };
}

/**
 * OCR is only a proposed reading, never a verified label. Prefer the printed
 * serving amount; infer per-100 values only within that same g or mL unit.
 * Never silently equate mL and g or infer unreadable nutrients as zero.
 */
export function reviewNutritionLabelOCR(raw, currentIngredient = null) {
    const unit = unitOf(raw?.servingUnit);
    const per100Unit = unitOf(raw?.per100Unit);
    const servingSize = nutrientNumber(raw?.servingSize);
    const fromServing = nutrientsOf(raw?.perServing);
    const direct100 = nutrientsOf(raw?.per100g);
    const hasServing = !!unit && servingSize > 0
        && nutrientKeys.some(key => fromServing[key] !== null);
    const hasDirect = !!per100Unit && nutrientKeys.some(key => direct100[key] !== null);
    const notices = [];
    const spec = productSpecificationFromOCR(raw?.specification);
    if (spec.notice) notices.push(spec.notice);

    if (!unit && !hasDirect) notices.push('照片未能確認每份或每百的計量單位，無法自動換算。');
    if (unit && !(servingSize > 0)) notices.push('照片未辨識有效的每份份量，請依包裝核對。');

    const resultUnit = hasServing ? unit : hasDirect ? per100Unit : unit || per100Unit;
    const per100g = hasServing ? scale(fromServing, 100 / servingSize)
        : hasDirect ? direct100 : nutrientsOf(null);
    const perServing = hasServing ? fromServing
        : hasDirect && unit === per100Unit && servingSize > 0
            ? scale(direct100, servingSize / 100) : nutrientsOf(null);

    if (hasServing && hasDirect && completeNutrients(fromServing) && completeNutrients(direct100)) {
        if (unit !== per100Unit) {
            notices.push('標示的每份與每百使用不同單位；只依每份推算同單位的每百值，未做 g／mL 換算。');
        } else if (nutrientKeys.some(key => percentDifference(fromServing[key], direct100[key] * servingSize / 100))) {
            notices.push('AI 讀取的每份與每百營養不一致；已先採每份標示推算，請對照照片確認。');
        }
    }

    if (!completeNutrients(per100g)) notices.push('照片有營養欄位無法辨識，保留空白而非自動填 0。');
    const existingUnit = unitOf(currentIngredient?.unitLabel);
    if (currentIngredient && resultUnit && existingUnit && resultUnit !== existingUnit) {
        notices.push('原食材用 ' + existingUnit + '、照片用 ' + resultUnit + '；未有密度不能直接比較或沿用舊料理的重量。');
    } else if (currentIngredient && resultUnit && existingUnit === resultUnit
        && completeNutrients(currentIngredient.per100g) && completeNutrients(per100g)
        && nutrientKeys.some(key => percentDifference(currentIngredient.per100g[key], per100g[key]))) {
        notices.push('照片換算值與 FK 原有營養數字不同；請以實際包裝確認後再儲存。');
    }
    return { unit: resultUnit, servingUnit: unit, servingSize, perServing, per100g, specification: spec.value, notices };
}
