import { useState, useEffect } from 'react';
import { usePerson } from '../context/PersonContext';

const PEOPLE = ['Gordon', 'Nupur', 'Arianne', 'Davin', 'Julian'];
const COMMON_TAGS = ['family_movie_night', 'solo', 'cinema', 'plane', 'mubi', 'viff', 'christmas', 'birthday', 'curacao', 'unfinished'];

export default function LogViewing({ titleId, titleName, onClose, onSaved }) {
  const { currentPerson } = usePerson();
  const [form, setForm] = useState(() => ({
    date: new Date().toISOString().split('T')[0],
    date_precision: 'day',
    rating: '',
    notes: '',
    tags: [],
    // Pre-select current person if they're a known family member
    people: currentPerson && PEOPLE.includes(currentPerson)
      ? [{ person: currentPerson, role: 'chooser' }]
      : [],
  }));
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(titleName || '');
  const [searchResults, setSearchResults] = useState([]);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [creatingTitle, setCreatingTitle] = useState(false);
  const [selectedTitleId, setSelectedTitleId] = useState(titleId || null);
  const [selectedTitleName, setSelectedTitleName] = useState(titleName || '');

  useEffect(() => {
    if (!titleId && searchQuery.length > 1) {
      const timer = setTimeout(async () => {
        // Local DB search
        const res = await fetch(`/api/titles?q=${encodeURIComponent(searchQuery)}&limit=8`);
        const data = await res.json();
        setSearchResults(data.titles || []);

        // TMDB search (find titles not in our DB)
        try {
          const tmdbRes = await fetch(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}&type=multi`);
          const tmdbData = await tmdbRes.json();
          setTmdbResults(Array.isArray(tmdbData) ? tmdbData : []);
        } catch {
          setTmdbResults([]);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setTmdbResults([]);
    }
  }, [searchQuery, titleId]);

  function toggleTag(tag) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  }

  function togglePerson(person) {
    setForm(f => ({
      ...f,
      people: f.people.find(p => p.person === person)
        ? f.people.filter(p => p.person !== person)
        : [...f.people, { person, role: 'chooser' }],
    }));
  }

  async function selectTmdbResult(tmdbItem) {
    setCreatingTitle(true);
    try {
      // Create the title in the DB
      const titleRes = await fetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tmdbItem.title || tmdbItem.name,
          type: tmdbItem.media_type === 'tv' ? 'show' : 'movie',
        }),
      });
      const titleData = await titleRes.json();

      // Enrich with TMDB metadata
      await fetch(`/api/tmdb/enrich/${titleData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: tmdbItem.id }),
      });

      setSelectedTitleId(titleData.id);
      setSelectedTitleName(tmdbItem.title || tmdbItem.name);
      setSearchResults([]);
      setTmdbResults([]);
    } finally {
      setCreatingTitle(false);
    }
  }

  async function handleSave() {
    if (!selectedTitleId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/viewings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title_id: selectedTitleId,
          date: form.date || null,
          date_precision: form.date_precision,
          // Use currentPerson's rating as group rating for backward compat; fall back to first person
          rating: form.people.find(p => p.person === currentPerson)?.rating
            || form.people[0]?.rating
            || null,
          notes: form.notes || null,
          tags: form.tags,
          people: form.people,
        }),
      });
      if (res.ok) {
        onSaved?.();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Log a Viewing</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Title search */}
          {!titleId && (
            <div className="mb-4">
              <label className="text-xs text-slate-400 font-medium mb-1 block">Title</label>
              {selectedTitleName ? (
                <div className="flex items-center gap-2">
                  <span className="bg-slate-700 rounded-lg px-3 py-2 text-sm flex-1">{selectedTitleName}</span>
                  <button onClick={() => { setSelectedTitleId(null); setSelectedTitleName(''); setSearchQuery(''); }} className="text-slate-400 text-xs">Change</button>
                </div>
              ) : (
                <>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search titles..."
                    className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
                    autoFocus
                  />
                  {/* Local DB results */}
                  {searchResults.length > 0 && (
                    <div className="mt-1 bg-slate-800 rounded-lg divide-y divide-slate-700">
                      {searchResults.map(t => (
                        <button key={t.id} onClick={() => { setSelectedTitleId(t.id); setSelectedTitleName(t.title); setSearchResults([]); setTmdbResults([]); }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700">
                          {t.title} {t.year && <span className="text-slate-400">({t.year})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* TMDB results — titles not yet in our database */}
                  {tmdbResults.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mt-3 mb-1">
                        <div className="h-px bg-slate-700 flex-1" />
                        <span className="text-xs text-slate-500 font-medium">From TMDB</span>
                        <div className="h-px bg-slate-700 flex-1" />
                      </div>
                      <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
                        {tmdbResults.map(r => (
                          <button key={r.id}
                            onClick={() => selectTmdbResult(r)}
                            disabled={creatingTitle}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-700 text-left disabled:opacity-50">
                            {r.poster_path ? (
                              <img src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-12 bg-slate-700 rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{r.title || r.name}</div>
                              <div className="text-xs text-slate-400">
                                {(r.release_date || r.first_air_date || '').split('-')[0]}
                                {r.media_type && <span className="text-slate-500"> · {r.media_type === 'tv' ? 'TV' : 'Movie'}</span>}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {creatingTitle && (
                    <p className="text-xs text-amber-400 text-center mt-2">Setting up title...</p>
                  )}
                </>
              )}
            </div>
          )}

          {titleName && <p className="text-amber-400 font-medium mb-4">{titleName}</p>}

          {/* Date */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-medium mb-1 block">Date</label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={form.date_precision === 'in_progress' ? '' : form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value, date_precision: 'day' }))}
                disabled={form.date_precision === 'in_progress'}
                className="flex-1 bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500 disabled:opacity-40"
              />
              <button
                onClick={() => setForm(f => f.date_precision === 'in_progress'
                  ? { ...f, date_precision: 'day', date: new Date().toISOString().split('T')[0] }
                  : { ...f, date_precision: 'in_progress', date: '' }
                )}
                className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  form.date_precision === 'in_progress'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-300'
                }`}
              >
                In progress
              </button>
            </div>
          </div>

          {/* Who watched */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-medium mb-1 block">Who watched</label>
            <div className="flex flex-wrap gap-2">
              {PEOPLE.map(p => (
                <button key={p} onClick={() => togglePerson(p)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${form.people.find(pp => pp.person === p) ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Per-person ratings */}
          {form.people.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-slate-400 font-medium mb-2 block">Ratings</label>
              <div className="space-y-2.5">
                {form.people.map(({ person }) => (
                  <div key={person}>
                    <span className="text-xs text-slate-400 mb-1 block">{person}</span>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n}
                          onClick={() => setForm(f => ({
                            ...f,
                            people: f.people.map(pp =>
                              pp.person === person ? { ...pp, rating: pp.rating === n ? null : n } : pp
                            ),
                          }))}
                          className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                            form.people.find(pp => pp.person === person)?.rating === n
                              ? 'bg-amber-500 text-black'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-medium mb-1 block">Tags</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_TAGS.map(t => (
                <button key={t} onClick={() => toggleTag(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.tags.includes(t) ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-medium mb-1 block">Notes / Review</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Quick thoughts..."
              className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!selectedTitleId || saving}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? 'Saving...' : 'Save Viewing'}
          </button>
        </div>
      </div>
    </div>
  );
}
