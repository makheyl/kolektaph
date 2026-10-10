import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { BarangayCollection, CityMeta, LngLat } from '@/services/types';
import { colors, radius } from '@/theme/tokens';

interface MiniMapProps {
  barangays: BarangayCollection;
  meta: CityMeta;
  /** The resident's barangay, drawn in the brand green; the picture closes in on it. */
  highlightId: string | null;
  /** Where the barangay's truck is now (its dot), if it is out. */
  truck?: LngLat | null;
  truckColor?: string;
  height?: number;
  /** How much of the bottom is covered by the card laid over it: the view keeps clear of it. */
  coveredBottom?: number;
}

/** The picture's own units: the whole city is this wide. */
const CITY_WIDTH = 1000;
/** Width : height of the part of the city shown (the frame crops whatever does not fit). */
const VIEW_ASPECT = 1.8;
/** The resident's barangay takes about this share of the view; the rest is its neighbours. */
const FOCUS_SHARE = 0.45;

/**
 * Carmona's barangays drawn from their outlines, closing in on the resident's barangay, with the
 * truck marked: a real picture of "where is it", light enough for Home (the full map with
 * streets is one tap away and loads only then). Decoration for screen readers: the status card
 * laid over it says the same in words.
 */
export function MiniMap({
  barangays,
  meta,
  highlightId,
  truck,
  truckColor = colors.ink,
  height = 200,
  coveredBottom = 0,
}: MiniMapProps) {
  const { paths, project, cityHeight, boxes } = useMemo(() => {
    const [[west, south], [east, north]] = meta.bounds;
    // Degrees of longitude are shorter than degrees of latitude this far from the equator.
    const squash = Math.cos((((south + north) / 2) * Math.PI) / 180);
    const scale = CITY_WIDTH / ((east - west) * squash);
    const project = ([lng, lat]: LngLat): [number, number] => [
      (lng - west) * squash * scale,
      (north - lat) * scale,
    ];
    const boxes: Record<string, [number, number, number, number]> = {};
    const ring = (id: string) => (points: number[][]) =>
      `${points
        .map((p, i) => {
          const [x, y] = project(p as LngLat);
          const box = (boxes[id] ??= [x, y, x, y]);
          box[0] = Math.min(box[0], x);
          box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x);
          box[3] = Math.max(box[3], y);
          return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('')}Z`;
    const paths = barangays.features.map((f) => {
      const draw = ring(f.properties.id);
      return {
        id: f.properties.id,
        d:
          f.geometry.type === 'Polygon'
            ? f.geometry.coordinates.map(draw).join('')
            : f.geometry.coordinates.flatMap((polygon) => polygon.map(draw)).join(''),
      };
    });
    return { paths, project, cityHeight: (north - south) * scale, boxes };
  }, [barangays, meta]);

  const dot = truck ? project(truck) : null;

  // What to show: the resident's barangay and the truck when it is out, with room around them;
  // the whole city when no barangay is chosen.
  const focus = highlightId ? boxes[highlightId] : undefined;
  let [x0, y0, x1, y1] = focus ?? [0, 0, CITY_WIDTH, cityHeight];
  if (focus && dot) {
    x0 = Math.min(x0, dot[0]);
    y0 = Math.min(y0, dot[1]);
    x1 = Math.max(x1, dot[0]);
    y1 = Math.max(y1, dot[1]);
  }
  const share = focus ? FOCUS_SHARE : 0.9;
  // The part of the frame that the card does not cover.
  const clear = Math.max(0.3, 1 - coveredBottom / height);
  const viewWidth = Math.max((x1 - x0) / share, ((y1 - y0) / (share * clear)) * VIEW_ASPECT);
  const viewHeight = viewWidth / VIEW_ASPECT;
  const viewX = (x0 + x1) / 2 - viewWidth / 2;
  // The centre of what matters sits in the middle of the uncovered part.
  const viewY = (y0 + y1) / 2 - (viewHeight * clear) / 2;
  // Line widths in screen terms, whatever the zoom.
  const px = viewWidth / 340;

  return (
    <View style={[styles.frame, { height }]} aria-hidden>
      <Svg
        width="100%"
        height="100%"
        viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMin slice"
      >
        {/* The resident's barangay last, so its outline lies over its neighbours'. */}
        {[...paths]
          .sort((a, b) => Number(a.id === highlightId) - Number(b.id === highlightId))
          .map((p) => (
            <Path
              key={p.id}
              d={p.d}
              fill={p.id === highlightId ? colors.mint : colors.surface}
              stroke={p.id === highlightId ? colors.primary : colors.fieldBorder}
              strokeWidth={(p.id === highlightId ? 2.5 : 1) * px}
              strokeLinejoin="round"
            />
          ))}
        {dot ? (
          <>
            <Circle cx={dot[0]} cy={dot[1]} r={14 * px} fill={truckColor} opacity={0.25} />
            <Circle
              cx={dot[0]}
              cy={dot[1]}
              r={7 * px}
              fill={truckColor}
              stroke={colors.surface}
              strokeWidth={2.5 * px}
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.greenSoft,
  },
});
