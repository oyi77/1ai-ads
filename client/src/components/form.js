/**
 * Form builder component.
 *
 * Usage:
 *   const form = Form({
 *     fields: [
 *       { name: 'name', label: 'Campaign Name', type: 'text', required: true },
 *       { name: 'budget', label: 'Budget', type: 'number', min: 0 },
 *       { name: 'status', label: 'Status', type: 'select', options: ['active', 'paused'] },
 *     ],
 *     values: { name: 'My Campaign' },
 *     onSubmit: (data) => createCampaign(data),
 *   });
 *   el.appendChild(form);
 */
export function Form({ fields, values = {}, onSubmit, submitLabel = 'Submit' }) {
  const form = document.createElement('form');
  form.className = 'space-y-4';

  for (const field of fields) {
    const wrapper = document.createElement('div');
    const value = values[field.name] ?? '';

    const label = document.createElement('label');
    label.className = 'block text-sm font-medium mb-1';
    label.textContent = field.label || field.name;
    if (field.required) label.textContent += ' *';
    wrapper.appendChild(label);

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      input.className = 'w-full p-3 bg-slate-800 rounded-lg border border-slate-700';
      for (const opt of field.options || []) {
        const option = document.createElement('option');
        option.value = typeof opt === 'object' ? opt.value : opt;
        option.textContent = typeof opt === 'object' ? opt.label : opt;
        if (option.value === value) option.selected = true;
        input.appendChild(option);
      }
    } else if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'w-full p-3 bg-slate-800 rounded-lg border border-slate-700';
      input.rows = field.rows || 3;
      input.value = value;
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.className = 'w-full p-3 bg-slate-800 rounded-lg border border-slate-700';
      input.value = value;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.placeholder) input.placeholder = field.placeholder;
    }

    input.name = field.name;
    if (field.required) input.required = true;
    wrapper.appendChild(input);

    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-400 text-xs mt-1 hidden';
    errorDiv.id = `error-${field.name}`;
    wrapper.appendChild(errorDiv);

    form.appendChild(wrapper);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'bg-sky-500 hover:bg-sky-600 px-4 py-2 rounded-lg text-sm font-medium';
  submitBtn.textContent = submitLabel;
  form.appendChild(submitBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {};
    let valid = true;

    for (const field of fields) {
      const input = form.querySelector(`[name="${field.name}"]`);
      const errorDiv = form.querySelector(`#error-${field.name}`);
      const value = input.value.trim();

      if (field.required && !value) {
        errorDiv.textContent = `${field.label || field.name} is required`;
        errorDiv.classList.remove('hidden');
        valid = false;
      } else if (field.type === 'number' && value && isNaN(value)) {
        errorDiv.textContent = `${field.label || field.name} must be a number`;
        errorDiv.classList.remove('hidden');
        valid = false;
      } else {
        errorDiv.classList.add('hidden');
        data[field.name] = field.type === 'number' ? parseFloat(value) : value;
      }
    }

    if (valid && onSubmit) onSubmit(data);
  });

  return form;
}
