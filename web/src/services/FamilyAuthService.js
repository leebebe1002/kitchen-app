import { SUPABASE_CONFIG } from './SupabaseService.js';

const SESSION_KEY = 'family_kitchen_auth_session';
const FK_PUBLIC_URL = 'https://leebebe1002.github.io/kitchen-app/web/index.html';

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

    getRedirectUrl() {
        // Magic Link 必須固定回到 FK 的正式入口，避免 PWA 或 GitHub Pages 根目錄
        // 造成登入後落在沒有網站內容的網址。
        if (window.location.hostname !== 'localhost') return FK_PUBLIC_URL;
        return window.location.origin + window.location.pathname;
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

    async requestMagicLink(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            throw new Error('請輸入正確的 Email。');
        }

        const response = await fetch(`${this.url}/auth/v1/otp`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                email: normalizedEmail,
                create_user: true,
                email_redirect_to: this.getRedirectUrl()
            })
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.msg || body.message || '暫時無法寄送登入連結。');
        }
    }

    signOut() {
        this.session = null;
        this.user = null;
        localStorage.removeItem(SESSION_KEY);
    }
}

export default new FamilyAuthService();
