import { api } from '../lib/api.js';

export function renderLogin(el) {
  el.innerHTML = `
    <div class="min-h-[80vh] flex items-center justify-center px-4">
      <div class="bg-slate-800 p-8 rounded-lg border border-slate-700 w-full max-w-sm">
        <h1 class="text-2xl font-bold mb-6 text-center">Login to AdForge</h1>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Username or Email</label>
            <input type="text" name="username" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required autofocus>
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Password</label>
            <input type="password" name="password" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required>
          </div>
          <button type="submit" class="w-full bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg font-medium min-h-[44px]">Login</button>
          <div id="login-error" class="hidden text-red-400 text-sm text-center"></div>
        </form>
        <p class="text-slate-500 text-sm text-center mt-4">
          No account? <a href="#/register" class="text-sky-400 hover:underline">Register</a>
        </p>
        <p class="text-slate-600 text-xs text-center mt-2">Default: admin / admin123</p>
      </div>
    </div>
  `;

  el.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = el.querySelector('#login-error');
    errorDiv.classList.add('hidden');
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    const fd = new FormData(e.target);
    try {
      await api.login(fd.get('username'), fd.get('password'));
      window.location.hash = '#/';
      window.dispatchEvent(new Event('auth-change'));
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });
}

export function renderRegister(el) {
  el.innerHTML = `
    <div class="min-h-[80vh] flex items-center justify-center px-4">
      <div class="bg-slate-800 p-8 rounded-lg border border-slate-700 w-full max-w-sm">
        <h1 class="text-2xl font-bold mb-6 text-center">Create Account</h1>
        <form id="register-form" class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Username</label>
            <input type="text" name="username" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required autofocus>
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">Password (min 6 chars)</label>
            <input type="password" name="password" class="w-full p-3 bg-slate-900 rounded-lg border border-slate-600 min-h-[44px]" required minlength="6">
          </div>
          <button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-600 px-4 py-3 rounded-lg font-medium min-h-[44px]">Register</button>
          <div id="register-error" class="hidden text-red-400 text-sm text-center"></div>
        </form>
        <p class="text-slate-500 text-sm text-center mt-4">
          Have an account? <a href="#/login" class="text-sky-400 hover:underline">Login</a>
        </p>
      </div>
    </div>
  `;

    el.querySelector('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = el.querySelector('#register-error');
    errorDiv.classList.add('hidden');
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const fd = new FormData(e.target);
    try {
      await api.register(fd.get('username'), fd.get('password'), fd.get('email'));
      window.location.hash = '#/';
      window.dispatchEvent(new Event('auth-change'));
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Register';
    }
  });
}
