import { useState, useEffect } from 'react';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';

export default function QuickAdd({ onClose, onSaved }) {
  const { currentPerson } = usePerson();
  const { lists } = useFamily();
  const LIST_OPTIONS = lists.map(l => ({ name: l.name, label: l.displayName }));
  const [query, setQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState([]);
  const [selectedTmdb, setSelectedTmdb] = useState(null);
  const [selectedLists, setSelectedLists] = useState([]);
  const [streaming, setStreaming] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('search'); // search | pick-tmdb | details

  useEffect(() => {
    if (query.length < 2) { setTmdbResults([]); return; }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setTmdbResults(Array.isArray(data) ? data : []);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  function toggleList(name) {
    setSelectedLists(l => l.includes(name) ? l.filter(x => x !== name) : [...l, name]);
  }

  async function handleSave() {
    if (!selectedTmdb || selectedLists.length === 0) return;
    setSaving(true);
    try {
      // Create/enrich the title
      const titleRes = await fetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedTmdb.title || selectedTmdb.name,
          type: selectedTmdb.media_type === 'tv' ? 'show' : 'movie',
        }),
      });
      const titleData = await titleRes.json();

      // Enrich with TMDB
      await fetch(`/api/tmdb/enrich/${titleData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: selectedTmdb.id }),
      });

      // Add to lists
      for (const listName of selectedLists) {
        await fetch(`/api/lists/${listName}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title_id: titleData.id,
            streaming_service: streaming || null,
            note: note || null,
            added_by: currentPerson || null,
          }),
        });
      }

      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Add to Watch List</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedTmdb(null); }}
              placeholder="Search for a movie or show..."
              className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
              autoFocus
            />
          </div>

          {/* TMDB results */}
          {!selectedTmdb && tmdbResults.length > 0 && (
            <div className="mb-4 space-y-2">
              {tmdbResults.map(r => (
                <button key={r.id} onClick={() => setSelectedTmdb(r)}
                  className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl p-2.5 text-left transition-colors">
                  {r.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-slate-700 rounded" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{r.title || r.name}</div>
                    <div className="text-xs text-slate-400">{(r.release_date || r.first_air_date || '').split('-')[0]}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedTmdb && (
            <>
              {/* Selected title */}
              <div className="flex items-center gap-3 bg-slate-800 rounded-xl p-3 mb-4">
                {selectedTmdb.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${selectedTmdb.poster_path}`} alt="" className="w-12 h-16 object-cover rounded" />
                ) : null}
                <div className="flex-1">
                  <div className="font-medium">{selectedTmdb.title || selectedTmdb.name}</div>
                  <div className="text-xs text-slate-400">{(selectedTmdb.release_date || selectedTmdb.first_air_date || '').split('-')[0]}</div>
                </div>
                <button onClick={() => setSelectedTmdb(null)} className="text-slate-400 text-xs">Change</button>
              </div>

              {/* Lists */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-2 block">Add to list</label>
                <div className="flex flex-wrap gap-2">
                  {LIST_OPTIONS.map(l => (
                    <button key={l.name} onClick={() => toggleList(l.name)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedLists.includes(l.name) ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Streaming */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-1 block">Streaming service</label>
                <input value={streaming} onChange={e => setStreaming(e.target.value)}
                  placeholder="Netflix, MUBI, etc."
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500" />
              </div>

              {/* Note */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 font-medium mb-1 block">Note</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Why you want to watch it, who recommended it..."
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500" />
              </div>

              <button onClick={handleSave} disabled={selectedLists.length === 0 || saving}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors">
                {saving ? 'Adding...' : 'Add to List'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
