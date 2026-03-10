// Pixel art avatars — 10x12 grids of single-digit color indices
// 0 = transparent, other digits map to the palette per person
// Avatar data loaded from family config

import { useFamily } from '../context/FamilyContext';

const W = 10;
const H = 12;

export default function PixelAvatar({ name, size = 24, className = '' }) {
  const family = useFamily();
  const avatar = family?.getAvatar(name);
  const memberColor = family?.getColor(name);

  if (!avatar) {
    // Non-family member or no avatar defined: colored circle with initial
    const initial = (name || '?')[0].toUpperCase();
    const bg = memberColor || '#475569';
    return (
      <div
        className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: bg }}
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
      >
        <rect x="0" y="0" width={W} height={H} fill={avatar.bg} />
        {avatar.grid.map((row, y) =>
          [...row].map((ch, x) => {
            const color = avatar.palette[ch];
            if (!color) return null;
            return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />;
          })
        )}
      </svg>
    </div>
  );
}
