import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useOnEscape } from '../lib/a11y';

export default function TMDBPicker({
  titleId,
  initialQuery = '',
  titleType = 'movie',
  onClose,
  onEnriched,
  onMerged,
}) {
  useOnEscape(onClose);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(titleType === 'show' ? 'tv' : 'movie');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${type}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [query, type]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(search, 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  async function pick(tmdbResult) {
    setEnriching(tmdbResult.id);
    setConflict(null);
    try {
      const res = await api(`/api/tmdb/enrich/${titleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: tmdbResult.id, tmdb_type: type }),
      });
      const enriched = await res.json();
      onEnriched(enriched);
      onClose();
    } catch (e) {
      // The film you're pointing at is already in the library under another row.
      // That's not really an error — it means these two rows are the same film,
      // and the fix is to merge them. Offer that instead of a dead end.
      if (e.status === 409 && e.body?.conflictTitleId) {
        setConflict({ id: e.body.conflictTitleId, message: e.message });
      } else {
        setError(e.message || 'Something went wrong.');
      }
    } finally {
      setEnriching(null);
    }
  }

  async function mergeIntoConflict() {
    setMerging(true);
    try {
      const res = await api(`/api/titles/${titleId}/merge-into/${conflict.id}`, { method: 'POST' });
      const result = await res.json();
      // This title no longer exists — the caller has to send us somewhere else.
      onMerged?.(result.into.id, result);
      onClose();
    } catch (e) {
      setError(e.message || 'Merge failed.');
      setMerging(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fix TMDB match"
    >
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Fix TMDB Match</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-white p-2 -mr-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TMDB..."
            className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500 mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            {['movie', 'tv'].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${type === t ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'}`}
              >
                {t === 'tv' ? 'TV Show' : 'Movie'}
              </button>
            ))}
          </div>
        </div>

        {/* Already-in-the-library conflict — offer the merge rather than a dead end */}
        {conflict && (
          <div className="mx-4 mt-3 rounded-xl border border-amber-600/40 bg-amber-950/30 p-3">
            <p className="text-sm text-amber-200 font-medium">{conflict.message}</p>
            <p className="text-xs text-slate-400 mt-1">
              That means these are the same film, listed twice. Merging moves this one's viewings,
              lists and stars onto it, then removes this duplicate.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={mergeIntoConflict}
                disabled={merging}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {merging ? 'Merging…' : 'Merge them'}
              </button>
              <button
                onClick={() => setConflict(null)}
                className="px-4 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="mx-4 mt-3 text-sm text-red-400">{error}</p>}

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-2 pt-2 pb-modal-safe">
          {loading && <div className="text-center py-6 text-slate-500 text-sm">Searching…</div>}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="text-center py-6 text-slate-500 text-sm">No results</div>
          )}
          {results.map((r) => {
            const name = r.title || r.name;
            const year = (r.release_date || r.first_air_date || '').split('-')[0];
            return (
              <button
                key={r.id}
                onClick={() => pick(r)}
                disabled={enriching === r.id}
                className="w-full flex items-start gap-3 p-2.5 hover:bg-slate-800 rounded-xl transition-colors text-left disabled:opacity-50"
              >
                {r.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                    alt=""
                    className="w-12 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-16 bg-slate-700 rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-semibold text-sm leading-tight">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {year}
                    {r.vote_average ? ` · ★ ${r.vote_average.toFixed(1)}` : ''}
                  </p>
                  {r.overview && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.overview}</p>
                  )}
                </div>
                {enriching === r.id && (
                  <span className="text-xs text-amber-400 flex-shrink-0 pt-1">Loading…</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
