/**
 * Modal component.
 *
 * Usage:
 *   const modal = Modal({ title: 'Confirm', content: '<p>Are you sure?</p>', onClose: () => {} });
 *   document.body.appendChild(modal);
 *   // Later: modal.remove()
 */
export function Modal({ title, content, onClose, onConfirm, confirmText = 'Confirm', cancelText = 'Cancel' }) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">${escapeHtml(title)}</h3>
        <button class="modal-close text-slate-400 hover:text-white text-xl">&times;</button>
      </div>
      <div class="modal-content mb-6">${content}</div>
      <div class="flex justify-end gap-3">
        <button class="modal-cancel px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">${escapeHtml(cancelText)}</button>
        ${onConfirm ? `<button class="modal-confirm px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-sm">${escapeHtml(confirmText)}</button>` : ''}
      </div>
    </div>
  `;

  const close = () => { overlay.remove(); onClose?.(); };
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('.modal-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-confirm')?.addEventListener('click', () => { onConfirm?.(); close(); });

  return overlay;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
