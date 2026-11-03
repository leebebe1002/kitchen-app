import { SUPABASE_CONFIG } from './SupabaseConfig.js';

const SESSION_KEY = 'family_kitchen_auth_session';

export class FamilyAuthService {
    constructor() {
        this.url = SUPABASE_CONFIG.url;
        this.anonKey = SUPABASE_CONFIG.anonKey;
        this.session = this.readSession();
        this.user = null;
        this.context = null;
        this.generation = 0;
        this.listeners = new Set();
        this.expiryTimer = null;
        this.message = '請登入並連線確認庫存權限。';
    }
    readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (error) { return null; } }
    headers() { return { apikey: this.anonKey, 'Content-Type': 'application/json' }; }
    getAccessToken() { return this.session?.access_token || null; }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    invalidate(message = '請重新確認登入與庫存權限。') {
        this.generation += 1;
        clearTimeout(this.expiryTimer);
        this.context = null;
        this.user = null;
        this.message = message;
        this.listeners.forEach(listener => listener());
    }
    getPersonalContext() {
        if (this.context && (this.context.token !== this.readSession()?.access_token || Date.now() >= this.context.expiresAt)) {
            this.invalidate('登入已失效，請重新登入。');
        }
        return this.context;
    }
    isCurrentContext(context) { return Boolean(context && this.getPersonalContext() === context); }
    async initialize() {
        this.invalidate();
        this.session = this.readSession();
        let token = this.getAccessToken();
        if (!token) return null;
        const generation = this.generation;
        try {
            const savedSession = this.session;
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (Number(payload.exp) * 1000 <= Date.now() && savedSession.refresh_token) {
                const refreshed = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
                    method: 'POST', headers: this.headers(), body: JSON.stringify({ refresh_token: savedSession.refresh_token }), signal: AbortSignal.timeout(10000)
                });
                const body = await refreshed.json();
                if (generation !== this.generation || token !== this.readSession()?.access_token || savedSession.refresh_token !== this.readSession()?.refresh_token) return null;
                if (!refreshed.ok || !body.access_token || !body.refresh_token) throw new Error('登入已失效，請重新登入。');
                this.session = { access_token: body.access_token, refresh_token: body.refresh_token };
                localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
                token = body.access_token;
            }
            const headers = { ...this.headers(), Authorization: `Bearer ${token}` };
            const response = await fetch(`${this.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error('登入已失效。');
            const user = await response.json();
            if (!user?.id) throw new Error('無法確認登入身分。');
            const membership = await fetch(`${this.url}/rest/v1/fk_scope_members?user_id=eq.${encodeURIComponent(user.id)}&select=scope_id,user_id`, { headers, signal: AbortSignal.timeout(10000) });
            if (!membership.ok) throw new Error('無法確認庫存權限，請連線後重試。');
            const rows = await membership.json();
            if (!Array.isArray(rows) || rows.length !== 1 || rows[0].user_id !== user.id || !['household', 'ariel'].includes(rows[0].scope_id)) {
                throw new Error('帳號必須有唯一的庫存權限，請聯絡管理者確認。');
            }
            // JWT expiry only limits local lifetime; identity and permission come from the server above.
            const verifiedPayload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const expiresAt = Number(verifiedPayload.exp) * 1000;
            if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('登入已失效。');
            if (generation !== this.generation || token !== this.readSession()?.access_token) return null;
            this.context = Object.freeze({ userId: user.id, scopeId: rows[0].scope_id, token, expiresAt });
            this.user = user;
            this.message = '';
            this.expiryTimer = setTimeout(() => this.invalidate('登入已失效，請重新登入。'), Math.min(expiresAt - Date.now(), 2147483647));
            this.expiryTimer.unref?.();
            return user;
        } catch (error) {
            if (generation === this.generation) this.invalidate(error.message || '無法確認庫存權限，請連線後重試。');
            return null;
        }
    }
    async requestEmailCode(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('請輸入正確的 Email。');
        const response = await fetch(`${this.url}/auth/v1/otp`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email: normalizedEmail, create_user: true }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.msg || body.message || '暫時無法寄送驗證碼。'); }
    }
    async verifyEmailCode(email, code) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedCode = String(code || '').replace(/\s/g, '');
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('請輸入正確的 Email。');
        if (!/^\d{6,8}$/.test(normalizedCode)) throw new Error('請輸入信中的 8 位數驗證碼。');
        this.invalidate('正在確認登入與庫存權限…');
        const generation = this.generation;
        const response = await fetch(`${this.url}/auth/v1/verify`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email: normalizedEmail, token: normalizedCode, type: 'email' }), signal: AbortSignal.timeout(10000) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.access_token) throw new Error(body.msg || body.message || '驗證碼無效或已過期，請重新取得。');
        if (generation !== this.generation) throw new Error('登入狀態已變更，請重試。');
        this.session = { access_token: body.access_token, refresh_token: body.refresh_token || null };
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
        const user = await this.initialize();
        if (!user) throw new Error(this.message);
        return user;
    }
    async requestMagicLink(email) {
        await this.requestEmailCode(email);
        const code = window.prompt('驗證碼已寄到信箱。請輸入 8 位數驗證碼：');
        if (!code) throw new Error('尚未輸入驗證碼。');
        await this.verifyEmailCode(email, code);
        window.location.reload();
    }
    signOut() {
        const token = this.readSession()?.access_token;
        this.invalidate('已登出。請登入後使用庫存與採買。');
        this.session = null;
        localStorage.removeItem(SESSION_KEY);
        if (!token) return Promise.resolve(true);
        return Promise.resolve().then(() => fetch(`${this.url}/auth/v1/logout?scope=local`, {
            method: 'POST', headers: { ...this.headers(), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
        })).then(response => response.ok).catch(() => false);
    }
}

export default new FamilyAuthService();
