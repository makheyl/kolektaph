import { resources } from '@/i18n';
import {
  SUS_ITEMS,
  susAverage,
  susComplete,
  susCsv,
  susScore,
  type SusResponse,
} from '@/features/usability/sus';

const response = (participant: string, answers: number[]): SusResponse => ({
  id: participant,
  participant,
  answers,
  at: 0,
});

describe('System Usability Scale', () => {
  it('scores odd items as (answer − 1) and even items as (5 − answer), times 2.5', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBe(75);
    expect(susScore([5, 2, 4, 1, 4, 2, 5, 1, 4, 3])).toBe(82.5);
  });

  it('needs all ten answers between 1 and 5', () => {
    expect(susComplete([4, 2, 4, 2, 4, 2, 4, 2, 4, null])).toBe(false);
    expect(susComplete([4, 2, 4, 2, 4, 2, 4, 2, 4, 6])).toBe(false);
    expect(() => susScore([4, 2, 4])).toThrow();
  });

  it('averages participants and exports one CSV row each', () => {
    const all = [
      response('P1', [4, 2, 4, 2, 4, 2, 4, 2, 4, 2]),
      response('P2', [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]),
    ];
    expect(susAverage(all)).toBe(87.5);
    expect(susAverage([])).toBeNull();
    expect(susCsv(all).trim().split('\n')).toEqual([
      'participant,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,score',
      '"P1",4,2,4,2,4,2,4,2,4,2,75',
      '"P2",5,1,5,1,5,1,5,1,5,1,100',
    ]);
  });

  it('has all ten statements in Filipino and English', () => {
    for (const lang of ['fil', 'en'] as const) {
      const q = resources[lang].translation.sus.q as Record<string, string>;
      expect(Object.keys(q)).toHaveLength(SUS_ITEMS);
    }
  });
});
