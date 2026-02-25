// Pixel art avatars for the Casey family
// Each avatar is a 10x12 grid of single-digit color indices
// 0 = transparent, other digits map to the palette per person

const W = 10;
const H = 12;

const AVATARS = {
  Gordon: {
    bg: '#1a365d',
    palette: {
      1: '#F0C8A0', // fair skin
      2: '#8B7355', // sandy brown hair
      3: '#5B8A5B', // green eyes
      4: '#222222', // black glasses
      5: '#C47060', // mouth
      8: '#3B5998', // blue shirt
      9: '#DBAF8A', // nose shadow
    },
    grid: [
      '0022222200',
      '0222222220',
      '2222222222',
      '2211111122',
      '1444114441',
      '1434114341',
      '0111191100',
      '0011551100',
      '0001111000',
      '0000110000',
      '0088888800',
      '0888888880',
    ],
  },
  Nupur: {
    bg: '#742a2a',
    palette: {
      1: '#C68642', // warm brown skin
      2: '#1C110A', // very dark hair
      3: '#2C1810', // dark brown eyes
      5: '#B85C4A', // mouth
      6: '#1C110A', // eyebrows
      7: '#DAA520', // gold earrings
      8: '#E8E0D8', // cream top
      9: '#A8703C', // nose shadow
    },
    grid: [
      '0022222200',
      '0222222220',
      '2222222222',
      '2211111122',
      '0166116610',
      '7133113317',
      '0111191100',
      '0011551100',
      '0001111000',
      '0000110000',
      '0088888800',
      '0888888880',
    ],
  },
  Arianne: {
    bg: '#44337a',
    palette: {
      1: '#C68642', // warm brown skin
      2: '#1C110A', // dark hair
      3: '#3B8896', // blue-green eyes
      5: '#B85C4A', // mouth
      6: '#1C110A', // eyebrows
      8: '#A8B8C8', // light blue-grey top
      9: '#A8703C', // nose shadow
    },
    // Long hair flows down the sides (col 0 and 9 = hair throughout)
    grid: [
      '0022222200',
      '0222222220',
      '2222222222',
      '2211111122',
      '2166116612',
      '2133113312',
      '2111191112',
      '2011551102',
      '2001111002',
      '2000110002',
      '2088888802',
      '2288888822',
    ],
  },
  Davin: {
    bg: '#22543d',
    palette: {
      1: '#C68642', // warm brown skin
      2: '#1C110A', // dark shaggy hair
      3: '#2C1810', // dark brown eyes
      4: '#C4A070', // tortoiseshell glasses
      5: '#B85C4A', // mouth
      8: '#6B8E6B', // green polo
      9: '#A8703C', // nose shadow
    },
    // Messier hair silhouette (asymmetric top, bangs flopping right)
    grid: [
      '0222222220',
      '2222222222',
      '2222222222',
      '2211111222',
      '1444114441',
      '1434114341',
      '0111191100',
      '0011551100',
      '0001111000',
      '0000110000',
      '0088888800',
      '0888888880',
    ],
  },
};

// Fallback bg colors matching the old avatar system
const FALLBACK_COLORS = {
  Gordon: '#2563eb',
  Nupur: '#e11d48',
  Arianne: '#9333ea',
  Davin: '#16a34a',
};

export function getAvatarStyle(name) {
  const bg = FALLBACK_COLORS[name];
  if (bg) return { bg: `bg-blue-600`, initials: name[0] }; // kept for any legacy callers
  return { bg: 'bg-slate-600', initials: (name || '?')[0].toUpperCase() };
}

export default function PixelAvatar({ name, size = 24, className = '' }) {
  const avatar = AVATARS[name];

  if (!avatar) {
    // Non-family member fallback: colored circle with initial
    const initial = (name || '?')[0].toUpperCase();
    const bg = FALLBACK_COLORS[name] || '#475569';
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
