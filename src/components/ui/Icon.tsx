import createIconSet from '@expo/vector-icons/createIconSet';

// MaterialCommunityIcons cut down to the icons the app uses (scripts/fonts/subset-fonts.mjs):
// 27 KB instead of 1.3 MB. Using a new icon? Run `npm run fonts`, or TypeScript rejects the name.
import glyphMap from './iconGlyphs.json';

const KphIcons = createIconSet(
  glyphMap,
  'kph-icons',
  require('../../../assets/fonts/kph-icons.ttf'),
);

export type IconName = keyof typeof glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

/** Decorative icon: always paired with a text label, so hidden from screen readers. */
export function Icon({ name, size = 24, color }: IconProps) {
  return <KphIcons name={name} size={size} color={color} aria-hidden />;
}
