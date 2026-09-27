/** 0–4: length ≥ 8, upper + lower case, a digit, a symbol or 12+ characters. */
export function passwordStrength(pw: string) {
  if (!pw) return 0
  return [pw.length >= 8, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw) || pw.length >= 12].filter(Boolean).length
}

export const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
