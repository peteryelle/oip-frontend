/**
 * Password validation per requirements:
 *   - 8+ characters
 *   - At least one letter
 *   - At least one digit
 *   - At least one special character
 *
 * Returns { valid: bool, errors: string[] }
 */
export function validatePassword(pw) {
  const errors = []
  if (!pw || pw.length < 8) errors.push('At least 8 characters')
  if (!/[A-Za-z]/.test(pw)) errors.push('At least one letter')
  if (!/[0-9]/.test(pw)) errors.push('At least one digit')
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pw)) {
    errors.push('At least one special character (e.g. ! @ # $ % &)')
  }
  return { valid: errors.length === 0, errors }
}
