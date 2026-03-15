import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';

const LIST_ICONS = {
  family_to_watch: '👨‍👩‍👧‍👦',
  with_nupur: '💑',
  adult_movies: '🎭',
  adult_shows: '📺',
  solo_gordon: '🎬',
  arianne_100_family: '🌟',
  davin_gordon_shows: '👦',
  christmas: '🎄',
  casey_brothers_recs: '🤝',
};

export default function Lists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [collectionCount, setCollectionCount] = useState(null);

  useEffect(() => {
    api('/api/lists')
      .then(r => r.json())
      .then(data => { setLists(data); setLoading(false); });
    api('/api/collection')
      .then(r => r.json())
      .then(items => setCollectionCount(items.length))
      .catch(() => {});
  }, []);

  return (
    <div className="pb-safe">
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-12 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Lists</h1>
            <button onClick={() => setShowAdd(true)} className="bg-amber-500 text-black hover:bg-amber-400 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {collectionCount > 0 && (
              <Link to="/collection" className="block">
                <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 hover:bg-slate-700 active:bg-slate-700 transition-colors border border-slate-700/50">
                  <svg className="w-7 h-7 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-100">My Collection</div>
                    <div className="text-xs text-slate-500">DVDs, Blu-rays & Digital</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-300">{collectionCount}</span>
                    <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </Link>
            )}
            {lists.map(list => (
              <Link key={list.id} to={`/lists/${list.name}`} className="block">
                <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 hover:bg-slate-700 active:bg-slate-700 transition-colors">
                  <span className="text-2xl">{LIST_ICONS[list.name] || '📋'}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-100">{list.display_name}</div>
                    {list.description && <div className="text-xs text-slate-500">{list.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-300">{list.item_count}</span>
                    <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showAdd && <QuickAdd onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); api('/api/lists').then(r => r.json()).then(setLists); }} />}
    </div>
  );
}
