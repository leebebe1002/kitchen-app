import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseService.js?v=20261102_FK22_MEALS_V1';

class PersonalKitchenSyncService {
    get enabled() {
        return Boolean(authService.getPersonalContext());
    }

    contextFor(scopeId) {
        const context = authService.getPersonalContext();
        if (context && context.scopeId !== scopeId) throw new Error('此帳號沒有這個庫存權限。');
        return context;
    }

    checkResponse(response, context) {
        if (!authService.isCurrentContext(context)) throw new Error('登入狀態已變更。');
        if (response.status === 403 || response.status === 401) {
            authService.invalidate('登入或庫存權限已失效，請重新確認。');
            throw new Error('此帳號尚未被加入這個家庭資料空間。');
        }
    }

    async request(endpoint, options, context) {
        try {
            const response = await fetch(endpoint, { ...options, signal: AbortSignal.timeout(10000) });
            this.checkResponse(response, context);
            if (response.status === 409) throw Object.assign(new Error('庫存版本衝突，資料已保留，請重新讀取後確認。'), { code: 'FK_SYNC_CONFLICT' });
            if (!response.ok) throw new Error('無法完成庫存同步。');
            const rows = await response.json();
            if (!Array.isArray(rows)) throw new Error('庫存同步資料格式不正確。');
            this.checkResponse(response, context);
            return rows;
        } catch (error) {
            if (error.code !== 'FK_SYNC_CONFLICT' && authService.isCurrentContext(context)) authService.invalidate('無法確認連線或庫存權限，本機資料仍保留。請連線後重試。');
            throw error;
        }
    }

    headers(context) {
        return {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${context.token}`,
            'Content-Type': 'application/json'
        };
    }

    async getState(scopeId) {
        const context = this.contextFor(scopeId);
        if (!context) return null;
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/fk_personal_kitchen_state?scope_id=eq.${encodeURIComponent(scopeId)}&select=scope_id,pantry_inventory,household_supplies,version,updated_at,sync_revision,sync_status`;
        const rows = await this.request(endpoint, { headers: this.headers(context) }, context);
        if (!authService.isCurrentContext(context)) throw new Error('登入狀態已變更。');
        const row = rows[0];
        // 資料表固定有 household、ariel 兩列；空結果代表 RLS 未授權，
        // 不能把它誤認成尚未建立而安靜略過同步。
        if (rows.length !== 1 || !row || row.scope_id !== scopeId) {
            authService.invalidate('庫存權限無法確認，請聯絡管理者。');
            throw new Error('此帳號尚未被加入這個家庭資料空間。');
        }
        return this.stateFromRow(row);
    }

    stateFromRow(row) {
        if (!Number.isSafeInteger(row.sync_revision) || row.sync_revision < 0
            || !['legacy', 'initial', 'active', 'cleared'].includes(row.sync_status)) {
            throw new Error('庫存後端尚未升級，已停止同步並保留本機資料。');
        }
        return {
            pantryInventory: row.pantry_inventory,
            householdSupplies: row.household_supplies,
            version: row.version,
            updatedAt: row.updated_at,
            revision: row.sync_revision,
            syncStatus: row.sync_status,
            dirty: false
        };
    }

    async saveState(scopeId, state) {
        const context = this.contextFor(scopeId);
        if (!context) return false;
        if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
            throw new Error('尚未確認庫存版本，禁止直接寫入。');
        }
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/fk_personal_kitchen_state?scope_id=eq.${encodeURIComponent(scopeId)}&sync_revision=eq.${state.revision}`;
        const rows = await this.request(endpoint, {
            method: 'PATCH',
            headers: { ...this.headers(context), Prefer: 'return=representation',
                'x-fk-sync-protocol': '2', 'x-fk-expected-revision': String(state.revision) },
            body: JSON.stringify({
                pantry_inventory: state.pantryInventory,
                household_supplies: state.householdSupplies
            })
        }, context);
        if (!authService.isCurrentContext(context)) throw new Error('登入狀態已變更。');
        if (rows.length === 0) {
            // Reread distinguishes a version conflict from membership revoked during PATCH.
            await this.getState(scopeId);
            if (!authService.isCurrentContext(context)) throw new Error('登入狀態已變更。');
            throw Object.assign(new Error('庫存版本衝突，本機與遠端資料均已保留。'), { code: 'FK_SYNC_CONFLICT' });
        }
        const row = rows[0];
        if (rows.length !== 1 || !row || row.scope_id !== scopeId) {
            authService.invalidate('庫存寫入權限無法確認，請聯絡管理者。');
            throw new Error('庫存未同步，請確認帳號權限。');
        }
        return this.stateFromRow(row);
    }
}

export default new PersonalKitchenSyncService();
