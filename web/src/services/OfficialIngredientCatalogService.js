/**
 * Family Kitchen canonical 100-item ingredient catalog, backed by Supabase.
 * This is NOT Personal Kitchen State and never stores private/custom ingredients.
 * The historical GitHub JSON is a bootstrap snapshot only after cutover.
 */
import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseConfig.js';

export const OFFICIAL_CATALOG_TABLE = 'fk_ingredient_catalog';
export const OFFICIAL_CATALOG_SIZE = 100;
export const OFFICIAL_CATALOG_CATEGORIES = ['proteins', 'veggies', 'carbs', 'sauces'];
export const OFFICIAL_NUTRITION_FIELDS = ['unitLabel','isCount','per100g','perServing',
    'perUnit','servingSize','servingUnit','gramsPerPack','gramsPerUnit','weightBasis',
    'weightBasisSource','nutritionEvidence','nutritionReviewRequired','nutritionCache'];

const revision = value => Number.isSafeInteger(Number(value)) && Number(value) >= 1
    ? Number(value) : null;
const validItem = item => item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length > 0 && item.id !== 'cocoa_powder'
    && typeof item.name === 'string' && item.name.length > 0
    && OFFICIAL_CATALOG_CATEGORIES.includes(item.category)
    && !['photo','photoUrl'].some(field => /^data:/i.test(item[field] || ''));

export function verifyOfficialCatalogRows(rows, { count = OFFICIAL_CATALOG_SIZE } = {}) {
    if (!Array.isArray(rows) || rows.length !== count) {
        throw Error('Supabase 官方食材清單不完整，已保留手機原資料，不能用空白雲端覆寫。');
    }
    const ids = new Set();
    const positions = new Set();
    for (const row of rows) {
        if (!row || !validItem(row.ingredient) || row.ingredient_id !== row.ingredient.id
            || !revision(row.revision) || ids.has(row.ingredient_id)
            || !Number.isSafeInteger(row.position) || row.position < 0
            || positions.has(row.position)) {
            throw Error('Supabase 官方食材 ID／版本或內容異常，已保留手機原資料。');
        }
        ids.add(row.ingredient_id);
        positions.add(row.position);
    }
    if (!ids.has('snow_white_mushroom')) throw Error('雲端缺少雪白菇，已保留原資料。');
    return rows;
}

export function groupOfficialCatalogRows(rows, options) {
    const validRows = [...verifyOfficialCatalogRows(rows, options)]
        .sort((a,b) => a.position-b.position);
    const catalog = Object.fromEntries(OFFICIAL_CATALOG_CATEGORIES.map(cat => [cat, []]));
    for (const row of validRows) catalog[row.ingredient.category].push(JSON.parse(JSON.stringify(row.ingredient)));
    return catalog;
}

export function canonicalNutritionItem(source, changed) {
    if (!validItem(source) || !validItem(changed)
        || source.id !== changed.id || source.category !== changed.category
        || source.name !== changed.name || (source.brand || '') !== (changed.brand || '')) {
        throw Error('官方食材身分或規格已改變，不能當作同一項共用營養修正。');
    }
    // A photo of a branded/variant product is not evidence that a generic
    // canonical food should receive that product's nutrition for the family.
    const label = changed.nutritionEvidence;
    if (label?.kind === 'product_label') {
        const approvedBrand = String(source.brand || '').trim().toLowerCase();
        const labelBrand = String(label.identity?.brand || '').trim().toLowerCase();
        const approvedSpec = String(source.nutritionEvidence?.specification || '').trim();
        const labelSpec = String(label.specification || '').trim();
        if ((labelBrand && labelBrand !== approvedBrand)
            || (approvedSpec && labelSpec !== approvedSpec)) {
            throw Error('此營養標示屬於不同品牌或規格，請另存成獨立食材，不能覆蓋全家官方基準。');
        }
    }
    const next = JSON.parse(JSON.stringify(source)); // Vue may proxy map values in the UI.
    for (const key of OFFICIAL_NUTRITION_FIELDS) {
        if (key === 'nutritionCache') continue; // Local cache metadata is never an authority.
        if (Object.hasOwn(changed,key)) next[key] =
            changed[key] === undefined ? undefined : JSON.parse(JSON.stringify(changed[key]));
        else delete next[key];
    }
    // No Base64 photo, store, pantry, or local fields from the device are promoted.
    const panel = ['per100g','perServing','perUnit'];
    for (const field of panel) {
        const data = next[field];
        if (data === undefined || data === null) continue;
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || ['kcal','protein','carbs','fat','sodium'].some(k => data[k] !== undefined
                && (typeof data[k] !== 'number' || !Number.isFinite(data[k]) || data[k] < 0))) {
            throw Error('營養數值含無效或負數，未更新官方食材。');
        }
    }
    if (!panel.some(key => next[key] && typeof next[key] === 'object'))
        throw Error('官方食材缺少營養基準，請先補齊資料。');
    return next;
}

