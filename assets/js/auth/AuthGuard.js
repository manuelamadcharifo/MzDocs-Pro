// assets/js/auth/AuthGuard.js
// Protege rotas que requerem autenticação ou permissão de admin

import { authManager } from './AuthManager.js';

export class AuthGuard {
    constructor() {
        this._authPromise = null;
    }

    _waitForAuth(timeoutMs = 5000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                if (authManager.user !== undefined) {
                    resolve(authManager.user);
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    resolve(null);
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

    async requireAuth(redirectTo = '/') {
        await this._waitForAuth();
        if (!authManager.isAuthenticated()) {
            sessionStorage.setItem('mz_redirect_after_login', window.location.pathname + window.location.search);
            window.location.href = redirectTo + '?auth=required';
            return false;
        }
        return true;
    }

    async requireAdmin(redirectTo = '/') {
        await this._waitForAuth();
        if (!authManager.isAuthenticated()) {
            sessionStorage.setItem('mz_redirect_after_login', window.location.pathname + window.location.search);
            window.location.href = redirectTo + '?auth=required';
            return false;
        }
        if (!authManager.isAdmin()) {
            window.location.href = redirectTo + '?auth=admin_required';
            return false;
        }
        return true;
    }

    async redirectIfAuthenticated(redirectTo = '/') {
        await this._waitForAuth();
        if (authManager.isAuthenticated()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    applyVisibility() {
        const isAuth = authManager.isAuthenticated();
        const isAdmin = authManager.isAdmin();

        document.querySelectorAll('[data-auth="required"]').forEach(el => {
            el.style.display = isAuth ? '' : 'none';
        });

        document.querySelectorAll('[data-auth="admin"]').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });

        document.querySelectorAll('[data-auth="guest"]').forEach(el => {
            el.style.display = !isAuth ? '' : 'none';
        });
    }
}

export const authGuard = new AuthGuard();