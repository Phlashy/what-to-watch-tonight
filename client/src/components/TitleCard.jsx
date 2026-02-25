import { Link } from 'react-router-dom';

function StarRating({ rating }) {
  if (!rating) return null;
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="text-xs font-medium">{rating}/10</span>
    </span>
  );
}

function PosterPlaceholder({ title }) {
  const initials = title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="w-16 h-24 bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
      <span className="text-slate-400 text-sm font-bold">{initials}</span>
    </div>
  );
}

export default function TitleCard({ item, showStreaming = true, showWatched = true, compact = false, addedBy }) {
  const genres = (() => {
    try { return JSON.parse(item.genre || '[]'); } catch { return []; }
  })();

  const lastWatchedLabel = item.last_watched
    ? `Last watched ${new Date(item.last_watched).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })}`
    : item.view_count > 0 ? 'Watched before' : null;

  return (
    <Link to={`/title/${item.title_id || item.id}`} className="block">
      <div className="flex gap-3 bg-slate-800 rounded-xl p-3 hover:bg-slate-750 active:bg-slate-700 transition-colors">
        {/* Poster */}
        <div className="flex-shrink-0">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt={item.title}
              className="w-16 h-24 object-cover rounded-lg"
              loading="lazy"
            />
          ) : (
            <PosterPlaceholder title={item.title} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-100 leading-tight">{item.title}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
              {item.year && <span>{item.year}</span>}
              {item.runtime_minutes && <span>·</span>}
              {item.runtime_minutes && <span>{item.runtime_minutes}m</span>}
              {item.director && <span>·</span>}
              {item.director && <span className="truncate">{item.director}</span>}
            </div>
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {genres.slice(0, 3).map(g => (
                  <span key={g} className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{g}</span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {item.avg_rating && <StarRating rating={item.avg_rating} />}
            {showStreaming && item.streaming_service && (
              <span className="text-xs bg-blue-900/60 text-blue-300 rounded px-2 py-0.5 font-medium">
                {item.streaming_service}
              </span>
            )}
            {showWatched && lastWatchedLabel && (
              <span className="text-xs text-slate-500">{lastWatchedLabel}</span>
            )}
            {item.view_count > 1 && (
              <span className="text-xs text-slate-500">×{item.view_count}</span>
            )}
            {addedBy && (
              <span className="text-xs text-amber-400 font-medium">★ {addedBy}'s pick</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
