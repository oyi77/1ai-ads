/**
 * Toast notification component.
 *
 * Usage:
 *   showToast('Saved successfully', 'success')
 *   showToast('Error occurred', 'error')
 */
let toastContainer = null;

function getContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
  const variants = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-sky-600',
  };
  const toast = document.createElement('div');
  toast.className = `${variants[type] || variants.info} text-white px-4 py-3 rounded-lg shadow-lg text-sm transition-opacity`;
  toast.textContent = message;
  getContainer().appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
