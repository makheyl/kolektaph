/** The server could not be reached (no signal, airplane mode). Safe to retry later. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

export type SignInReason = 'wrong_pin' | 'unknown_truck' | 'locked' | 'expired';

/**
 * A truck sign-in that did not work: a wrong PIN or truck, a truck locked after wrong PINs, or
 * (during uploads) a sign-in that has ended and needs the PIN again.
 */
export class SignInError extends Error {
  constructor(
    public reason: SignInReason,
    public info: { attemptsLeft?: number; lockedUntil?: number } = {},
  ) {
    super(reason);
    this.name = 'SignInError';
  }
}

/**
 * The server answered, and refused: `code` is its short reason (for example `rate_limited`,
 * `outside_city`, `not_allowed`, `invalid_transition`). Retrying the same request will not help.
 */
export class ServerError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail: string | null = null,
  ) {
    super(code);
    this.name = 'ServerError';
  }
}
