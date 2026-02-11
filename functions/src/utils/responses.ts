/**
 * Response Utilities
 */

/**
 * Success response
 */
export function successResponse(message: string, data?: any) {
  return {
    success: true,
    message,
    ...data,
  };
}

/**
 * Error response
 */
export function errorResponse(message: string, code?: string) {
  return {
    success: false,
    error: code || "unknown",
    message,
  };
}

