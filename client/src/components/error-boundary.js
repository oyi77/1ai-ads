/**
 * Error boundary for vanilla JS views.
 * Wraps a render function and catches errors, showing a friendly error UI.
 *
 * Usage:
 *   const safeRender = errorBoundary(renderCampaigns);
 *   safeRender(el, data); // If renderCampaigns throws, shows error UI
 */
export function errorBoundary(renderFn) {
  return function safeRender(el, ...args) {
    try {
      return renderFn(el, ...args);
    } catch (err) {
      console.error('View render error:', err);
      el.innerHTML = `
        <div class="p-8 text-center">
          <div class="text-red-400 text-4xl mb-4">⚠</div>
          <h2 class="text-xl font-bold mb-2">Something went wrong</h2>
          <p class="text-slate-400 mb-4">${escapeHtml(err.message || 'An unexpected error occurred')}</p>
          <button onclick="location.reload()" class="bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm">
            Reload Page
          </button>
        </div>
      `;
    }
  };
}

/**
 * Show a loading spinner.
 */
export function showSpinner(message = 'Loading...') {
  return `
    <div class="flex items-center justify-center p-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mr-3"></div>
      <span class="text-slate-400">${escapeHtml(message)}</span>
    </div>
  `;
}

/**
 * Show an error message with retry button.
 */
export function showError(message, onRetry) {
  const retryId = `retry-${Date.now()}`;
  setTimeout(() => {
    if (onRetry) {
      document.getElementById(retryId)?.addEventListener('click', onRetry);
    }
  }, 0);
  return `
    <div class="p-8 text-center">
      <div class="text-red-400 text-4xl mb-4">⚠</div>
      <h2 class="text-xl font-bold mb-2">Error</h2>
      <p class="text-slate-400 mb-4">${escapeHtml(message)}</p>
      ${onRetry ? `<button id="${retryId}" class="bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm">Try Again</button>` : ''}
    </div>
  `;
}

/**
 * Show an empty state with a call-to-action.
 */
export function showEmpty(title = 'No data found', description = '', ctaText = '', ctaHref = '') {
  return `
    <div class="p-8 text-center text-slate-400">
      <p class="text-lg mb-2">${escapeHtml(title)}</p>
      ${description ? `<p class="text-sm mb-4">${escapeHtml(description)}</p>` : ''}
      ${ctaText && ctaHref ? `<a href="${escapeHtml(ctaHref)}" class="inline-block bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm">${escapeHtml(ctaText)}</a>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
