import { useState } from 'react';
import { api } from '../api';
import { useOnEscape } from '../lib/a11y';

/**
 * Fix / refresh the Rotten Tomatoes (+ IMDb, Metacritic) scores for a title.
 *
 * Scores come from OMDb keyed by IMDb id (RT has no public API). Two paths:
 *  - "Re-fetch" uses the IMDb id we already have (or derives it from the TMDB
 *    match) — handy after a fixed TMDB match or a transient OMDb miss.
 *  - Pasting an IMDb link/id overrides the match when OMDb filed the title under
 *    a different id than TMDB gave us.
 */
export default function RatingsPicker({ title, onClose, onUpdated }) {
  useOnEscape(onClose);
  const [imdbInput, setImdbInput] = useState(title.imdb_id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function refresh(useOverride) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = useOverride ? { imdb_id: imdbInput.trim() } : {};
      const res = await api(`/api/ratings/refresh/${title.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
      onUpdated?.(data.title);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const scoreLine = (r) =>
    [
      r.rt != null ? `🍅 ${r.rt}%` : null,
      r.imdb != null ? `IMDb ${r.imdb}` : null,
      r.metacritic != null ? `Metacritic ${r.metacritic}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ') || 'No scores found';

  // Current (pre-refresh) scores, shown until a refresh replaces them.
  const current = {
    rt: title.rt_score,
    imdb: title.imdb_rating,
    metacritic: title.metacritic_score,
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fix ratings"
    >
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Fix Ratings</h2>
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
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Scores come from OMDb, matched by IMDb ID. If a Rotten Tomatoes score is missing or
            wrong, re-fetch — or paste the correct IMDb link to override the match.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-modal-safe space-y-4">
          {/* Current scores */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {result ? 'Updated scores' : 'Current scores'}
            </h3>
            <p className="text-sm text-slate-200">{scoreLine(result ? result.found : current)}</p>
            {result && (
              <p className="text-xs text-emerald-400 mt-1">Saved · matched {result.imdb_id}</p>
            )}
          </div>

          {/* Re-fetch with what we already have */}
          <button
            onClick={() => refresh(false)}
            disabled={busy}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {busy ? 'Fetching…' : 'Re-fetch from OMDb'}
          </button>

          {/* Manual IMDb override */}
          <div>
            <label
              htmlFor="imdb-id-input"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
            >
              Or set the IMDb ID
            </label>
            <input
              id="imdb-id-input"
              value={imdbInput}
              onChange={(e) => setImdbInput(e.target.value)}
              placeholder="tt0117951 or imdb.com link"
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
            />
            <p className="text-[11px] text-slate-600 mt-1">
              Find it on imdb.com — the code in the URL that starts with “tt”.
            </p>
            <button
              onClick={() => refresh(true)}
              disabled={busy || !imdbInput.trim()}
              className="mt-2 w-full bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-40"
            >
              Use this ID &amp; re-fetch
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
