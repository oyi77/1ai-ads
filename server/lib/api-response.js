/**
 * Standardized API response helpers.
 * Use these across all route handlers for consistent response formats.
 */

export function success(data = null) {
  return { success: true, data };
}

export function error(message, status = 400) {
  return { success: false, error: message, status };
}

export function paginated(data, page, total, perPage = 20) {
  return {
    success: true,
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
}