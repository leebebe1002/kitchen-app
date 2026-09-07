import { SUPABASE_CONFIG } from './SupabaseService.js';

const SESSION_KEY = 'family_kitchen_auth_session';

class FamilyAuthService {
    constructor() { this.url = SUPABASE_CONFIG.url; this.anonKey = SUPABASE_CONFIG.anonKey; this.session = this.readSession(); this.user = null; }
    readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (error) { return null; } }
    headers() { return { apikey: this.anonKey, 'Content-Type': 'application/json' }; }
    getAccessToken() { return this.session?.access_token || null; }
    async initialize() {
        if (!this.getAccessToken()) return null;
        try {
            const response = await fetch(`${this.url}/auth/v1/user`, { headers: { ...this.headers(), Authorization: `Bearer ${this.getAccessToken()}` } });
            if (!response.ok) throw new Error('登入已失效。');
            this.user = await response.json(); return this.user;
        } catch (error) { this.signOut(); return null; }
    }
    async requestEmailCode(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('請輸入正確的 Email。');
        const response = await fetch(`${this.url}/auth/v1/otp`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email: normalizedEmail, create_user: true }) });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.msg || body.message || '暫時無法寄送驗證碼。'); }
    }
    async verifyEmailCode(email, code) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedCode = String(code || '').replace(/\s/g, '');
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('請輸入正確的 Email。');
        if (!/^\d{6,8}$/.test(normalizedCode)) throw new Error('請輸入信中的 8 位數驗證碼。');
        const response = await fetch(`${this.url}/auth/v1/verify`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email: normalizedEmail, token: normalizedCode, type: 'email' }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.access_token) throw new Error(body.msg || body.message || '驗證碼無效或已過期，請重新取得。');
        this.session = { access_token: body.access_token, refresh_token: body.refresh_token || null };
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); this.user = body.user || null; return this.user;
    }
    async requestMagicLink(email) {
        await this.requestEmailCode(email);
        const code = window.prompt('驗證碼已寄到信箱。請輸入 8 位數驗證碼：');
        if (!code) throw new Error('尚未輸入驗證碼。');
        await this.verifyEmailCode(email, code);
        window.location.reload();
    }
    signOut() { this.session = null; this.user = null; localStorage.removeItem(SESSION_KEY); }
}

export default new FamilyAuthService();
