import { api } from './api.js';

const PUBLIC_ROUTES = new Set(['/', '/login', '/register', '/welcome', '/docs']);

export class Router {
  constructor(container) {
    this.container = container;
    this.routes = {};
    this._onHashChange = () => this.resolve();
  }

  on(path, handler) {
    this.routes[path] = handler;
  }

  navigate(path) {
    window.location.hash = '#' + path;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/';

    // Auth guard: redirect to login if not authenticated and not on public route
    if (!api.isAuthenticated() && !PUBLIC_ROUTES.has(hash)) {
      window.location.hash = '#/login';
      return;
    }

    // If authenticated and on login/welcome, redirect to dashboard
    if (api.isAuthenticated() && (hash === '/login' || hash === '/welcome')) {
      window.location.hash = '#/';
      return;
    }

    const handler = this.routes[hash] || this.routes['/'];
    if (handler) {
      this.container.innerHTML = '<div class="p-8 text-slate-400">Loading...</div>';
      Promise.resolve(handler(this.container)).catch(err => {
        this.container.innerHTML = `<div class="p-8 text-red-400">Error: ${err.message}</div>`;
      });
    }
  }

  start() {
    window.addEventListener('hashchange', this._onHashChange);
    this.resolve();
  }
}
