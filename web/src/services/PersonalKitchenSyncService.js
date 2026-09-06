import authService from './FamilyAuthService.js';
import { SUPABASE_CONFIG } from './SupabaseService.js';

class PersonalKitchenSyncService {
    get enabled() {
        return Boolean(authService.getAccessToken());
    }

    headers() {
        const token = authService.getAccessToken();
        return {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async getState(scopeId) {
        if (!this.enabled) return null;
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/fk_personal_kitchen_state?scope_id=eq.${encodeURIComponent(scopeId)}&select=scope_id,pantry_inventory,household_supplies,version,updated_at`;
        const response = await fetch(endpoint, { headers: this.headers() });
        if (response.status === 403 || response.status === 401) {
            throw new Error('此帳號尚未被加入這個家庭資料空間。');
        }
        if (!response.ok) throw new Error('無法讀取個人庫存同步資料。');
        const rows = await response.json();
        const row = rows[0];
        // 資料表固定有 household、ariel 兩列；空結果代表 RLS 未授權，
        // 不能把它誤認成尚未建立而安靜略過同步。
        if (!row) throw new Error('此帳號尚未被加入這個家庭資料空間。');
        return {
            pantryInventory: row.pantry_inventory,
            householdSupplies: row.household_supplies,
            version: row.version,
            updatedAt: row.updated_at
        };
    }

    async saveState(scopeId, state) {
        if (!this.enabled) return false;
        const endpoint = `${SUPABASE_CONFIG.url}/rest/v1/fk_personal_kitchen_state?scope_id=eq.${encodeURIComponent(scopeId)}`;
        const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: { ...this.headers(), Prefer: 'return=representation' },
            body: JSON.stringify({
                pantry_inventory: state.pantryInventory,
                household_supplies: state.householdSupplies,
                version: Number(state.version || 1) + 1
            })
        });
        if (response.status === 403 || response.status === 401) {
            throw new Error('此帳號尚未被加入這個家庭資料空間。');
        }
        if (!response.ok) throw new Error('無法儲存個人庫存同步資料。');
        const rows = await response.json();
        const row = rows[0];
        return row ? {
            pantryInventory: row.pantry_inventory,
            householdSupplies: row.household_supplies,
            version: row.version,
            updatedAt: row.updated_at
        } : true;
    }
}

export default new PersonalKitchenSyncService();
