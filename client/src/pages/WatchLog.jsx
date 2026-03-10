import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LogViewing from '../components/LogViewing';
import { useFamily } from '../context/FamilyContext';

function ViewingRow({ v }) {
  const people = (() => { try { return JSON.parse(v.people || '[]'); } catch { return []; } })();
  const tags = (() => { try { return JSON.parse(v.tags || '[]'); } catch { return []; } })();
  const genres = (() => { try { return JSON.parse(v.genre || '[]'); } catch { return []; } })();
  const choosers = people.filter(p => p.role === 'chooser').map(p => p.person);

  const dateLabel = v.date
    ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Date unknown';

  return (
    <Link to={`/title/${v.title_id}`} className="block">
      <div className="flex gap-3 p-3 bg-slate-800 rounded-xl hover:bg-slate-750 active:bg-slate-700 transition-colors">
        {/* Poster */}
        {v.poster_url ? (
          <img src={v.poster_url} alt={v.title} className="w-12 h-[4.5rem] object-cover rounded-lg flex-shrink-0" loading="lazy" />
        ) : (
          <div className="w-12 h-[4.5rem] bg-slate-700 rounded-lg flex-shrink-0 flex items-center justify-center text-slate-500 text-xs font-bold">
            {v.title?.split(' ').slice(0,2).map(w=>w[0]).join('')}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-100 text-sm leading-tight">{v.title}</h3>
            {people.some(p => p.rating != null) ? (
              <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                {people.filter(p => p.rating != null).map(p => `${p.person} ${p.rating}`).join(' · ')}
              </span>
            ) : v.rating ? (
              <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                {v.rating}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{dateLabel}</div>
          {choosers.length > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">Chosen by {choosers.join(', ')}</div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.slice(0, 3).map(t => (
                <span key={t} className="text-xs bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">{t.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
          {v.notes && <p className="text-xs text-slate-400 mt-1 italic line-clamp-2">"{v.notes}"</p>}
        </div>
      </div>
    </Link>
  );
}

export default function WatchLog() {
  const { allPeople: PEOPLE } = useFamily();
  const [viewings, setViewings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('');
  const [minRating, setMinRating] = useState('');
  const [tags, setTags] = useState('');
  const [hasNotes, setHasNotes] = useState(false);
  const [sort, setSort] = useState('date');
  const [showFilters, setShowFilters] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadViewings(1, true);
    }, 300);
  }, [search, person, minRating, tags, hasNotes, sort]);

  async function loadViewings(p = page, reset = false) {
    setLoading(true);
    const params = new URLSearchParams({ page: p, limit: 40 });
    if (search) params.set('search', search);
    if (person) params.set('person', person);
    if (minRating) params.set('minRating', minRating);
    if (tags) params.set('tags', tags);
    if (hasNotes) params.set('hasNotes', 'true');
    if (sort !== 'date') params.set('sort', sort);

    try {
      const res = await fetch(`/api/viewings?${params}`);
      const data = await res.json();
      const newViewings = data.viewings || [];
      setViewings(v => reset ? newViewings : [...v, ...newViewings]);
      setHasMore(newViewings.length === 40);
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    loadViewings(next);
  }

  return (
    <div className="pb-safe">
      {/* Header */}
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-12 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold">Watch Log</h1>
            <button onClick={() => setShowLog(true)} className="bg-amber-500 text-black hover:bg-amber-400 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Log
            </button>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search titles..."
                className="w-full bg-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500" />
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className={`bg-slate-800 rounded-lg px-3 py-2 text-sm transition-colors ${showFilters || person || minRating || tags || hasNotes ? 'text-amber-400' : 'text-slate-400'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
            </button>
          </div>

          {/* Sort + has-notes quick row */}
          <div className="flex gap-2 mt-2">
            <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-medium">
              <button onClick={() => setSort('date')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${sort === 'date' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}>
                Recent
              </button>
              <button onClick={() => setSort('rating')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${sort === 'rating' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}>
                Top rated
              </button>
            </div>
            <button onClick={() => setHasNotes(n => !n)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasNotes ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-300'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
              Reviews
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {['', ...PEOPLE].map(p => (
                  <button key={p || 'all'} onClick={() => setPerson(p)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${person === p ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300'}`}>
                    {p || 'Everyone'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <select value={minRating} onChange={e => setMinRating(e.target.value)}
                  className="flex-1 bg-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                  <option value="">Any rating</option>
                  {[7,8,9,10].map(r => <option key={r} value={r}>≥ {r}/10</option>)}
                </select>
                <input value={tags} onChange={e => setTags(e.target.value)}
                  placeholder="Filter by tag..."
                  className="flex-1 bg-slate-800 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 ring-amber-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="px-4 pt-3 space-y-2">
        {viewings.map(v => <ViewingRow key={v.id} v={v} />)}
        {loading && [1,2,3].map(i => <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />)}
        {!loading && hasMore && viewings.length > 0 && (
          <button onClick={loadMore} className="w-full text-center text-sm text-slate-400 hover:text-slate-300 py-4">
            Load more
          </button>
        )}
        {!loading && viewings.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-medium">No viewings found</p>
          </div>
        )}
      </div>

      {showLog && <LogViewing onClose={() => setShowLog(false)} onSaved={() => { setShowLog(false); setPage(1); loadViewings(1, true); }} />}
    </div>
  );
}
