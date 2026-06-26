/**
 * Canonical toast notification utility.
 * Uses the global vn (view notification) system if available,
 * falls back to alert() otherwise.
 */
export function showToast(message, type = 'info', duration = 3000) {
  if (typeof window !== 'undefined' && window.vn && typeof window.vn.toast === 'function') {
    window.vn.toast(message, type, duration);
  } else {
    // Fallback: simple alert for environments without vn
    alert(message);
  }
}

export function showSuccess(message) {
  return showToast(message, 'success');
}

export function showError(message) {
  return showToast(message, 'error');
}

export function showWarning(message) {
  return showToast(message, 'warning');
}