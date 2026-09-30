/**
 * Waste segregation classes of RA 9003 (Ecological Solid Waste Management Act of 2000):
 * biodegradable, recyclable, residual and special (household hazardous) waste. National rules;
 * Kolek adds "sundin din ang patakaran ng barangay" because barangays may add their own.
 */

export type SortClass = 'biodegradable' | 'recyclable' | 'residual' | 'special';

export const SORT_CLASSES: SortClass[] = ['biodegradable', 'recyclable', 'residual', 'special'];

/** Shown as the source of every segregation answer. */
export const SEGREGATION_LAW = 'RA 9003';

/** Common household items (Filipino and English words) and their class. */
const ITEMS: Record<SortClass, string[]> = {
  biodegradable: [
    'balat',
    'saging',
    'prutas',
    'gulay',
    'tira',
    'tirang',
    'pagkain',
    'food',
    'leftovers',
    'dahon',
    'leaves',
    'damo',
    'grass',
    'kape',
    'itlog',
    'buto',
    'kanin',
    'isda',
  ],
  recyclable: [
    'bote',
    'bottle',
    'bottles',
    'lata',
    'cans',
    'karton',
    'carton',
    'cardboard',
    'papel',
    'paper',
    'dyaryo',
    'newspaper',
    'magazine',
    'bakal',
    'metal',
    'aluminum',
    'galon',
    'plastik',
    'plastic',
  ],
  residual: [
    'diaper',
    'lampin',
    'napkin',
    'sanitary',
    'tissue',
    'sachet',
    'wrapper',
    'styro',
    'styrofoam',
    'upos',
    'sigarilyo',
    'cigarette',
    'supot',
    'sando',
  ],
  special: [
    'baterya',
    'battery',
    'batteries',
    'bumbilya',
    'bulb',
    'fluorescent',
    'gamot',
    'medicine',
    'pintura',
    'paint',
    'cellphone',
    'gadget',
    'electronics',
    'spray',
    'thermometer',
    'syringe',
    'karayom',
    'needle',
  ],
};

export interface SortItem {
  /** The word as found in the (normalised) question. */
  word: string;
  sortClass: SortClass;
}

/** The first household item named in a normalised question. */
export function sortItemIn(normalized: string): SortItem | null {
  const words = normalized.split(' ');
  for (const word of words) {
    const sortClass = SORT_CLASSES.find((c) => ITEMS[c].includes(word));
    if (sortClass) return { word, sortClass };
  }
  return null;
}
