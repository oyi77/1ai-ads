/**
 * Form validation utilities.
 *
 * Usage:
 *   const errors = validateForm(formData, {
 *     name: [required(), minLength(3)],
 *     email: [required(), email()],
 *     budget: [required(), number(), minValue(0)],
 *   });
 *   if (errors) showErrors(errors);
 */

export function required(message = 'This field is required') {
  return (value) => {
    if (value === undefined || value === null || value === '') return message;
    return null;
  };
}

export function email(message = 'Invalid email address') {
  return (value) => {
    if (!value) return null; // Let required() handle empty
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return message;
    return null;
  };
}

export function minLength(min, message = `Must be at least ${min} characters`) {
  return (value) => {
    if (!value) return null;
    if (value.length < min) return message;
    return null;
  };
}

export function maxLength(max, message = `Must be at most ${max} characters`) {
  return (value) => {
    if (!value) return null;
    if (value.length > max) return message;
    return null;
  };
}

export function number(message = 'Must be a number') {
  return (value) => {
    if (!value) return null;
    if (isNaN(value)) return message;
    return null;
  };
}

export function minValue(min, message = `Must be at least ${min}`) {
  return (value) => {
    if (!value) return null;
    if (parseFloat(value) < min) return message;
    return null;
  };
}

export function maxValue(max, message = `Must be at most ${max}`) {
  return (value) => {
    if (!value) return null;
    if (parseFloat(value) > max) return message;
    return null;
  };
}

export function pattern(regex, message = 'Invalid format') {
  return (value) => {
    if (!value) return null;
    if (!regex.test(value)) return message;
    return null;
  };
}

/**
 * Validate form data against a schema.
 * Returns null if valid, or an object { field: errorMessage } if invalid.
 *
 * Usage:
 *   const errors = validateForm(data, {
 *     name: [required(), minLength(3)],
 *     email: [required(), email()],
 *   });
 */
export function validateForm(data, schema) {
  const errors = {};
  let hasErrors = false;

  for (const [field, validators] of Object.entries(schema)) {
    for (const validator of validators) {
      const error = validator(data[field]);
      if (error) {
        errors[field] = error;
        hasErrors = true;
        break; // First error wins
      }
    }
  }

  return hasErrors ? errors : null;
}
