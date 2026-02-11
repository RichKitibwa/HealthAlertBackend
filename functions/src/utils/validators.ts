/**
 * Validation Utilities
 */

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  // This allows international format with + and numbers
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: any,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of fields) {
    if (!data[field] || data[field].trim() === "") {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate user role
 */
export function isValidUserRole(role: string): boolean {
  const validRoles = ["VHT", "Ambulance Driver", "Clinic Staff", "Admin"];
  return validRoles.includes(role);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

