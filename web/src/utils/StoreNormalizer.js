/**
 * 🏬 StoreNormalizer.js
 * 採買通路名稱正規化、歷史別名相容與去重工具
 */

export const CANONICAL_STORES = ['全聯', 'Costco', '義美', 'EC', '傳統市場', '其他'];

const STORE_ALIASES = {
    'Costco 好市多': 'Costco',
    '好市多': 'Costco',
    'EC 電商': 'EC'
};

/**
 * 正規化單一通路名稱
 * @param {string} store
 * @returns {string}
 */
export function normalizeStoreName(store) {
    if (!store || typeof store !== 'string') return store || '';
    const trimmed = store.trim();
    return STORE_ALIASES[trimmed] || trimmed;
}

/**
 * 正規化通路列表（支援單一字串或陣列，確保 trim、canonical 轉換與去重）
 * @param {string|string[]} stores
 * @returns {string[]}
 */
export function normalizeStoreList(stores) {
    if (!stores) return [];
    const arr = Array.isArray(stores) ? stores : [stores];
    const normalized = arr
        .map(s => normalizeStoreName(s))
        .filter(s => typeof s === 'string' && s.length > 0);
    return Array.from(new Set(normalized));
}
