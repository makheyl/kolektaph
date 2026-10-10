/** The shortest password an account accepts. */
export const MIN_PASSWORD = 8;

/** A one-time code is six digits, typed with or without spaces. */
export const cleanCode = (typed: string) => typed.replace(/\D+/g, '').slice(0, 6);
