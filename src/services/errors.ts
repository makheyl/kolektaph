/** The server could not be reached (no signal, airplane mode). Safe to retry later. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

export class SignInError extends Error {
  constructor(public reason: 'wrong_pin' | 'unknown_truck') {
    super(reason);
    this.name = 'SignInError';
  }
}
