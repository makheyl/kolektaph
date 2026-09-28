import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import en from '@/i18n/locales/en.json';
import fil from '@/i18n/locales/fil.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('has the same keys in Filipino and English', () => {
    expect(keys(en).sort()).toEqual(keys(fil).sort());
  });

  it('has no empty strings', () => {
    const values = (o: object): string[] =>
      Object.values(o).flatMap((v) => (typeof v === 'object' ? values(v) : [v]));
    expect(values(fil).filter((v) => !v.trim())).toEqual([]);
    expect(values(en).filter((v) => !v.trim())).toEqual([]);
  });

  it('labels every truck status in both languages', () => {
    for (const status of Object.keys(TRUCK_STATUS_META)) {
      expect(fil.truck.status).toHaveProperty(status);
      expect(en.truck.status).toHaveProperty(status);
    }
  });
});
