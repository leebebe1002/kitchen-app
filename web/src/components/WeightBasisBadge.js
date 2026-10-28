export const WEIGHT_BASES = Object.freeze({
    raw: { label: '生', description: '生重：烹調前可食重量' },
    cooked: { label: '熟', description: '熟重：烹調後可食重量' },
    dry: { label: '乾', description: '乾重：加水或烹調前乾燥重量' },
    as_sold: { label: '即', description: '即食／販售狀態：依營養標示秤量' },
    unknown: { label: '?', description: '重量基準待確認，請勿自行換算生熟重量' },
    count: { label: '', description: '依顆、條、包等計數單位備料' }
});

export function getWeightBasis(ingredient, unit) {
    // 依這一列實際顯示的單位判定；計數食材改用 g 時仍需確認重量基準。
    const displayUnit = unit || ingredient?.unitLabel;
    if (['顆', '個', '條', '包', '根', '片', '盒', '罐', '袋'].includes(displayUnit)
        || (!displayUnit && (ingredient?.isCount || ingredient?.perUnit))) return 'count';
    const basis = ingredient?.weightBasis;
    return Object.hasOwn(WEIGHT_BASES, basis) && basis !== 'count' ? basis : 'unknown';
}

export function weightBasisText(ingredient, unit) {
    const basis = getWeightBasis(ingredient, unit);
    return basis === 'count' ? '' : `【${basis === 'unknown' ? '重量基準待確認' : WEIGHT_BASES[basis].description.split('：')[0]}】`;
}

export default {
    props: ['ingredient', 'unit'],
    computed: {
        basis() { return getWeightBasis(this.ingredient, this.unit); },
        info() { return WEIGHT_BASES[this.basis]; }
    },
    template: `<span class="weight-basis-badge" :class="'weight-basis-' + basis"
        role="img" :aria-label="info.description" :title="info.description">{{ info.label }}</span>`
};
