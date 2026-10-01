/**
 * System Usability Scale (Brooke, 1996): ten statements rated 1 (strongly disagree) to 5
 * (strongly agree). Odd statements are positive, even ones negative. The score is 0–100; 68 is
 * the usual average, and KolektaPH's target is 70 or higher (plan §9, Sprint S7).
 */
export const SUS_ITEMS = 10;
export const SUS_TARGET = 70;

export type SusAnswers = number[];

export interface SusResponse {
  id: string;
  /** A code such as "P3": never a name (data minimisation, RA 10173). */
  participant: string;
  answers: SusAnswers;
  at: number;
}

export const susComplete = (answers: (number | null)[]): answers is SusAnswers =>
  answers.length === SUS_ITEMS && answers.every((a) => a != null && a >= 1 && a <= 5);

/** 0–100. Odd items contribute (answer − 1), even items (5 − answer); the sum is × 2.5. */
export function susScore(answers: SusAnswers): number {
  if (!susComplete(answers)) throw new Error('SUS needs ten answers from 1 to 5');
  const sum = answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

export function susAverage(responses: SusResponse[]): number | null {
  if (!responses.length) return null;
  const total = responses.reduce((s, r) => s + susScore(r.answers), 0);
  return Math.round((total / responses.length) * 10) / 10;
}

/** One row per participant, for a spreadsheet. */
export function susCsv(responses: SusResponse[]): string {
  const header = [
    'participant',
    ...Array.from({ length: SUS_ITEMS }, (_, i) => `q${i + 1}`),
    'score',
  ];
  const rows = responses.map((r) => [
    `"${r.participant.replace(/"/g, '""')}"`,
    ...r.answers,
    susScore(r.answers),
  ]);
  return [header, ...rows].map((row) => row.join(',')).join('\n') + '\n';
}
