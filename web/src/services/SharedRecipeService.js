/**
 * FK #14 shared family recipes: optional custom rows and edits to static dishes.
 * Nutrition authority remains fk_ingredient_catalog; no private Pantry data here.
 */
import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseConfig.js';

export const SHARED_RECIPE_TABLE = 'fk_shared_recipe_overrides';

export function validateRecipe(recipe) {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)
        || typeof recipe.id !== 'string' || !recipe.id || recipe.id.length > 120
        || ['__proto__','constructor','prototype'].includes(recipe.id)
        || typeof recipe.name !== 'string' || !recipe.name.trim()) {
        throw Error('料理的 ID 或名稱無效，原本料理保留。');
    }
    // Only the application's official recipe schema travels to Supabase.
    // This never includes a photo's Base64, Pantry, shopping or account state.
    const clean = JSON.parse(JSON.stringify(recipe));
    const bytes = JSON.stringify(clean);
    if (bytes.length > 120000 || /data:(?:image|application)\//i.test(bytes)) {
        throw Error('料理含過大內容或未上傳的照片，沒有同步到雲端。');
    }
    for (const key of ['recommendedProteins','recommendedVeggies',
        'recommendedCarbs','recommendedSauces','defaultIngredients',
        'sopSteps','categories']) {
        if (clean[key] !== undefined && !Array.isArray(clean[key]))
            throw Error('料理清單格式不正確，原本料理保留。');
    }
    return clean;
}

export function verifySharedRecipes(rows) {
    if (!Array.isArray(rows) || rows.length > 10000)
        throw Error('Supabase 料理列表異常，不能用雲端覆寫手機。');
    const ids = new Set();
    for (const row of rows) {
        if (!row || !row.recipe || !Number.isSafeInteger(Number(row.revision))
            || Number(row.revision) < 1 || row.recipe_id !== row.recipe.id
            || ids.has(row.recipe_id)) {
            throw Error('雲端料理 ID 或版本異常，手機資料保留。');
        }
        validateRecipe(row.recipe);
        ids.add(row.recipe_id);
    }
    return rows;
}

export class SharedRecipeService {
    constructor({ auth = authService, fetcher = fetch } = {}) {
        this.auth = auth;
        this.fetcher = fetcher;
    }

    context() {
        const c = this.auth.getPersonalContext();
        if (!c || !['household','ariel'].includes(c.scopeId)
            || !this.auth.isCurrentContext(c)) throw Error('尚未確認家庭登入，料理沒有上傳。');
        return c;
    }

    async request(path, options = {}, identity) {
        if (!this.auth.isCurrentContext(identity)) throw Error('登入帳號已切換，沒有上傳料理。');
        // Vue reactive Engine may proxy this service, never call Window.fetch with
        // the proxy as receiver (iOS Safari rejects Illegal Invocation).
        const res = await this.fetcher.call(globalThis.window ?? globalThis,
            `${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
                ...options,
                signal: AbortSignal.timeout(10000),
                headers: {
                    apikey:SUPABASE_CONFIG.anonKey,
                    Authorization:`Bearer ${identity.token}`,
                    'Content-Type':'application/json',
                    ...options.headers
                }
            });
        if (!this.auth.isCurrentContext(identity)) throw Error('登入帳號已切換，原本料理保留。');
        if (res.status === 409 || res.status === 412 || res.status === 400)
            throw Object.assign(Error('其他手機已修改此料理，沒有覆寫雲端，請確認差異。'),
                {code:'FK_RECIPE_CONFLICT'});
        if (!res.ok) throw Error(`料理尚未同步（HTTP ${res.status}），手機版本保留。`);
        const result = await res.json();
        if (!this.auth.isCurrentContext(identity) || !Array.isArray(result))
            throw Error('料理同步回應不完整，手機版本保留。');
        return result;
    }

    async list() {
        const identity = this.context();
        const rows = await this.request(
            `${SHARED_RECIPE_TABLE}?select=recipe_id,recipe,revision,updated_at&order=recipe_id.asc`,
            {}, identity);
        return verifySharedRecipes(rows);
    }

    async publish(recipe, expectedRevision) {
        const identity = this.context();
        const clean = validateRecipe(recipe);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
            throw Error('料理的同步版本無效，尚未上傳。');
        const creating = expectedRevision === 0;
        const path = creating ? SHARED_RECIPE_TABLE
            : `${SHARED_RECIPE_TABLE}?recipe_id=eq.${encodeURIComponent(clean.id)}&revision=eq.${expectedRevision}`;
        const rows = await this.request(path, {
            method:creating ? 'POST' : 'PATCH',
            headers:{Prefer:'return=representation'},
            body:JSON.stringify({
                ...(creating ? {recipe_id:clean.id} : {}),
                recipe:clean,revision:expectedRevision+1,updated_by:identity.userId
            })
        },identity);
        if (rows.length !== 1 || rows[0]?.recipe_id !== clean.id
            || Number(rows[0].revision)!==expectedRevision+1)
            throw Object.assign(Error('料理版本已被更新，本機修改保留，不覆寫其他裝置。'),
                {code:'FK_RECIPE_CONFLICT'});
        return rows[0];
    }
}

export default new SharedRecipeService();