export class OfficialIngredientCatalogService {
    constructor({ auth = authService, fetcher = fetch } = {}) {
        this.auth = auth;
        this.fetcher = fetcher;
    }

    requireContext() {
        const identity = this.auth.getPersonalContext();
        if (!identity || !['household','ariel'].includes(identity.scopeId)) throw Error('尚未確認 FK 登入，不能同步官方食材。');
        return identity;
    }

    async request(path, options, identity) {
        if (!this.auth.isCurrentContext(identity)) throw Error('登入身分已變更，沒有更動雲端食材。');
        // Vue wraps the Engine's service in a reactive Proxy. Native Window.fetch
        // rejects a Proxy service as its receiver (Safari: Illegal Invocation).
        // Always call it with the real Window, including in proxied instances.
        const response = await this.fetcher.call(globalThis.window ?? globalThis,
            `${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
            ...options, signal: AbortSignal.timeout(10000),
            headers: { apikey: SUPABASE_CONFIG.anonKey,
                Authorization: `Bearer ${identity.token}`,
                'Content-Type': 'application/json', ...options?.headers }
        });
        if (!this.auth.isCurrentContext(identity)) throw Error('登入身分已變更，沒有更動雲端食材。');
        if (response.status === 409 || response.status === 412 || response.status === 400) {
            throw Object.assign(Error('其他裝置可能已修改食材，請核對最新版本。'), {code:'FK_CATALOG_CONFLICT'});
        }
        if (!response.ok) throw Error(`Supabase 官方食材尚無法同步（HTTP ${response.status}），本機資料保留。`);
        const rows = await response.json();
        if (!this.auth.isCurrentContext(identity) || !Array.isArray(rows)) throw Error('雲端回應不完整，原資料保留。');
        return rows;
    }

    async list() {
        const identity = this.requireContext();
        const rows = await this.request(`${OFFICIAL_CATALOG_TABLE}?select=ingredient_id,position,ingredient,revision,updated_at&order=position.asc`, {}, identity);
        return verifyOfficialCatalogRows(rows);
    }

    async publish({ item, expectedRevision }) {
        const identity = this.requireContext();
        if (!validItem(item) || !revision(expectedRevision)) throw Error('食材或雲端版本未驗證，未同步。');
        const path = `${OFFICIAL_CATALOG_TABLE}?ingredient_id=eq.${encodeURIComponent(item.id)}&revision=eq.${expectedRevision}`;
        const rows = await this.request(path, {
            method: 'PATCH', headers: {Prefer:'return=representation'},
            body: JSON.stringify({ ingredient:item, revision:Number(expectedRevision)+1, updated_by:identity.userId })
        }, identity);
        if (rows.length !== 1 || rows[0]?.ingredient_id !== item.id
            || revision(rows[0].revision) !== Number(expectedRevision)+1) {
            throw Object.assign(Error('雲端版本已被更新，手機修改保留為待處理，不會覆蓋其他裝置。'), {code:'FK_CATALOG_CONFLICT'});
        }
        return rows[0];
    }
}

export default new OfficialIngredientCatalogService();
