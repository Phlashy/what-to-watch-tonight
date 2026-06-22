import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { addTitleFromTmdb } from '../lib/tmdb';
import { useFromState } from '../lib/useFromState';
import { parseJSON } from '../utils';

function SearchResult({ t }) {
  const fromState = useFromState();
  const genres = parseJSON(t.genre);
  const onLists = parseJSON(t.on_lists);
  // Remove nulls from json_group_array when no list memberships
  const lists = onLists.filter(Boolean);

  return (
    <Link
      to={`/title/${t.id}`}
      state={fromState}
      className="flex items-start gap-3 p-3 hover:bg-slate-800/60 rounded-xl transition-colors"
    >
      {t.poster_url ? (
        <img
          src={t.poster_url}
          alt={t.title}
          className="w-12 h-[4.5rem] object-cover rounded-lg flex-shrink-0 bg-slate-800"
        />
      ) : (
        <div className="w-12 h-[4.5rem] bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
            />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-semibold text-sm leading-tight truncate">{t.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400 flex-wrap">
          {t.year && <span>{t.year}</span>}
          {t.type && (
            <>
              <span className="text-slate-500">·</span>
              <span className="capitalize">{t.type}</span>
            </>
          )}
          {t.runtime_minutes && (
            <>
              <span className="text-slate-500">·</span>
              <span>{t.runtime_minutes}m</span>
            </>
          )}
          {t.avg_rating && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-amber-400 font-medium">
                ★ {parseFloat(t.avg_rating).toFixed(1)}
              </span>
            </>
          )}
        </div>
        {t.director && <p className="text-xs text-slate-500 mt-0.5">dir. {t.director}</p>}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="text-xs bg-slate-800 text-slate-400 rounded-full px-2 py-0.5"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {t.view_count > 0 && (
            <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-2 py-0.5">
              Watched {t.view_count}×
            </span>
          )}
          {lists.map((l) => (
            <span key={l} className="text-xs bg-blue-900/40 text-blue-300 rounded-full px-2 py-0.5">
              {l}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// A TMDB result the user can add to their library.
function TmdbResult({ r, adding, onAdd }) {
  const name = r.title || r.name;
  const year = (r.release_date || r.first_air_date || '').split('-')[0];
  return (
    <button
      onClick={() => onAdd(r)}
      disabled={adding}
      className="w-full flex items-start gap-3 p-3 hover:bg-slate-800/60 rounded-xl transition-colors text-left disabled:opacity-50"
    >
      {r.poster_path ? (
        <img
          src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
          alt=""
          className="w-12 h-[4.5rem] object-cover rounded-lg flex-shrink-0 bg-slate-800"
        />
      ) : (
        <div className="w-12 h-[4.5rem] bg-slate-800 rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-semibold text-sm leading-tight truncate">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
          {year && <span>{year}</span>}
          {r.media_type && (
            <>
              <span className="text-slate-500">·</span>
              <span>{r.media_type === 'tv' ? 'TV' : 'Movie'}</span>
            </>
          )}
        </div>
        {r.overview && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.overview}</p>}
      </div>
      <span className="flex-shrink-0 self-center text-xs font-medium text-amber-400 flex items-center gap-1">
        {adding ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add
          </>
        )}
      </span>
    </button>
  );
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [adding, setAdding] = useState(null);
  const [totalTitles, setTotalTitles] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const fromState = useFromState();

  useEffect(() => {
    inputRef.current?.focus();
    api('/api/titles?limit=1')
      .then((r) => r.json())
      .then((d) => setTotalTitles(d.total))
      .catch(() => {});
  }, []);

  const doLocalSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/titles?q=${encodeURIComponent(query)}&limit=50`);
      const data = await res.json();
      setResults(data.titles || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const doTmdbSearch = useCallback(async () => {
    setTmdbLoading(true);
    try {
      const res = await api(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=multi`);
      const data = await res.json();
      setTmdbResults(Array.isArray(data) ? data : []);
    } catch {
      setTmdbResults([]);
    } finally {
      setTmdbLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setTotal(0);
      setTmdbResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      doLocalSearch();
      doTmdbSearch();
      // Snap back to the top so the best match (first result) is visible. On
      // iOS the keyboard/focus can otherwise leave the list scrolled partway
      // down, hiding the top results.
      window.scrollTo({ top: 0 });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, doLocalSearch, doTmdbSearch]);

  async function handleAddTmdb(item) {
    setAdding(item.id);
    try {
      const id = await addTitleFromTmdb(item);
      navigate(`/title/${id}`, { state: fromState });
    } catch {
      setAdding(null);
    }
  }

  // Hide TMDB results that are already in the library (matched by tmdb_id).
  const ownedTmdbIds = new Set(results.map((r) => r.tmdb_id).filter(Boolean));
  const newTmdb = tmdbResults.filter((r) => !ownedTmdbIds.has(r.id));

  const searching = query.length >= 2;
  const nothingFound =
    searching && !loading && !tmdbLoading && results.length === 0 && newTmdb.length === 0;

  return (
    <div className="pb-safe">
      {/* Search header */}
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur-sm px-4 pt-safe pb-3 z-10 border-b border-slate-800/50">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titles, directors, cast…"
            className="w-full bg-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500 placeholder:text-slate-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="px-2 py-2">
        {!searching && (
          <div className="text-center py-16 text-slate-500">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-slate-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-sm font-medium">Search across all {totalTitles ?? '…'} titles</p>
            <p className="text-xs mt-1 text-slate-500">your library, plus TMDB to add new titles</p>
          </div>
        )}

        {/* Your library (local DB) — primary results */}
        {searching && loading && results.length === 0 && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}
        {searching && results.length > 0 && (
          <>
            <p className="text-xs text-slate-500 px-3 pb-2">
              In your library · {total} result{total !== 1 ? 's' : ''}
              {total > results.length ? ` (showing ${results.length})` : ''}
            </p>
            <div className="space-y-0.5">
              {results.map((t) => (
                <SearchResult key={t.id} t={t} />
              ))}
            </div>
          </>
        )}

        {/* TMDB — add a new title (secondary) */}
        {searching && (tmdbLoading || newTmdb.length > 0) && (
          <div className="mt-4">
            <div className="flex items-center gap-2 px-3 pb-2">
              <div className="h-px bg-slate-800 flex-1" />
              <span className="text-xs text-slate-500 font-medium">
                {results.length > 0
                  ? 'Not in your library? Add from TMDB'
                  : 'Add a new title from TMDB'}
              </span>
              <div className="h-px bg-slate-800 flex-1" />
            </div>
            {tmdbLoading && newTmdb.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-4">Searching TMDB…</p>
            ) : (
              <div className="space-y-0.5">
                {newTmdb.map((r) => (
                  <TmdbResult
                    key={`${r.media_type}-${r.id}`}
                    r={r}
                    adding={adding === r.id}
                    onAdd={handleAddTmdb}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {nothingFound && (
          <div className="text-center py-16 text-slate-500">
            <p className="text-sm">
              No results for <span className="text-slate-300">"{query}"</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
