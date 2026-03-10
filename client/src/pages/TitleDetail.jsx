import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import LogViewing from '../components/LogViewing';
import TMDBPicker from '../components/TMDBPicker';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';

function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function ViewingItem({ v, onDelete, onSaved }) {
  const { allPeople: PEOPLE } = useFamily();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedPeople = (() => { try { return JSON.parse(v.people || '[]'); } catch { return []; } })();
  const tags = (() => { try { return JSON.parse(v.tags || '[]'); } catch { return []; } })();
  const watcherNames = parsedPeople.map(p => p.person);
  // Per-person ratings from existing data
  const existingPersonRatings = Object.fromEntries(
    parsedPeople.filter(p => p.rating != null).map(p => [p.person, p.rating])
  );

  const [draft, setDraft] = useState({
    date: v.date || '',
    notes: v.notes || '',
    people: watcherNames,
    personRatings: existingPersonRatings,
  });

  const dateLabel = v.date
    ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : v.date_precision === 'in_progress' ? 'In progress' : 'Date unknown';

  function startEdit() {
    setDraft({ date: v.date || '', notes: v.notes || '', people: watcherNames, personRatings: existingPersonRatings });
    setEditing(true);
  }

  function togglePerson(name) {
    setDraft(d => ({
      ...d,
      people: d.people.includes(name) ? d.people.filter(p => p !== name) : [...d.people, name],
    }));
  }

  function setPersonRating(person, rating) {
    setDraft(d => ({
      ...d,
      personRatings: { ...d.personRatings, [person]: d.personRatings[person] === rating ? null : rating },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/viewings/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: draft.date || null,
          notes: draft.notes || null,
          people: draft.people.map(p => ({ person: p, role: 'chooser', rating: draft.personRatings[p] || null })),
        }),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-slate-800 rounded-xl p-3 space-y-3">
        {/* Date */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Date</label>
          <input
            type="date"
            value={draft.date}
            onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
            className="mt-1 w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200"
          />
        </div>

        {/* Who watched */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Who watched</label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PEOPLE.map(p => (
              <button
                key={p}
                onClick={() => togglePerson(p)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  draft.people.includes(p) ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Per-person ratings */}
        {draft.people.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">Ratings</label>
            {draft.people.map(person => (
              <div key={person}>
                <span className="text-xs text-slate-400 mb-1 block">{person}</span>
                <div className="flex flex-wrap gap-2">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      onClick={() => setPersonRating(person, n)}
                      className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                        draft.personRatings[person] === n
                          ? 'bg-amber-500 text-black'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Notes</label>
          <textarea
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="Add a note or review…"
            rows={3}
            className="mt-1 w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200 placeholder:text-slate-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold py-2 rounded-lg text-sm transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-300">{dateLabel}</span>
        <div className="flex items-center gap-2">
          {/* Per-person ratings (preferred) or group rating (legacy) */}
          {parsedPeople.some(p => p.rating != null) ? (
            <span className="text-amber-400 text-xs font-semibold flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              {parsedPeople.filter(p => p.rating != null).map(p => `${p.person} ${p.rating}`).join(' · ')}
            </span>
          ) : v.rating ? (
            <span className="flex items-center gap-0.5 text-amber-400 text-sm font-semibold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              {v.rating}/10
            </span>
          ) : null}
          <button onClick={startEdit} className="text-slate-600 hover:text-slate-300 transition-colors" title="Edit viewing">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => onDelete(v.id)} className="text-slate-600 hover:text-red-400 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {watcherNames.length > 0 && (
        <p className="text-xs text-slate-500 mt-0.5">
          Watched by {watcherNames.join(', ')}
        </p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tags.map(t => <span key={t} className="text-xs bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">{t.replace(/_/g, ' ')}</span>)}
        </div>
      )}
      {v.notes && <p className="text-sm text-slate-300 mt-2 italic">"{v.notes}"</p>}
    </div>
  );
}

// Inline editable title
function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) { setEditing(false); setDraft(value); return; }
    await onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
          className="flex-1 bg-slate-800 rounded-lg px-2 py-1 text-lg font-bold outline-none focus:ring-2 ring-amber-500 min-w-0"
        />
        <button onClick={save} className="text-amber-400 hover:text-amber-300 text-xs font-semibold flex-shrink-0">Save</button>
        <button onClick={() => { setEditing(false); setDraft(value); }} className="text-slate-500 text-xs flex-shrink-0">✕</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <h1 className="text-xl font-bold leading-tight">{value}</h1>
      <button onClick={() => setEditing(true)} className="text-slate-600 hover:text-slate-400 flex-shrink-0" title="Edit title">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
    </div>
  );
}

function AddToListSheet({ titleId, currentMemberships, onClose, onAdded }) {
  const { currentPerson } = usePerson();
  const [lists, setLists] = useState([]);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set((currentMemberships || []).map(l => l.name)));
  const [removing, setRemoving] = useState(null);

  // Build a map of list name -> list_item_id for removal
  const membershipMap = Object.fromEntries((currentMemberships || []).map(l => [l.name, l.list_item_id]));

  useEffect(() => {
    fetch('/api/lists').then(r => r.json()).then(setLists);
  }, []);

  async function addToList(listName) {
    setAdding(listName);
    try {
      const res = await fetch(`/api/lists/${listName}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: titleId, added_by: currentPerson || null }),
      });
      if (res.ok || res.status === 409) {
        setAdded(s => new Set([...s, listName]));
        onAdded?.();
      }
    } finally {
      setAdding(null);
    }
  }

  async function removeFromList(listName) {
    const itemId = membershipMap[listName];
    if (!itemId) return;
    setRemoving(listName);
    try {
      await fetch(`/api/lists/${listName}/items/${itemId}`, { method: 'DELETE' });
      setAdded(s => { const n = new Set(s); n.delete(listName); return n; });
      delete membershipMap[listName];
      onAdded?.();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">Add to list</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="space-y-2">
            {lists.map(list => {
              const isOn = added.has(list.name);
              const isAdding = adding === list.name;
              const isRemoving = removing === list.name;
              return (
                <button key={list.name}
                  onClick={() => isOn ? removeFromList(list.name) : addToList(list.name)}
                  disabled={isAdding || isRemoving}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isOn
                      ? 'bg-slate-800 text-green-400 hover:text-red-400 active:scale-[0.98]'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-[0.98]'
                  }`}>
                  <span>{list.display_name || list.name}</span>
                  {isOn ? (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : isAdding ? (
                    <svg className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  ) : (
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddToCollectionForm({ onSave, onClose, saving }) {
  const [format, setFormat] = useState('dvd');
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="bg-slate-800 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Add to Collection</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex gap-2">
        {[['dvd', 'DVD'], ['bluray', 'Blu-ray'], ['digital', 'Digital']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFormat(val)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              format === val ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {format === 'digital' && (
        <input
          value={platform}
          onChange={e => setPlatform(e.target.value)}
          placeholder="iTunes, Google Play, etc."
          className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200 placeholder:text-slate-500"
        />
      )}
      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200 placeholder:text-slate-500"
      />
      <button
        onClick={() => onSave(format, platform, notes)}
        disabled={saving}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold py-2 rounded-lg text-sm transition-colors"
      >
        {saving ? 'Adding…' : 'Add to Collection'}
      </button>
    </div>
  );
}

export default function TitleDetail() {
  const { allPeople: PEOPLE, listToContext: LIST_TO_CONTEXT, streamingServiceIds: MY_SERVICE_IDS } = useFamily();
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [showTMDB, setShowTMDB] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [watchProviders, setWatchProviders] = useState(null);
  const [watchProvidersUpdatedAt, setWatchProvidersUpdatedAt] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [editingAddedBy, setEditingAddedBy] = useState(null); // list_item_id being edited
  const { currentPerson } = usePerson();

  useEffect(() => { loadTitle(); }, [id]);

  async function toggleShortlist(person, context) {
    await fetch('/api/shortlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title_id: Number(id), person, context }),
    });
    // Update local state
    setTitle(t => {
      if (!t) return t;
      const shortlists = t.shortlists || [];
      const existing = shortlists.find(s => s.person === person && s.context === context);
      return {
        ...t,
        shortlists: existing
          ? shortlists.filter(s => !(s.person === person && s.context === context))
          : [...shortlists, { person, context }],
      };
    });
  }

  async function loadTitle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/titles/${id}`);
      const data = await res.json();
      setTitle(data);
      // Load cached watch providers if available
      if (data.watch_providers) {
        try { setWatchProviders(JSON.parse(data.watch_providers)); } catch {}
        setWatchProvidersUpdatedAt(data.watch_providers_updated_at);
      } else {
        setWatchProviders(null);
        setWatchProvidersUpdatedAt(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchWatchProviders(refresh = false) {
    setLoadingProviders(true);
    try {
      const res = await fetch(`/api/tmdb/watch-providers/${id}${refresh ? '?refresh=true' : ''}`);
      const data = await res.json();
      setWatchProviders(data.watch_providers);
      setWatchProvidersUpdatedAt(data.watch_providers_updated_at);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function addToCollection(format, platform, notes) {
    setAddingToCollection(true);
    try {
      const res = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: title.id, format, platform: platform || null, notes: notes || null }),
      });
      if (res.ok) {
        setShowAddToCollection(false);
        loadTitle();
      } else if (res.status === 409) {
        alert(`This title already has a ${format === 'bluray' ? 'Blu-ray' : format.toUpperCase()} entry in the collection.`);
      }
    } finally {
      setAddingToCollection(false);
    }
  }

  async function removeFromCollection(collectionId) {
    if (!confirm('Remove from collection?')) return;
    await fetch(`/api/collection/${collectionId}`, { method: 'DELETE' });
    loadTitle();
  }

  async function updateAddedBy(listName, listItemId, people) {
    const added_by = people.length ? people.join(',') : null;
    await fetch(`/api/lists/${listName}/items/${listItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ added_by }),
    });
    setTitle(t => ({
      ...t,
      listMemberships: t.listMemberships.map(l =>
        l.list_item_id === listItemId ? { ...l, added_by } : l
      ),
    }));
  }

  async function saveTitle(newName) {
    await fetch(`/api/titles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newName }),
    });
    setTitle(t => ({ ...t, title: newName }));
  }

  async function deleteViewing(viewingId) {
    if (!confirm('Delete this viewing?')) return;
    await fetch(`/api/viewings/${viewingId}`, { method: 'DELETE' });
    loadTitle();
  }

  if (loading) return (
    <div className="pb-safe px-4 pt-16">
      <div className="bg-slate-800 rounded-2xl h-48 animate-pulse mb-4" />
      <div className="space-y-3">
        {[1,2].map(i => <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />)}
      </div>
    </div>
  );

  if (!title) return <div className="px-4 pt-16 text-slate-400">Not found</div>;

  const cast = (() => { try { return JSON.parse(title.cast || '[]'); } catch { return []; } })();
  const genres = (() => { try { return JSON.parse(title.genre || '[]'); } catch { return []; } })();
  // Collect all per-person ratings across all viewings; fall back to group rating
  const allRatings = (title.viewings || []).flatMap(v => {
    const vp = (() => { try { return JSON.parse(v.people || '[]'); } catch { return []; } })();
    const personRatings = vp.map(p => p.rating).filter(r => r != null);
    return personRatings.length > 0 ? personRatings : (v.rating ? [v.rating] : []);
  });
  const avgRating = allRatings.length
    ? (allRatings.reduce((s, r) => s + r, 0) / allRatings.length).toFixed(1)
    : null;

  return (
    <div className="pb-safe">
      {/* Hero */}
      <div className="relative">
        {title.poster_url && (
          <div className="h-56 overflow-hidden">
            <img src={title.poster_url} alt={title.title} className="w-full h-full object-cover object-top opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 pt-14">
          <button onClick={() => navigate(-1)} className="bg-slate-900/80 backdrop-blur rounded-full p-2 text-slate-300 hover:text-white flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>

        <div className={`px-4 ${title.poster_url ? 'absolute bottom-0 left-0 right-0 pb-4' : 'pt-16 pb-4'}`}>
          <div className="flex items-end gap-3">
            {title.poster_url && (
              <img src={title.poster_url} alt={title.title} className="w-20 h-28 object-cover rounded-xl shadow-lg flex-shrink-0 border-2 border-slate-700" />
            )}
            <div className="flex-1 min-w-0">
              <EditableTitle value={title.title} onSave={saveTitle} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm text-slate-400">
                {title.year && <span>{title.year}</span>}
                {title.runtime_minutes && <><span>·</span><span>{title.runtime_minutes}m</span></>}
                {avgRating && (
                  <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    {avgRating}
                  </span>
                )}
              </div>
              {title.director && <p className="text-xs text-slate-500 mt-0.5">dir. {title.director}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`px-4 ${title.poster_url ? 'mt-4' : 'mt-0'} space-y-4`}>
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {genres.map(g => <span key={g} className="text-xs bg-slate-800 text-slate-300 rounded-full px-2.5 py-1">{g}</span>)}
          </div>
        )}

        {title.synopsis && (
          <p className="text-sm text-slate-400 leading-relaxed">{title.synopsis}</p>
        )}

        {cast.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cast</h3>
            <p className="text-sm text-slate-300">{cast.join(', ')}</p>
          </div>
        )}

        {title.listMemberships?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">On Lists</h3>
            <div className="space-y-1.5">
              {title.listMemberships.map(l => {
                const currentPeople = l.added_by ? l.added_by.split(',').map(s => s.trim()) : [];
                const ctx = LIST_TO_CONTEXT[l.name];
                const shortlistedBy = ctx ? (title.shortlists || []).filter(s => s.context === ctx).map(s => s.person) : [];
                const isMeStarred = currentPerson && shortlistedBy.includes(currentPerson);
                const hasAnyStar = shortlistedBy.length > 0;
                return (
                  <div key={l.list_item_id || l.name} className="relative">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/lists/${l.name}`}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-full px-2.5 py-1 transition-colors">
                        {l.display_name}
                        {l.streaming_service && <span className="text-slate-500"> · {l.streaming_service}</span>}
                      </Link>
                      {ctx && (
                        <button
                          onClick={() => currentPerson && toggleShortlist(currentPerson, ctx)}
                          className={`transition-colors ${isMeStarred ? 'text-amber-400' : hasAnyStar ? 'text-amber-600' : 'text-slate-600 hover:text-slate-400'}`}
                          title={hasAnyStar ? `Starred by ${shortlistedBy.join(', ')}` : 'Star this'}
                        >
                          <svg className="w-4 h-4" fill={hasAnyStar ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                      )}
                      {hasAnyStar && (
                        <span className="text-xs text-amber-500/70">{shortlistedBy.join(', ')}</span>
                      )}
                      <button
                        onClick={() => setEditingAddedBy(editingAddedBy === l.list_item_id ? null : l.list_item_id)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {currentPeople.length > 0
                          ? currentPeople.map(p => `${p}'s pick`).join(', ')
                          : 'set picker'}
                      </button>
                    </div>
                    {editingAddedBy === l.list_item_id && (
                      <div className="mt-1.5 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-xl flex flex-wrap gap-1.5">
                        {PEOPLE.map(person => {
                          const isSelected = currentPeople.includes(person);
                          return (
                            <button
                              key={person}
                              onClick={() => {
                                const updated = isSelected
                                  ? currentPeople.filter(p => p !== person)
                                  : [...currentPeople, person];
                                updateAddedBy(l.name, l.list_item_id, updated);
                              }}
                              className={`text-xs rounded-full px-2.5 py-1 font-medium transition-colors ${
                                isSelected
                                  ? 'bg-amber-500 text-black'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            >
                              {person}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Where to Watch / Collection */}
        {(title.tmdb_id || title.collection?.length > 0) ? (
          <div>
            {(watchProviders || title.collection?.length > 0) ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Where to Watch</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddToCollection(true)}
                      className="text-slate-600 hover:text-slate-300 transition-colors"
                      title="I own this"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    {watchProvidersUpdatedAt && (
                      <>
                        <span className="text-xs text-slate-600">{relativeTime(watchProvidersUpdatedAt)}</span>
                        <button
                          onClick={() => fetchWatchProviders(true)}
                          disabled={loadingProviders}
                          className="text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-50"
                          title="Refresh availability"
                        >
                          <svg className={`w-3.5 h-3.5 ${loadingProviders ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {showAddToCollection && (
                  <div className="mb-3">
                    <AddToCollectionForm
                      onSave={addToCollection}
                      onClose={() => setShowAddToCollection(false)}
                      saving={addingToCollection}
                    />
                  </div>
                )}
                {/* Owned media */}
                {title.collection?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {title.collection.map(c => (
                      <div key={c.id} className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 group/col">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          {c.format === 'digital' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                          ) : (
                            <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>
                          )}
                        </svg>
                        <span className="text-sm text-slate-300">
                          {c.format === 'dvd' ? 'DVD' : c.format === 'bluray' ? 'Blu-ray' : c.platform || 'Digital'}
                        </span>
                        {c.notes && <span className="text-xs text-slate-600">· {c.notes}</span>}
                        <button onClick={() => removeFromCollection(c.id)} className="text-slate-700 hover:text-red-400 ml-0.5 sm:opacity-0 sm:group-hover/col:opacity-100 transition-opacity" title="Remove">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {watchProviders && (() => {
                  const stream = [...(watchProviders.flatrate || []), ...(watchProviders.free || [])];
                  const rentBuy = [...(watchProviders.rent || []), ...(watchProviders.buy || [])];
                  // Deduplicate by provider_id
                  const uniqueStream = [...new Map(stream.map(p => [p.provider_id, p])).values()];
                  const uniqueRentBuy = [...new Map(rentBuy.map(p => [p.provider_id, p])).values()];
                  // Sort: user's services first
                  const sortProviders = (a, b) => (MY_SERVICE_IDS.has(b.provider_id) ? 1 : 0) - (MY_SERVICE_IDS.has(a.provider_id) ? 1 : 0);
                  uniqueStream.sort(sortProviders);
                  uniqueRentBuy.sort(sortProviders);

                  if (uniqueStream.length === 0 && uniqueRentBuy.length === 0) {
                    return <p className="text-sm text-slate-500 italic">Not currently available for streaming in Canada</p>;
                  }
                  return (
                    <div className="space-y-3">
                      {uniqueStream.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {uniqueStream.map(p => (
                            <div key={p.provider_id} className="flex flex-col items-center gap-1" title={p.provider_name}>
                              <img
                                src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                alt={p.provider_name}
                                className={`w-9 h-9 rounded-lg ${MY_SERVICE_IDS.has(p.provider_id) ? 'ring-2 ring-green-500/60' : 'ring-1 ring-slate-700'}`}
                              />
                              <span className={`text-[10px] leading-tight text-center max-w-[3.5rem] truncate ${MY_SERVICE_IDS.has(p.provider_id) ? 'text-green-400' : 'text-slate-500'}`}>
                                {p.provider_name.replace(/ Amazon Channel$/, '')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {uniqueRentBuy.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-600 mb-1.5">Rent / Buy</p>
                          <div className="flex flex-wrap gap-2">
                            {uniqueRentBuy.map(p => (
                              <div key={p.provider_id} className="flex flex-col items-center gap-1" title={p.provider_name}>
                                <img
                                  src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                  alt={p.provider_name}
                                  className="w-8 h-8 rounded-lg ring-1 ring-slate-700"
                                />
                                <span className="text-[10px] leading-tight text-center max-w-[3.5rem] truncate text-slate-500">
                                  {p.provider_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {watchProviders && (
                <div className="flex items-center justify-between mt-2">
                  {watchProviders.link && (
                    <a href={watchProviders.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      View on TMDB
                    </a>
                  )}
                  <span className="text-[10px] text-slate-700">Data by JustWatch</span>
                </div>
                )}
              </div>
            ) : title.tmdb_id ? (
              <button
                onClick={() => fetchWatchProviders()}
                disabled={loadingProviders}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loadingProviders ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    Checking…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Where to watch?
                  </>
                )}
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collection</h3>
              <button
                onClick={() => setShowAddToCollection(true)}
                className="text-slate-600 hover:text-slate-300 transition-colors"
                title="I own this"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            {showAddToCollection && (
              <AddToCollectionForm
                onSave={addToCollection}
                onClose={() => setShowAddToCollection(false)}
                saving={addingToCollection}
              />
            )}
          </div>
        )}

        {/* Action buttons row */}
        <div className="flex gap-2">
          <button onClick={() => setShowAddToList(true)}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            Add to list
          </button>
          <button
            onClick={() => setShowTMDB(true)}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {title.tmdb_id ? 'Fix TMDB' : 'Find on TMDB'}
          </button>
          {title.tmdb_id && (
            <a
              href={`https://www.themoviedb.org/${title.type === 'show' ? 'tv' : 'movie'}/${title.tmdb_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center"
              title="View on TMDB"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          )}
        </div>

        {/* Log viewing */}
        <button onClick={() => setShowLog(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Log a Viewing
        </button>

        {/* Viewings */}
        {title.viewings?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Viewings ({title.viewings.length})
            </h3>
            <div className="space-y-2">
              {title.viewings.map(v => (
                <ViewingItem key={v.id} v={v} onDelete={deleteViewing} onSaved={loadTitle} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showLog && (
        <LogViewing
          titleId={title.id}
          titleName={title.title}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); loadTitle(); }}
        />
      )}

      {showAddToList && (
        <AddToListSheet
          titleId={title.id}
          currentMemberships={title.listMemberships}
          onClose={() => setShowAddToList(false)}
          onAdded={() => loadTitle()}
        />
      )}

      {showTMDB && (
        <TMDBPicker
          titleId={title.id}
          initialQuery={title.title}
          titleType={title.type}
          onClose={() => setShowTMDB(false)}
          onEnriched={() => { setShowTMDB(false); loadTitle(); }}
        />
      )}
    </div>
  );
}
