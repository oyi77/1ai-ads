/**
 * Loading spinner component.
 *
 * Usage:
 *   Spinner()
 *   Spinner('Loading campaigns...')
 */
export function Spinner(message = 'Loading...') {
  return `
    <div class="flex items-center justify-center p-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mr-3"></div>
      <span class="text-slate-400">${escapeHtml(message)}</span>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
