import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';
import EditListModal from '../components/EditListModal';
import SortSelect from '../components/SortSelect';
import { useOnEscape } from '../lib/a11y';
import { usePersistedState } from '../lib/usePersistedState';

const SORT_OPTIONS = [
  { value: 'default', label: 'Default order' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'count', label: 'Most titles' },
  { value: 'updated', label: 'Recently updated' },
];

function sortLists(lists, sort) {
  const copy = [...lists];
  if (sort === 'name') return copy.sort((a, b) => a.display_name.localeCompare(b.display_name));
  if (sort === 'count') return copy.sort((a, b) => b.item_count - a.item_count);
  if (sort === 'updated')
    return copy.sort((a, b) => (b.last_added || '').localeCompare(a.last_added || ''));
  return copy; // default: server order (creation order)
}

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
  const [showCreate, setShowCreate] = useState(false);
  const [editList, setEditList] = useState(null);
  const [sort, setSort] = usePersistedState('wtw-sort-lists', 'default');
  useOnEscape(() => setShowCreate(false));
  const [createForm, setCreateForm] = useState({ display_name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [collectionCount, setCollectionCount] = useState(null);

  function loadLists() {
    return api('/api/lists')
      .then((r) => r.json())
      .then((data) => {
        setLists(data);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadLists();
    api('/api/collection')
      .then((r) => r.json())
      .then((items) => setCollectionCount(items.length))
      .catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.display_name.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await api('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.display_name.trim().toLowerCase().replace(/\s+/g, '_'),
          display_name: createForm.display_name.trim(),
          description: createForm.description.trim() || null,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ display_name: '', description: '' });
        loadLists();
      } else {
        const err = await res.json();
        setCreateError(err.error || 'Failed to create list');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pb-safe">
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-safe pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Lists</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Title
              </button>
              <button
                onClick={() => {
                  setShowCreate(true);
                  setCreateError('');
                }}
                className="bg-amber-500 text-black hover:bg-amber-400 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                New List
              </button>
            </div>
          </div>
          {!loading && lists.length > 1 && (
            <div className="flex justify-end mt-3">
              <SortSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS}
                label="Sort lists"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {collectionCount > 0 && (
              <Link to="/collection" className="block">
                <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 hover:bg-slate-700 active:bg-slate-700 transition-colors border border-slate-700/50">
                  <svg
                    className="w-7 h-7 text-slate-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-100">My Collection</div>
                    <div className="text-xs text-slate-500">DVDs, Blu-rays & Digital</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-300">{collectionCount}</span>
                    <svg
                      className="w-4 h-4 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            )}
            {sortLists(lists, sort).map((list) => (
              <div
                key={list.id}
                className="flex items-center bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <Link
                  to={`/lists/${list.name}`}
                  className="flex items-center gap-3 flex-1 px-4 py-3 min-w-0"
                >
                  <span className="text-2xl">{list.icon || LIST_ICONS[list.name] || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 truncate">{list.display_name}</div>
                    {list.description && (
                      <div className="text-xs text-slate-500 truncate">{list.description}</div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-300 flex-shrink-0">
                    {list.item_count}
                  </span>
                </Link>
                <button
                  onClick={() => setEditList(list)}
                  aria-label={`Edit ${list.display_name}`}
                  className="px-3 py-3 text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <QuickAdd
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            loadLists();
          }}
        />
      )}

      {editList && (
        <EditListModal list={editList} onClose={() => setEditList(null)} onSaved={loadLists} />
      )}

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New list"
        >
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-modal-safe">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">New List</h2>
                <button
                  onClick={() => setShowCreate(false)}
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
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">List name</label>
                  <input
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="e.g. Date Night, Classics, Davin's Picks"
                    className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">
                    Description <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What's this list for?"
                    className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
                  />
                </div>
                {createError && <p className="text-xs text-red-400">{createError}</p>}
                <button
                  type="submit"
                  disabled={!createForm.display_name.trim() || creating}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors"
                >
                  {creating ? 'Creating…' : 'Create List'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
