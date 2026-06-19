import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFamily } from '../context/FamilyContext';
import { parseJSON } from '../utils';
import { useFromState } from '../lib/useFromState';
import ShortlistButton from './ShortlistButton';

/**
 * A single title card on the Tonight page: poster + metadata, an overlaid
 * shortlist star, a Hide button, and a left-edge drag handle (dnd-kit sortable).
 */
export default function WatchCard({
  item,
  dismissed,
  onDismiss,
  shortlistMap,
  onShortlistToggle,
  addedBy,
  currentPerson,
}) {
  const { streamingServiceIds: MY_SERVICE_IDS } = useFamily();
  const fromState = useFromState();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  if (dismissed) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 999 : undefined,
  };

  const genres = parseJSON(item.genre);
  const shortlistedBy = shortlistMap[item.id] || [];
  // Cached streaming provider icons (only show user's services)
  const myProviders = (() => {
    const wp = parseJSON(item.watch_providers, null);
    if (!wp) return [];
    const all = [...(wp.flatrate || []), ...(wp.free || [])];
    const unique = [...new Map(all.map((p) => [p.provider_id, p])).values()];
    return unique.filter((p) => MY_SERVICE_IDS.has(p.provider_id));
  })();
  // Collection / owned status
  const isOwned = (() => {
    const entries = parseJSON(item.collection_entries);
    return entries.some((e) => e.format);
  })();

  // ShortlistButton is rendered OUTSIDE the card link to escape its overflow-hidden clipping.
  // The card gets pr-12 so the title never hides behind the overlaid button.
  const card = (
    <Link to={`/title/${item.id}`} state={fromState} className="block">
      <div className="flex gap-3 bg-slate-800 rounded-xl p-3 pl-10 pr-12 active:bg-slate-700 transition-colors">
        {/* Poster */}
        <div className="flex-shrink-0">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt={item.title}
              className="w-14 h-20 object-cover rounded-lg"
              loading="lazy"
            />
          ) : (
            <div className="w-14 h-20 bg-slate-700 rounded-lg flex items-center justify-center text-slate-500 text-xs font-bold">
              {item.title
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join('')}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 leading-tight">{item.title}</h3>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400 flex-wrap">
            {item.year && <span>{item.year}</span>}
            {item.runtime_minutes && (
              <>
                <span>·</span>
                <span>{item.runtime_minutes}m</span>
              </>
            )}
            {item.director && (
              <>
                <span>·</span>
                <span className="truncate max-w-[120px]">{item.director}</span>
              </>
            )}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {genres.slice(0, 3).map((g) => (
                <span key={g} className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {isOwned && (
              <span className="text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Owned
              </span>
            )}
            {myProviders.length > 0 && (
              <div className="flex gap-1 items-center">
                {myProviders.map((p) => (
                  <img
                    key={p.provider_id}
                    src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                    alt={p.provider_name}
                    title={p.provider_name}
                    className="w-4 h-4 rounded-sm"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            {item.streaming_service && myProviders.length === 0 && !isOwned && (
              <span className="text-xs bg-blue-900/60 text-blue-300 rounded px-1.5 py-0.5 font-medium">
                {item.streaming_service}
              </span>
            )}
            {shortlistedBy.length > 0 && (
              <span className="text-xs text-amber-400 font-medium">
                ★ {shortlistedBy.join(', ')}
              </span>
            )}
            {addedBy && <span className="text-xs text-slate-500">{addedBy}'s pick</span>}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {card}
      {/* Star — top of the right gutter (the card has pr-12 to leave room). */}
      <div className="absolute top-2 right-2 z-30">
        <ShortlistButton
          shortlistedBy={shortlistedBy}
          onToggle={(person) => onShortlistToggle(item.id, person)}
          currentPerson={currentPerson}
        />
      </div>
      {/* Hide — explicit button (replaces swipe-to-hide). */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        aria-label={`Hide ${item.title} for now`}
        title="Hide for now"
        className="absolute bottom-2 right-2 z-30 w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:text-red-400 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
          />
        </svg>
      </button>
      {/* Drag handle — left edge. touch-none prevents scroll conflict on mobile. */}
      <div
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.title}`}
        className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-20"
        title="Drag to reorder"
      >
        <svg
          className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 6zm0 6a2 2 0 10.001 4.001A2 2 0 007 12zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 4zm0 6a2 2 0 10-.001-4.001A2 2 0 0013 10zm0 6a2 2 0 10-.001-4.001A2 2 0 0013 16z" />
        </svg>
      </div>
    </div>
  );
}
