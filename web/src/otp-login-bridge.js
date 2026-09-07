import authService from './services/FamilyAuthService.js?v=20260907_FAMILY_AUTH_REDIRECT_V2';

const EMAIL = 'family-login-email';

function renderCodeStep(modal, email) {
    const copy = modal.querySelector('.account-copy');
    const sendButton = modal.querySelector('.account-login-button');
    if (!copy || !sendButton || modal.querySelector('#family-login-code')) return;
    copy.textContent = '驗證碼已寄出。請輸入信中的 8 位數字；不需要點開信件連結。';
    sendButton.hidden = true;
    const label = document.createElement('label');
    label.className = 'account-email-label'; label.htmlFor = 'family-login-code'; label.textContent = '8 位數驗證碼';
    const input = document.createElement('input');
    input.id = 'family-login-code'; input.className = 'account-email-input'; input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code'; input.maxLength = 8; input.placeholder = '輸入驗證碼';
    const verify = document.createElement('button');
    verify.type = 'button'; verify.className = 'action-sheet-row account-login-button'; verify.textContent = '確認並開始同步';
    verify.addEventListener('click', async () => {
        verify.disabled = true; verify.textContent = '驗證中…';
        try { await authService.verifyEmailCode(email, input.value); window.location.reload(); }
        catch (error) {
            verify.disabled = false; verify.textContent = '確認並開始同步';
            const message = modal.querySelector('.account-message') || document.createElement('p');
            message.className = 'account-message'; message.textContent = error.message || '驗證碼無效或已過期，請重新取得。';
            if (!message.parentElement) verify.after(message);
        }
    });
    sendButton.after(label, input, verify); input.focus();
}

document.addEventListener('click', async (event) => {
    const sendButton = event.target.closest('.account-login-button');
    if (!sendButton || sendButton.hidden || document.querySelector('#family-login-code')) return;
    const emailInput = document.getElementById(EMAIL); const modal = sendButton.closest('.action-sheet');
    if (!emailInput || !modal) return;
    event.preventDefault(); event.stopImmediatePropagation(); sendButton.disabled = true;
    try { await authService.requestEmailCode(emailInput.value); renderCodeStep(modal, emailInput.value); }
    catch (error) {
        const message = modal.querySelector('.account-message') || document.createElement('p');
        message.className = 'account-message'; message.textContent = error.message || '暫時無法寄送驗證碼。';
        if (!message.parentElement) sendButton.after(message);
    } finally { sendButton.disabled = false; }
}, true);
