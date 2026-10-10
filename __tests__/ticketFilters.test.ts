import { matchesSearch, statusGroup } from '@/features/reports/filters';
import type { TicketStatus } from '@/services/types';

describe('"Aking mga report" filters', () => {
  it('groups every status under one of the three filters, or under "Lahat" only', () => {
    const groups: Record<TicketStatus, string> = {
      submitted: 'review',
      verified: 'review',
      scheduled: 'scheduled',
      in_progress: 'scheduled',
      collected: 'done',
      closed: 'done',
      merged: 'other',
      rejected: 'other',
    };
    for (const [status, group] of Object.entries(groups)) {
      expect(statusGroup(status as TicketStatus)).toBe(group);
    }
  });

  const ticket = {
    id: 'KPH-2026-000113',
    landmark: 'Tapat ng Dela Peña Store',
    category: 'DUMPING' as const,
  };
  const place = { barangayName: 'Milagrosa', categoryName: 'Tambak sa bakanteng lote' };
  const finds = (query: string) => matchesSearch(ticket, query, place);

  it('finds a report by its number, with or without the dashes', () => {
    expect(finds('KPH-2026-000113')).toBe(true);
    expect(finds('000113')).toBe(true);
    expect(finds('113')).toBe(true);
    expect(finds('2026000113')).toBe(true);
    expect(finds('999')).toBe(false);
  });

  it('finds a report by its barangay, landmark or kind, whatever the capitals or accents', () => {
    expect(finds('milagrosa')).toBe(true);
    expect(finds('dela pena')).toBe(true);
    expect(finds('TAMBAK')).toBe(true);
    expect(finds('lantic')).toBe(false);
  });

  it('needs every typed word to match, and matches everything when nothing is typed', () => {
    expect(finds('milagrosa 113')).toBe(true);
    expect(finds('milagrosa 999')).toBe(false);
    expect(finds('   ')).toBe(true);
  });
});
