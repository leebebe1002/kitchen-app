import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseService.js?v=20260929_SUPABASE_KEY_V1';

const TABLE = 'fk_shared_ingredient_nutrition';
const ERROR = '共用營養沒有同步成功，原本資料仍保留。請連線後重試。';

class SharedIngredientNutritionService {
    context() {
        const context = authService.getPersonalContext();
        if (!context) throw Error('請先登入才能使用共用營養資料。');
        return context;
    }

    async request(path, options = {}, identity) {
        if (!authService.isCurrentContext(identity)) throw Error('登入身分已變更，原資料保留。');
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
            ...options, signal: AbortSignal.timeout(10000),
            headers: {
                apikey: SUPABASE_CONFIG.anonKey,
                Authorization: `Bearer ${identity.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!authService.isCurrentContext(identity)) throw Error('登入身分已變更，原資料保留。');
        if (res.status === 409 || res.status === 412)
            throw Object.assign(Error('這項食材已有更新的營養版本，請刷新 FK 後再核對。'), { code:'FK_SHARED_CONFLICT' });
        if (!res.ok) throw Error(ERROR);
        const rows = await res.json();
        if (!authService.isCurrentContext(identity) || !Array.isArray(rows)) throw Error(ERROR);
        return rows;
    }

    async list() {
        const identity = this.context();
        return this.request(`${TABLE}?select=ingredient_id,identity,nutrition,evidence,revision`, {}, identity);
    }

    async publish(payload, expectedRevision) {
        const identity = this.context();
        const revision = Number(expectedRevision || 0);
        const insert = revision === 0;
        const path = insert ? TABLE : `${TABLE}?ingredient_id=eq.${encodeURIComponent(payload.ingredient_id)}&revision=eq.${revision}`;
        const row = { ...payload, revision: revision + 1, updated_by: identity.userId,
            updated_at: new Date().toISOString() };
        const rows = await this.request(path, {
            method: insert ? 'POST' : 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(row)
        }, identity);
        if (rows.length !== 1 || rows[0].ingredient_id !== payload.ingredient_id
            || Number(rows[0].revision) !== revision + 1)
            throw Object.assign(Error('其他裝置可能已經修改這項營養，請刷新後重新核對。'), { code: 'FK_SHARED_CONFLICT' });
        return rows[0];
    }
}
export default new SharedIngredientNutritionService();
