/**
 * Reusable button component.
 *
 * Usage:
 *   Button({ label: 'Save', variant: 'primary', onClick: () => save() })
 *   Button({ label: 'Delete', variant: 'danger', size: 'sm' })
 */
export function Button({ label, variant = 'primary', size = 'md', disabled = false, onClick, id, className = '' }) {
  const variants = {
    primary: 'bg-sky-500 hover:bg-sky-600 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    ghost: 'bg-transparent hover:bg-slate-700 text-slate-300',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  const btn = document.createElement('button');
  btn.className = `rounded-lg font-medium transition-colors ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`;
  btn.textContent = label;
  btn.disabled = disabled;
  if (id) btn.id = id;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
