/**
 * Status badge component.
 *
 * Usage:
 *   Badge('active')  // green badge
 *   Badge('paused')  // yellow badge
 *   Badge('error')   // red badge
 */
export function Badge(text, variant) {
  const variants = {
    active: 'bg-green-500/20 text-green-400',
    completed: 'bg-green-500/20 text-green-400',
    success: 'bg-green-500/20 text-green-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    error: 'bg-red-500/20 text-red-400',
    failed: 'bg-red-500/20 text-red-400',
    draft: 'bg-slate-500/20 text-slate-400',
    inactive: 'bg-slate-500/20 text-slate-400',
  };
  const cls = variants[variant] || variants[String(text).toLowerCase()] || 'bg-slate-600 text-slate-300';
  return `<span class="px-2 py-1 rounded text-xs ${cls}">${escapeHtml(String(text))}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
