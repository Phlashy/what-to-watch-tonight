import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';
import { useOnEscape } from '../lib/a11y';
import { findOrCreateTitleFromTmdb } from '../lib/tmdb';

const TMDB_POSTER = 'https://image.tmdb.org/t/p/w92';

/** A title already in the library, shaped for the results list. */
function fromLibrary(row) {
  return {
    key: `local-${row.id}`,
    titleId: row.id,
    tmdbId: row.tmdb_id,
    name: row.title,
    year: row.year,
    posterUrl: row.poster_url,
    kind: row.type === 'show' ? 'TV' : 'Movie',
    onLists: JSON.parse(row.on_lists || '[]'),
  };
}

/** A TMDB search result we don't hold yet, shaped the same way. */
function fromTmdb(item) {
  return {
    key: `tmdb-${item.media_type}-${item.id}`,
    titleId: null,
    tmdbId: item.id,
    tmdbItem: item,
    name: item.title || item.name,
    year: Number((item.release_date || item.first_air_date || '').split('-')[0]) || null,
    posterUrl: item.poster_path ? `${TMDB_POSTER}${item.poster_path}` : null,
    kind: item.media_type === 'tv' ? 'TV' : 'Movie',
    onLists: [],
  };
}

export default function QuickAdd({ onClose, onSaved }) {
  useOnEscape(onClose);
  const { currentPerson } = usePerson();
  const { memberNames } = useFamily();
  const [allLists, setAllLists] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api('/api/lists')
      .then((r) => r.json())
      .then(setAllLists)
      .catch(() => {});
  }, []);
  const [libraryResults, setLibraryResults] = useState([]);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedLists, setSelectedLists] = useState([]);
  const [pickedBy, setPickedBy] = useState(currentPerson ? [currentPerson] : []);
  const [streaming, setStreaming] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Search the library as well as TMDB. Searching TMDB alone — which is all this
  // did originally — meant every add created a brand-new title row, because
  // there was no way to notice the film was already here. That's what put two
  // copies each of Weapons and Bugonia in the library.
  useEffect(() => {
    if (query.length < 2) {
      setLibraryResults([]);
      setTmdbResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const [library, tmdb] = await Promise.all([
        api(`/api/titles?q=${encodeURIComponent(query)}&limit=6`)
          .then((r) => r.json())
          .then((d) => d.titles || [])
          .catch(() => []),
        api(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=multi`)
          .then((r) => r.json())
          .then((d) => (Array.isArray(d) ? d : []))
          .catch(() => []),
      ]);
      setLibraryResults(library.map(fromLibrary));
      setTmdbResults(tmdb.map(fromTmdb));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Don't offer a TMDB result we already hold — picking it is how duplicates
  // used to happen, and the library entry carries the real history.
  const heldTmdbIds = new Set(libraryResults.map((r) => r.tmdbId).filter(Boolean));
  const newFromTmdb = tmdbResults.filter((r) => !heldTmdbIds.has(r.tmdbId));

  function toggleList(name) {
    setSelectedLists((l) => (l.includes(name) ? l.filter((x) => x !== name) : [...l, name]));
  }

  async function handleSave() {
    if (!selected || selectedLists.length === 0) return;
    setSaving(true);
    setError('');
    try {
      // Already in the library → use that row. Otherwise create it (the server
      // still checks by tmdb_id, so a stale search result can't fork the title).
      const titleId = selected.titleId ?? (await findOrCreateTitleFromTmdb(selected.tmdbItem)).id;

      let alreadyOn = 0;
      for (const listName of selectedLists) {
        try {
          await api(`/api/lists/${listName}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title_id: titleId,
              streaming_service: streaming || null,
              note: note || null,
              added_by: pickedBy.length > 0 ? pickedBy.join(',') : currentPerson || null,
            }),
          });
        } catch (e) {
          // Adding a library title to a list it's already on isn't a failure —
          // the end state is what was asked for.
          if (e.status !== 409) throw e;
          alreadyOn++;
        }
      }

      if (alreadyOn === selectedLists.length) {
        setError(`Already on ${alreadyOn === 1 ? 'that list' : 'those lists'}.`);
        return;
      }

      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add to watch list"
    >
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Add to Watch List</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-white p-2"
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

          {/* Search */}
          <div className="mb-4">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setError('');
              }}
              placeholder="Search for a movie or show..."
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
              autoFocus
            />
          </div>

          {/* Results — the library first, so an existing title is the obvious pick */}
          {!selected && libraryResults.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-400 font-medium mb-2">Already in your library</div>
              <div className="space-y-2">
                {libraryResults.map((r) => (
                  <ResultRow key={r.key} result={r} onSelect={() => setSelected(r)} />
                ))}
              </div>
            </div>
          )}

          {!selected && newFromTmdb.length > 0 && (
            <div className="mb-4">
              {libraryResults.length > 0 && (
                <div className="text-xs text-slate-400 font-medium mb-2">Add something new</div>
              )}
              <div className="space-y-2">
                {newFromTmdb.map((r) => (
                  <ResultRow key={r.key} result={r} onSelect={() => setSelected(r)} />
                ))}
              </div>
            </div>
          )}

          {selected && (
            <>
              {/* Selected title */}
              <div className="flex items-center gap-3 bg-slate-800 rounded-xl p-3 mb-4">
                {selected.posterUrl ? (
                  <img src={selected.posterUrl} alt="" className="w-12 h-16 object-cover rounded" />
                ) : null}
                <div className="flex-1">
                  <div className="font-medium">{selected.name}</div>
                  <div className="text-xs text-slate-400">
                    {selected.year}
                    {selected.titleId && <span className="text-slate-500"> · in your library</span>}
                  </div>
                  {selected.onLists.length > 0 && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      On {selected.onLists.join(', ')}
                    </div>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 text-xs">
                  Change
                </button>
              </div>

              {/* Lists */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-2 block">Add to list</label>
                <div className="flex flex-wrap gap-2">
                  {allLists.map((l) => (
                    <button
                      key={l.name}
                      onClick={() => toggleList(l.name)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedLists.includes(l.name) ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      {l.display_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Picked by */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-2 block">Picked by</label>
                <div className="flex flex-wrap gap-1.5">
                  {memberNames.map((name) => {
                    const isSelected = pickedBy.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() =>
                          setPickedBy((prev) =>
                            isSelected ? prev.filter((p) => p !== name) : [...prev, name]
                          )
                        }
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-amber-500 text-black'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Streaming */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-1 block">
                  Streaming service
                </label>
                <input
                  value={streaming}
                  onChange={(e) => setStreaming(e.target.value)}
                  placeholder="Netflix, MUBI, etc."
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500"
                />
              </div>

              {/* Note */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-1 block">Note</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why you want to watch it, who recommended it..."
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500"
                />
              </div>

              {error && <div className="text-sm text-amber-400 mb-3">{error}</div>}

              <button
                onClick={handleSave}
                disabled={selectedLists.length === 0 || saving}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors"
              >
                {saving ? 'Adding...' : 'Add to List'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ result, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl p-2.5 text-left transition-colors"
    >
      {result.posterUrl ? (
        <img src={result.posterUrl} alt="" className="w-10 h-14 object-cover rounded" />
      ) : (
        <div className="w-10 h-14 bg-slate-700 rounded" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{result.name}</div>
        <div className="text-xs text-slate-400">
          {result.year}
          <span className="text-slate-500"> · {result.kind}</span>
        </div>
        {result.onLists.length > 0 && (
          <div className="text-xs text-slate-500 truncate">On {result.onLists.join(', ')}</div>
        )}
      </div>
    </button>
  );
}
