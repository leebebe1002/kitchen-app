/**
 * ☁️ Family Kitchen 2.0 Supabase Service
 * 負責：
 * 1. 食物照片上傳至 Storage (meal-photos)
 * 2. 飲食紀錄 (meal_logs) 雲端資料庫讀取、寫入、刪除
 * 3. 歷史資料須另行確認歸屬，禁止自動搬移
 */

import { SUPABASE_CONFIG } from './SupabaseConfig.js';
import authService from './FamilyAuthService.js';
export { SUPABASE_CONFIG } from './SupabaseConfig.js';

class SupabaseService {
    constructor() {
        this.url = SUPABASE_CONFIG.url;
        this.anonKey = SUPABASE_CONFIG.anonKey;
        this.bucket = SUPABASE_CONFIG.bucket;
    }

    assertIdentity(identity) {
        if (!authService.isCurrentContext(identity)) throw new Error('登入狀態已變更，請重新確認。');
    }

    async mealRequest(path, options, identity) {
        this.assertIdentity(identity);
        const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
            ...options, signal: AbortSignal.timeout(10000),
            headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${identity.token}`,
                'Content-Type': 'application/json', ...options.headers }
        });
        this.assertIdentity(identity);
        if (response.status === 401 || response.status === 403) {
            authService.invalidate('餐點登入或權限失效，請重新登入。本機草稿仍保留。');
            throw new Error('餐點未同步：登入或權限已失效。');
        }
        if (!response.ok) throw new Error(`餐點未同步（${response.status}），本機資料仍保留。`);
        const rows = await response.json();
        this.assertIdentity(identity);
        if (!Array.isArray(rows)) throw new Error('餐點回應格式不正確，未確認同步成功。');
        return rows;
    }

    async getMealAccess() {
        const identity = authService.getPersonalContext();
        if (!identity) throw new Error('請登入並確認餐點權限。');
        const rows = await this.mealRequest(`fk_meal_access?user_id=eq.${encodeURIComponent(identity.userId)}&select=user_id,member,is_manager`, {}, identity);
        const role = rows[0];
        if (rows.length !== 1 || role.user_id !== identity.userId || !['bebe', 'ariel', 'jason'].includes(role.member)
            || typeof role.is_manager !== 'boolean' || (role.is_manager && role.member !== 'bebe')) {
            authService.invalidate('餐點權限無法確認，本機草稿仍保留。');
            throw new Error('此帳號尚未取得餐點權限。');
        }
        return { identity, member: role.member, isManager: role.is_manager };
    }

    requireMealMember(access, member, date) {
        this.assertIdentity(access.identity);
        if (!['bebe', 'ariel', 'jason'].includes(member) || (!access.isManager && member !== access.member)) {
            authService.invalidate('餐點權限已變更，請重新確認登入。');
            throw new Error('此帳號沒有這位家人的餐點權限。');
        }
        if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date)) {
            throw new Error('餐點日期不正確。');
        }
    }

    /**
     * 📷 將 Base64 格式的食物照片上傳至 Supabase Storage
     */
    async uploadMealPhoto(base64Data, member = 'bebe') {
        if (!base64Data) return null;
        try {
            const access = await this.getMealAccess();
            this.requireMealMember(access, member);
            console.log('☁️ [Supabase] 正在上傳食物照片至雲端圖床...');
            
            let mimeType = 'image/jpeg';
            let pureB64 = base64Data;
            if (base64Data.includes(',')) {
                const parts = base64Data.split(',');
                const mimeMatch = parts[0].match(/:(.*?);/);
                if (mimeMatch) mimeType = mimeMatch[1];
                pureB64 = parts[1];
            }

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timeStr = Date.now();
            const ext = mimeType.includes('png') ? 'png' : 'jpg';
            const filename = `meals/${member}_${dateStr}_${timeStr}.${ext}`;

            // 2. Client-side 直傳模式
            const byteCharacters = atob(pureB64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });

            const uploadUrl = `${this.url}/storage/v1/object/${this.bucket}/${filename}`;
            const resp = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${access.identity.token}`,
                    'Content-Type': mimeType
                },
                body: blob
            });

            this.assertIdentity(access.identity);
            if (resp.ok) {
                const publicUrl = `${this.url}/storage/v1/object/public/${this.bucket}/${filename}`;
                console.log('✅ [Supabase] 直傳雲端圖床成功！公開網址:', publicUrl);
                return publicUrl;
            } else {
                const errJson = await resp.json().catch(() => ({}));
                console.warn('⚠️ [Supabase] 直傳失敗:', errJson);
                return null;
            }
        } catch (err) {
            console.error('❌ [Supabase] 上傳照片發生例外:', err);
            return null;
        }
    }

    async getMealsByDate(date, member) {
        const access = await this.getMealAccess();
        this.requireMealMember(access, member, date);
        const rows = await this.mealRequest(`meal_logs?date=eq.${encodeURIComponent(date)}&member=eq.${encodeURIComponent(member)}&order=created_at.asc`, {}, access.identity);
        return rows.map(r => {
            if (r.date !== date || r.member !== member) throw new Error('餐點回應與查詢不符。');
            return {
                id: r.id, dishName: r.dish_name, time: r.time, source: r.source || 'manual',
                portionRatio: r.portion_ratio || '1',
                nutrients: { kcal: Number(r.kcal) || 0, protein: Number(r.protein) || 0,
                    carbs: Number(r.carbs) || 0, fat: Number(r.fat) || 0, sodium: Number(r.sodium) || 0 },
                items: Array.isArray(r.items) ? r.items : [], aiNote: r.ai_note || '', photoUrl: r.photo_url || null
            };
        });
    }

    async saveMeal(date, member, meal) {
        const access = await this.getMealAccess();
        this.requireMealMember(access, member, date);
        if (!meal.id || typeof meal.id !== 'string' || meal.photoUrl?.startsWith('data:')) throw new Error('餐點 ID 或照片格式不正確。');
        const row = {
            id: meal.id, date, member, time: meal.time || '', dish_name: meal.dishName || '未命名餐點',
            source: meal.source || 'manual', portion_ratio: String(meal.portionRatio || '1'),
            kcal: Number(meal.nutrients?.kcal) || 0, protein: Number(meal.nutrients?.protein) || 0,
            carbs: Number(meal.nutrients?.carbs) || 0, fat: Number(meal.nutrients?.fat) || 0, sodium: Number(meal.nutrients?.sodium) || 0,
            items: Array.isArray(meal.items) ? meal.items : (Array.isArray(meal.ingredientsSummary) ? meal.ingredientsSummary : []),
            ai_note: meal.aiNote || '', photo_url: meal.photoUrl || null
        };
        const rows = await this.mealRequest('meal_logs?on_conflict=id', {
            method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row)
        }, access.identity);
        if (rows.length !== 1 || rows[0].id !== meal.id || rows[0].member !== member || rows[0].date !== date) throw new Error('未收到有效餐點寫入確認。');
        return true;
    }

    async deleteMeal(mealId, date, member) {
        const access = await this.getMealAccess();
        this.requireMealMember(access, member, date);
        if (!mealId || !date) throw new Error('請指定餐點 ID、日期及成員。');
        await this.mealRequest(`meal_logs?id=eq.${encodeURIComponent(mealId)}&date=eq.${encodeURIComponent(date)}&member=eq.${encodeURIComponent(member)}`, {
            method: 'DELETE', headers: { Prefer: 'return=representation' }
        }, access.identity);
        // An already absent row is an idempotent delete, never permission to delete another member.
        return true;
    }

    async migrateDailyLogs() {
        throw new Error('舊共用餐點尚未確認歸屬，禁止自動搬移。');
    }
}

export default new SupabaseService();
