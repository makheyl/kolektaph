import { useTranslation } from 'react-i18next';
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import type { SamplePhotoId } from '@/services/types';

/** Simple drawn scene standing in for a photo in sample tickets (never a real place). */
export function SamplePhoto({
  id,
  width,
  height,
}: {
  id: SamplePhotoId;
  width: number;
  height: number;
}) {
  const { t } = useTranslation();
  const bags = (points: [number, number, number][]) =>
    points.map(([x, y, r], i) => (
      <G key={i}>
        <Ellipse cx={x} cy={y} rx={r} ry={r * 0.8} fill={i % 3 === 0 ? '#2B2B2B' : '#3E4A3D'} />
        <Path d={`M${x - 3} ${y - r * 0.8} q3 -8 6 0`} stroke="#555" strokeWidth={2} fill="none" />
      </G>
    ));

  return (
    <Svg width={width} height={height} viewBox="0 0 320 240">
      {/* Sky, wall, road */}
      <Rect x={0} y={0} width={320} height={240} fill="#CFE3EE" />
      <Rect x={0} y={70} width={320} height={80} fill="#D9CFC0" />
      {[0, 64, 128, 192, 256].map((x) => (
        <Line key={x} x1={x} y1={70} x2={x} y2={150} stroke="#BFB2A0" strokeWidth={2} />
      ))}
      <Rect x={0} y={150} width={320} height={90} fill="#8F9499" />
      <Line
        x1={0}
        y1={200}
        x2={320}
        y2={200}
        stroke="#E8E8E8"
        strokeWidth={3}
        strokeDasharray="18 14"
      />
      {/* Landmark: a post with a sign */}
      <Rect x={26} y={60} width={6} height={100} fill="#6B6B6B" />
      <Rect x={14} y={52} width={30} height={16} rx={2} fill="#1F6E43" />

      {id === 'overflow' && (
        <G>
          <Rect x={130} y={112} width={60} height={56} rx={4} fill="#1F6E43" />
          <Rect x={124} y={106} width={72} height={10} rx={3} fill="#17563A" />
          {bags([
            [118, 170, 14],
            [200, 172, 15],
            [160, 104, 13],
            [214, 160, 11],
            [100, 176, 10],
          ])}
        </G>
      )}
      {id === 'dumping' &&
        bags([
          [150, 170, 18],
          [178, 176, 16],
          [124, 178, 15],
          [162, 150, 14],
          [200, 180, 12],
          [104, 184, 11],
          [140, 146, 11],
        ])}
      {id === 'waterway' && (
        <G>
          <Rect x={0} y={150} width={320} height={50} fill="#5B8FA8" />
          <Line x1={0} y1={148} x2={320} y2={148} stroke="#4A4A4A" strokeWidth={4} />
          {bags([
            [90, 172, 10],
            [150, 168, 12],
            [230, 176, 9],
          ])}
          <Rect x={190} y={160} width={16} height={8} fill="#E0E0E0" />
          <Rect x={60} y={176} width={12} height={6} fill="#F0C040" />
        </G>
      )}
      {id === 'event' && (
        <G>
          <Rect x={70} y={130} width={90} height={8} fill="#8A6A4A" />
          <Rect x={76} y={138} width={6} height={30} fill="#8A6A4A" />
          <Rect x={148} y={138} width={6} height={30} fill="#8A6A4A" />
          {bags([
            [200, 172, 15],
            [228, 178, 13],
            [182, 180, 11],
          ])}
          {[96, 108, 120].map((x) => (
            <Rect key={x} x={x} y={116} width={6} height={14} fill="#6FA86F" />
          ))}
        </G>
      )}
      {id === 'bulky' && (
        <G>
          <Rect
            x={70}
            y={120}
            width={120}
            height={46}
            rx={10}
            fill="#E4E0D4"
            stroke="#B9B2A0"
            strokeWidth={3}
          />
          <Line x1={80} y1={143} x2={180} y2={143} stroke="#C8C0AC" strokeWidth={2} />
          <Rect x={206} y={96} width={50} height={78} fill="#9C7650" />
          <Line x1={231} y1={100} x2={231} y2={170} stroke="#7A5A3A" strokeWidth={2} />
        </G>
      )}
      {id === 'animal' && (
        <G>
          <Ellipse cx={170} cy={178} rx={34} ry={12} fill="#7A6E62" />
          <Circle cx={202} cy={172} r={9} fill="#7A6E62" />
          <Polygon
            points="140,140 156,112 172,140"
            fill="#F2B600"
            stroke="#8A6A00"
            strokeWidth={2}
          />
          <SvgText
            x={156}
            y={136}
            fontSize={16}
            fontWeight="bold"
            fill="#15314B"
            textAnchor="middle"
          >
            !
          </SvgText>
        </G>
      )}
      {id === 'hazard' && (
        <G>
          <Polygon points="120,180 134,164 142,182" fill="#9FD3C7" />
          <Polygon points="150,184 160,170 170,186" fill="#A8CFE0" />
          {[190, 204, 218].map((x) => (
            <Rect key={x} x={x} y={168} width={10} height={18} rx={2} fill="#3A3A3A" />
          ))}
          <Polygon
            points="230,110 252,146 208,146"
            fill="#F2B600"
            stroke="#8A6A00"
            strokeWidth={2}
          />
          <SvgText
            x={230}
            y={142}
            fontSize={20}
            fontWeight="bold"
            fill="#15314B"
            textAnchor="middle"
          >
            !
          </SvgText>
        </G>
      )}
      {id === 'debris' && (
        <G>
          <Rect x={0} y={170} width={320} height={40} fill="#8B7355" opacity={0.7} />
          {[
            [60, 160, 150, 184],
            [120, 150, 220, 180],
            [200, 164, 280, 150],
          ].map(([x1, y1, x2, y2], i) => (
            <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5A4630" strokeWidth={6} />
          ))}
          {bags([
            [160, 176, 12],
            [240, 182, 10],
          ])}
        </G>
      )}
      {id === 'street' && (
        <G>
          <Rect x={80} y={90} width={60} height={60} fill="#F1E3C8" />
          <Polygon points="74,92 110,66 146,92" fill="#B5553A" />
          <Rect x={200} y={96} width={70} height={54} fill="#DCE8D0" />
          <Polygon points="194,98 235,72 276,98" fill="#5A6E8A" />
          {bags([
            [120, 164, 10],
            [140, 168, 9],
          ])}
        </G>
      )}
      {id === 'clean' && (
        <G>
          <Circle cx={250} cy={110} r={20} fill="#157347" />
          <Path d="M240 110 l7 7 l14 -15" stroke="#FFFFFF" strokeWidth={5} fill="none" />
        </G>
      )}

      {/* Always marked as a sample, in the picture itself. */}
      <Rect x={0} y={214} width={320} height={26} fill="#15314B" opacity={0.85} />
      <SvgText x={160} y={232} fontSize={13} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        {t('reports.samplePhoto').toUpperCase()}
      </SvgText>
    </Svg>
  );
}
