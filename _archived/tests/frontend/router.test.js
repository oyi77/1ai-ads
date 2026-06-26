import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../../client/src/lib/router.js';
import { api } from '../../client/src/lib/api.js';

global.window = {
  location: { hash: '' },
  addEventListener: vi.fn(),
};

vi.mock('../../client/src/lib/api.js', () => ({
  api: {
    isAuthenticated: vi.fn(),
  }
}));

describe('Router', () => {
  let container;
  let router;

  beforeEach(() => {
    container = { innerHTML: '' };
    router = new Router(container);
    window.location.hash = '';
    vi.clearAllMocks();
  });

  it('navigates to login if not authenticated and route is protected', () => {
    api.isAuthenticated.mockReturnValue(false);
    window.location.hash = '#/dashboard';
    
    router.resolve();
    
    expect(window.location.hash).toBe('#/login');
  });

  it('allows access to public routes when not authenticated', async () => {
    api.isAuthenticated.mockReturnValue(false);
    window.location.hash = '#/login';
    const handler = vi.fn();
    router.on('/login', handler);
    
    router.resolve();
    
    expect(window.location.hash).toBe('#/login');
    expect(handler).toHaveBeenCalled();
  });

  it('redirects to root if authenticated and on login page', () => {
    api.isAuthenticated.mockReturnValue(true);
    window.location.hash = '#/login';
    
    router.resolve();
    
    expect(window.location.hash).toBe('#/');
  });

  it('renders loading state then calls handler', async () => {
    api.isAuthenticated.mockReturnValue(true);
    window.location.hash = '#/test';
    const handler = vi.fn().mockResolvedValue();
    router.on('/test', handler);
    
    router.resolve();
    
    expect(container.innerHTML).toContain('Loading...');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(handler).toHaveBeenCalledWith(container);
  });

  it('shows error if handler fails', async () => {
    api.isAuthenticated.mockReturnValue(true);
    window.location.hash = '#/fail';
    router.on('/fail', () => Promise.reject(new Error('Oops')));
    
    router.resolve();
    
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.innerHTML).toContain('Error: Oops');
  });
});