import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const FORMAT_LABELS = { dvd: 'DVD', bluray: 'Blu-ray', digital: 'Digital' };

export default function Collection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | dvd | bluray | digital

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await api('/api/collection');
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.format === filter);

  // Group counts
  const counts = items.reduce((acc, i) => { acc[i.format] = (acc[i.format] || 0) + 1; return acc; }, {});

  return (
    <div className="pb-safe">
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-12 pb-3">
          <h1 className="text-2xl font-bold text-white">My Collection</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {items.length} title{items.length !== 1 ? 's' : ''}
            {counts.dvd ? ` · ${counts.dvd} DVD` : ''}
            {counts.bluray ? ` · ${counts.bluray} Blu-ray` : ''}
            {counts.digital ? ` · ${counts.digital} Digital` : ''}
          </p>

          {/* Filter chips */}
          {items.length > 0 && (
            <div className="flex gap-2 mt-3">
              {[['all', 'All'], ['dvd', 'DVD'], ['bluray', 'Blu-ray'], ['digital', 'Digital']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    filter === val
                      ? 'bg-amber-500 text-black'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                  {val !== 'all' && counts[val] ? ` (${counts[val]})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">📀</div>
            <p className="font-medium">{filter === 'all' ? 'No titles in your collection' : `No ${FORMAT_LABELS[filter]} titles`}</p>
            <p className="text-sm mt-1">Add titles from any title detail page.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <Link key={item.id} to={`/title/${item.title_id}`} className="block">
                <div className="flex gap-3 bg-slate-800 rounded-xl p-3 active:bg-slate-700 transition-colors">
                  <div className="flex-shrink-0">
                    {item.poster_url ? (
                      <img src={item.poster_url} alt={item.title} className="w-12 h-[4.5rem] object-cover rounded-lg" loading="lazy" />
                    ) : (
                      <div className="w-12 h-[4.5rem] bg-slate-700 rounded-lg flex items-center justify-center text-slate-500 text-xs font-bold">
                        {item.title.split(' ').slice(0, 2).map(w => w[0]).join('')}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 leading-tight">{item.title}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
                      {item.year && <span>{item.year}</span>}
                      {item.type && <><span>·</span><span className="capitalize">{item.type}</span></>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          {item.format === 'digital' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                          ) : (
                            <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>
                          )}
                        </svg>
                        {FORMAT_LABELS[item.format]}
                        {item.format === 'digital' && item.platform && <span className="text-slate-500">· {item.platform}</span>}
                      </span>
                      {item.notes && <span className="text-xs text-slate-600 truncate">{item.notes}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
