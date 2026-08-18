import { memo, useMemo } from 'react';
import { Svg, Defs, LinearGradient, Stop, Polygon, Circle, Path } from 'react-native-svg';

type OfficialVerifiedBadgeProps = {
  size?: number;
};

function buildSealPoints(size: number) {
  const center = size / 2;
  const outer = size * 0.5;
  const inner = size * 0.445;
  return Array.from({ length: 32 }, (_, index) => {
    const angle = (-90 + index * 11.25) * (Math.PI / 180);
    const radius = index % 2 === 0 ? outer : inner;
    return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
  }).join(' ');
}

export const OfficialVerifiedBadge = memo(function OfficialVerifiedBadge({ size = 22 }: OfficialVerifiedBadgeProps) {
  const sealPoints = useMemo(() => buildSealPoints(size), [size]);
  const scale = size / 24;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="officialBadgeBlue" x1="2" y1="1" x2="22" y2="23" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#77D5FF" />
          <Stop offset="0.46" stopColor="#38A9F5" />
          <Stop offset="1" stopColor="#1264C8" />
        </LinearGradient>
      </Defs>
      <Polygon points={sealPoints} fill="url(#officialBadgeBlue)" />
      <Circle cx={size / 2} cy={size / 2} r={size * 0.34} fill="#FFFFFF" opacity={0.16} />
      <Path
        d={`M ${6.2 * scale} ${12.4 * scale} L ${10.1 * scale} ${16.2 * scale} L ${17.9 * scale} ${7.7 * scale}`}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.9 * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});
