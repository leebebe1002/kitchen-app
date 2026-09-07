import { SUPABASE_CONFIG } from './services/SupabaseService.js';

function login() {
  const redirectTo = window.location.origin + window.location.pathname;
  const url = new URL(SUPABASE_CONFIG.url + '/auth/v1/authorize');
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', redirectTo);
  window.location.assign(url);
}

function updateSheet() {
  const sheet = document.querySelector('.account-sheet');
  if (!sheet || sheet.querySelector('.account-google-button')) return;
  const button = sheet.querySelector('.account-login-button');
  if (!button) return;
  const copy = sheet.querySelector('.account-copy');
  const email = sheet.querySelector('#family-login-email');
  const label = sheet.querySelector('label[for="family-login-email"]');
  if (copy) copy.textContent = '第一次請使用自己的 Google 帳戶登入；完成後，這台裝置會保持登入並自動同步。';
  if (email) email.hidden = true;
  if (label) label.hidden = true;
  button.classList.add('account-google-button');
  button.textContent = '使用 Google 登入';
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.account-google-button')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  login();
}, true);
new MutationObserver(updateSheet).observe(document.body, { childList: true, subtree: true });
updateSheet();
