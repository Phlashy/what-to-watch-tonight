import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import TitleCard from '../components/TitleCard';
import QuickAdd from '../components/QuickAdd';

export default function ListDetail() {
  const { name } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState(null);

  useEffect(() => { loadList(); }, [name]);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${name}/items`);
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(itemId) {
    if (!confirm('Remove from list?')) return;
    setRemoving(itemId);
    await fetch(`/api/lists/${name}/items/${itemId}`, { method: 'DELETE' });
    setRemoving(null);
    loadList();
  }

  if (loading) return (
    <div className="pb-safe">
      <div className="px-4 pt-16 space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />)}
      </div>
    </div>
  );

  const { list, items = [] } = data || {};

  return (
    <div className="pb-safe">
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-12 pb-4">
          <div className="flex items-center gap-3">
            <Link to="/lists" className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{list?.display_name}</h1>
              <p className="text-xs text-slate-500">{items.length} titles</p>
            </div>
            <button onClick={() => setShowAdd(true)} className="bg-amber-500 text-black rounded-full px-3 py-1.5 text-xs font-semibold">
              + Add
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">📋</div>
            <p>This list is empty</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 bg-amber-500 text-black rounded-xl px-6 py-2 text-sm font-semibold">
              Add something
            </button>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="relative group">
              <TitleCard item={item} addedBy={item.added_by} />
              <button
                onClick={() => removeItem(item.id)}
                disabled={removing === item.id}
                className="absolute top-2 right-2 bg-slate-900/80 hover:bg-red-900/80 text-slate-400 hover:text-red-300 rounded-full p-1.5 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              {item.note && (
                <div className="px-3 pb-2 -mt-1 text-xs text-slate-500 italic">{item.note}</div>
              )}
            </div>
          ))
        )}
      </div>

      {showAdd && <QuickAdd onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadList(); }} />}
    </div>
  );
}
