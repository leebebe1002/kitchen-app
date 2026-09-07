import { SUPABASE_CONFIG } from './SupabaseService.js';

const SESSION_KEY = 'family_kitchen_auth_session';

class FamilyAuthService {
    constructor() {
        this.url = SUPABASE_CONFIG.url;
        this.anonKey = SUPABASE_CONFIG.anonKey;
        this.session = this.readSession();
        this.user = null;
    }

    readSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        } catch (error) {
            return null;
        }
    }

    headers() {
        return {
            apikey: this.anonKey,
            'Content-Type': 'application/json'
        };
    }

    getAccessToken() {
        return this.session?.access_token || null;
    }

    async initialize() {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken) {
            this.session = { access_token: accessToken, refresh_token: refreshToken };
            localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }

        if (!this.getAccessToken()) return null;
        try {
            const response = await fetch(`${this.url}/auth/v1/user`, {
                headers: { ...this.headers(), Authorization: `Bearer ${this.getAccessToken()}` }
            });
            if (!response.ok) throw new Error('登入連結已失效，請重新登入。');
            this.user = await response.json();
            return this.user;
        } catch (error) {
            this.signOut();
            return null;
        }
    }

    async requestEmailCode(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            throw new Error('請輸入正確的 Email。');
        }

        const response = await fetch(`${this.url}/auth/v1/otp`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                email: normalizedEmail,
                create_user: true
            })
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.msg || body.message || '暫時無法寄送登入連結。');
        }
    }

    async verifyEmailCode(email, code) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedCode = String(code || '').replace(/\s/g, '');
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            throw new Error('請輸入正確的 Email。');
        }
        if (!/^\d{6,8}$/.test(normalizedCode)) {
            throw new Error('請輸入信中的 8 位數驗證碼。');
        }

        const response = await fetch(`${this.url}/auth/v1/verify`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                email: normalizedEmail,
                token: normalizedCode,
                type: 'email'
            })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.access_token) {
            throw new Error(body.msg || body.message || '驗證碼無效或已過期，請重新取得。');
        }

        this.session = {
            access_token: body.access_token,
            refresh_token: body.refresh_token || null
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
        this.user = body.user || null;
        return this.user;
    }

    signOut() {
        this.session = null;
        this.user = null;
        localStorage.removeItem(SESSION_KEY);
    }
}

export default new FamilyAuthService();
