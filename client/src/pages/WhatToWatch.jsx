import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import LogViewing from '../components/LogViewing';
import QuickAdd from '../components/QuickAdd';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Swipeable wrapper ─────────────────────────────────────────────────────────
function SwipeToRemove({ children, onDismiss }) {
  const [dx, setDx] = useState(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const isDragging = useRef(false);
  const wasDismissed = useRef(false);

  // Touch (phone)
  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  }
  function onTouchMove(e) {
    if (!isDragging.current) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff < 0) setDx(Math.max(diff, -180));
  }
  function onTouchEnd() {
    isDragging.current = false;
    if (dx < -80) { onDismiss(); } else { setDx(0); }
  }

  // Mouse (desktop)
  function onMouseDown(e) {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = true;
    wasDismissed.current = false;
  }
  function onMouseMove(e) {
    if (!isDragging.current) return;
    const diffX = e.clientX - startX.current;
    const diffY = Math.abs(e.clientY - startY.current);
    // Only swipe if clearly moving left and more horizontal than vertical
    if (diffX < 0 && Math.abs(diffX) > diffY) {
      setDx(Math.max(diffX, -180));
    } else if (diffY > 8) {
      // Vertical movement — user is dragging to reorder, cancel swipe
      isDragging.current = false;
      setDx(0);
    }
  }
  function onMouseUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dx < -80) { wasDismissed.current = true; onDismiss(); } else { setDx(0); }
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Red dismiss layer */}
      <div className="absolute inset-0 bg-red-900/70 flex items-center justify-end pr-5 rounded-xl">
        <svg className="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
        <span className="text-red-300 text-xs font-medium ml-1.5">Hide</span>
      </div>
      {/* Card */}
      <div
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.25s ease' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { if (isDragging.current) { isDragging.current = false; if (dx >= -80) setDx(0); } }}
        onClickCapture={e => { if (wasDismissed.current) { wasDismissed.current = false; e.stopPropagation(); } }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Shortlist picker popover ──────────────────────────────────────────────────
function ShortlistButton({ titleId, context, shortlistedBy = [], onToggle, currentPerson }) {
  const { allPeople: PEOPLE } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isMine = currentPerson && shortlistedBy.includes(currentPerson);
  const hasAny = shortlistedBy.length > 0;
  const starFilled = hasAny;

  function handleStarClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentPerson || (hasAny && !isMine)) {
      // No person set, or star belongs to someone else — show popover
      setOpen(o => !o);
    } else {
      // Toggle for yourself (adding to empty, or removing your own)
      onToggle(currentPerson);
    }
  }

  function handleLongPress(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(o => !o);
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={handleStarClick}
        onContextMenu={handleLongPress}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMine ? 'text-amber-400' : hasAny ? 'text-amber-600' : 'text-slate-600 hover:text-slate-400'}`}
        title={currentPerson ? `Star for ${currentPerson} (right-click for all)` : 'Shortlist for someone'}
      >
        <svg className="w-5 h-5" fill={starFilled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute right-0 bottom-10 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-xl z-20 w-44"
        >
          <p className="text-xs text-slate-500 px-1 pb-1.5 font-medium">Shortlist for:</p>
          {PEOPLE.map(p => {
            const on = shortlistedBy.includes(p);
            return (
              <button
                key={p}
                onClick={() => { onToggle(p); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${on ? 'text-amber-400 bg-amber-500/10' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill={on ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                {p}
                {p === currentPerson && <span className="ml-auto text-xs text-slate-500">you</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Title card for WhatToWatch (with swipe + shortlist + drag handle) ───────────
function WatchCard({ item, context, dismissed, onDismiss, shortlistMap, onShortlistToggle, addedBy, currentPerson }) {
  const { streamingServiceIds: MY_SERVICE_IDS } = useFamily();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  if (dismissed) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 999 : undefined,
  };

  const genres = (() => { try { return JSON.parse(item.genre || '[]'); } catch { return []; } })();
  const shortlistedBy = shortlistMap[item.id] || [];
  // Cached streaming provider icons (only show user's services)
  const myProviders = (() => {
    try {
      const wp = JSON.parse(item.watch_providers || 'null');
      if (!wp) return [];
      const all = [...(wp.flatrate || []), ...(wp.free || [])];
      const unique = [...new Map(all.map(p => [p.provider_id, p])).values()];
      return unique.filter(p => MY_SERVICE_IDS.has(p.provider_id));
    } catch { return []; }
  })();
  // Collection / owned status
  const isOwned = (() => {
    try {
      const entries = JSON.parse(item.collection_entries || '[]');
      return entries.some(e => e.format);
    } catch { return false; }
  })();

  // ShortlistButton is rendered OUTSIDE SwipeToRemove to escape its overflow-hidden clipping.
  // The card gets pr-12 so the title never hides behind the overlaid button.
  const card = (
    <Link to={`/title/${item.id}`} className="block">
      <div className="flex gap-3 bg-slate-800 rounded-xl p-3 pl-10 pr-12 active:bg-slate-700 transition-colors">
        {/* Poster */}
        <div className="flex-shrink-0">
          {item.poster_url ? (
            <img src={item.poster_url} alt={item.title} className="w-14 h-20 object-cover rounded-lg" loading="lazy" />
          ) : (
            <div className="w-14 h-20 bg-slate-700 rounded-lg flex items-center justify-center text-slate-500 text-xs font-bold">
              {item.title.split(' ').slice(0,2).map(w=>w[0]).join('')}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 leading-tight">{item.title}</h3>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400 flex-wrap">
            {item.year && <span>{item.year}</span>}
            {item.runtime_minutes && <><span>·</span><span>{item.runtime_minutes}m</span></>}
            {item.director && <><span>·</span><span className="truncate max-w-[120px]">{item.director}</span></>}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {genres.slice(0,3).map(g => (
                <span key={g} className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{g}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {isOwned && (
              <span className="text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Owned
              </span>
            )}
            {myProviders.length > 0 && (
              <div className="flex gap-1 items-center">
                {myProviders.map(p => (
                  <img key={p.provider_id} src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                    alt={p.provider_name} title={p.provider_name}
                    className="w-4 h-4 rounded-sm" loading="lazy" />
                ))}
              </div>
            )}
            {item.streaming_service && myProviders.length === 0 && !isOwned && (
              <span className="text-xs bg-blue-900/60 text-blue-300 rounded px-1.5 py-0.5 font-medium">{item.streaming_service}</span>
            )}
            {shortlistedBy.length > 0 && (
              <span className="text-xs text-amber-400 font-medium">★ {shortlistedBy.join(', ')}</span>
            )}
            {addedBy && (
              <span className="text-xs text-slate-500">{addedBy}'s pick</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <SwipeToRemove onDismiss={onDismiss}>
        {card}
      </SwipeToRemove>
      {/* Rendered outside SwipeToRemove so overflow-hidden doesn't clip the popover */}
      <div className="absolute top-2 right-2 z-30">
        <ShortlistButton
          titleId={item.id}
          context={context}
          shortlistedBy={shortlistedBy}
          onToggle={(person) => onShortlistToggle(item.id, person)}
          currentPerson={currentPerson}
        />
      </div>
      {/* Drag handle — left edge. touch-none prevents scroll conflict on mobile. */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-20"
        title="Drag to reorder"
      >
        <svg className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 6zm0 6a2 2 0 10.001 4.001A2 2 0 007 12zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 4zm0 6a2 2 0 10-.001-4.001A2 2 0 0013 10zm0 6a2 2 0 10-.001-4.001A2 2 0 0013 16z" />
        </svg>
      </div>
    </div>
  );
}

// ── Rotation badge ────────────────────────────────────────────────────────────
function RotationBadge({ rotation, onSkip, skipping }) {
  if (!rotation) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-amber-400 font-medium block">Next to choose</span>
          <span className="text-xl font-bold text-amber-300">{rotation.nextChooser}</span>
          {rotation.skipped && <span className="text-xs text-slate-500 ml-2">(skip override)</span>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-slate-500">{rotation.rotation.join(' → ')}</span>
          <button
            onClick={onSkip}
            disabled={skipping}
            className="text-xs text-slate-400 hover:text-amber-400 disabled:opacity-40 transition-colors flex items-center gap-1 bg-slate-800 rounded-full px-2.5 py-1"
          >
            Skip {rotation.nextChooser}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      {rotation.lastChooser && (
        <p className="text-xs text-slate-500 mt-1">Last chose: {rotation.lastChooser}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WhatToWatch() {
  const { currentPerson } = usePerson();
  const { contexts: CONTEXTS, memberNames: PEOPLE, streamingServiceIds: MY_SERVICE_IDS } = useFamily();
  const [context, setContext] = useState('family');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rotation, setRotation] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [randomPick, setRandomPick] = useState(null);
  const [dismissed, setDismissed] = useState(new Set()); // session-only
  const [personFilter, setPersonFilter] = useState(null); // null = All
  // shortlistMap: { titleId -> [persons] }
  const [shortlistMap, setShortlistMap] = useState({});

  useEffect(() => {
    loadItems();
    if (context === 'family') loadRotation();
  }, [context]);

  async function loadItems() {
    setLoading(true);
    setRandomPick(null);
    setDismissed(new Set());
    setPersonFilter(null);
    try {
      const res = await fetch(`/api/what-to-watch/${context}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      // Build shortlist map from inline shortlisted_by field
      const map = {};
      for (const item of list) {
        try {
          const people = JSON.parse(item.shortlisted_by || '[]').filter(Boolean);
          if (people.length) map[item.id] = people;
        } catch {}
      }
      setShortlistMap(map);
    } finally {
      setLoading(false);
    }
  }

  async function loadRotation() {
    const res = await fetch('/api/family-rotation');
    const data = await res.json();
    setRotation(data);
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      const res = await fetch('/api/family-rotation/skip', { method: 'POST' });
      const data = await res.json();
      setRotation(data);
    } finally {
      setSkipping(false);
    }
  }

  async function handleShortlistToggle(titleId, person) {
    await fetch('/api/shortlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title_id: titleId, person, context }),
    });
    // Optimistically update local state
    setShortlistMap(prev => {
      const current = prev[titleId] || [];
      const updated = current.includes(person)
        ? current.filter(p => p !== person)
        : [...current, person];
      return { ...prev, [titleId]: updated };
    });
  }

  function dismiss(id) {
    setDismissed(prev => new Set([...prev, id]));
    if (randomPick?.id === id) setRandomPick(null);
  }

  function pickRandom() {
    const pool = (context === 'family' && personFilter)
      ? items.filter(i => isAddedBy(i, personFilter))
      : items;
    const visible = pool.filter(i => !dismissed.has(i.id));
    if (!visible.length) return;
    setRandomPick(visible[Math.floor(Math.random() * visible.length)]);
  }

  // dnd-kit sensors — pointer (mouse) + touch with delay to distinguish from swipe
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  // Reorder items within a section and persist to server
  function handleSectionDragEnd(event, sectionItems) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = sectionItems.findIndex(i => i.id === active.id);
    const newIdx = sectionItems.findIndex(i => i.id === over.id);
    const reordered = arrayMove(sectionItems, oldIdx, newIdx);
    const sectionIds = new Set(sectionItems.map(i => i.id));

    // Rebuild items: replace section items in their original positions
    setItems(prev => {
      const result = [];
      let si = 0;
      for (const item of prev) {
        result.push(sectionIds.has(item.id) ? reordered[si++] : item);
      }
      return result;
    });

    // Persist — list name doesn't matter for the query, any valid name works
    const order = reordered.map(i => i.list_item_id).filter(Boolean);
    if (order.length) {
      fetch(`/api/lists/${context}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }).catch(() => {});
    }
  }

  const activeContext = CONTEXTS.find(c => c.id === context);

  // Multi-person added_by helper (handles comma-separated values)
  const isAddedBy = (item, person) => item.added_by?.split(',').map(s => s.trim()).includes(person);

  const visibleItems = (context === 'family' && personFilter)
    ? items.filter(i => isAddedBy(i, personFilter))
    : items;
  const visibleCount = visibleItems.filter(i => !dismissed.has(i.id)).length;

  // Sort: shortlisted items first (chooser's stars highest, then any star)
  const nextChooser = rotation?.nextChooser;
  function sortByShortlist(list) {
    return [...list].sort((a, b) => {
      const aByChooser = (shortlistMap[a.id] || []).includes(nextChooser) ? -2 : 0;
      const bByChooser = (shortlistMap[b.id] || []).includes(nextChooser) ? -2 : 0;
      const aByAnyone = (shortlistMap[a.id] || []).length > 0 ? -1 : 0;
      const bByAnyone = (shortlistMap[b.id] || []).length > 0 ? -1 : 0;
      return (aByChooser + aByAnyone) - (bByChooser + bByAnyone);
    });
  }
  const sortedItems = sortByShortlist(items);

  // Family two-section split: chooser's picks at top, everyone else below
  const chooserItems = (context === 'family' && nextChooser)
    ? sortByShortlist(items.filter(i => isAddedBy(i, nextChooser)))
    : [];
  const otherItems = (context === 'family' && nextChooser)
    ? sortByShortlist(items.filter(i => !isAddedBy(i, nextChooser)))
    : [];

  // Person filter (when a specific person pill is tapped)
  const personFilteredItems = (context === 'family' && personFilter)
    ? sortByShortlist(items.filter(i => isAddedBy(i, personFilter)))
    : [];

  return (
    <div className="pb-safe">
      {/* Header */}
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-12 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Tonight</h1>
              <p className="text-xs text-slate-500">What are we watching?</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(true)} className="bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add
              </button>
              <button onClick={() => setShowLog(true)} className="bg-amber-500 text-black hover:bg-amber-400 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Log
              </button>
            </div>
          </div>

          {/* Context picker */}
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {CONTEXTS.map(c => (
              <button
                key={c.id}
                onClick={() => setContext(c.id)}
                className={`flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-1.5 transition-all ${context === c.id ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                <span className="text-lg leading-none">{c.emoji}</span>
                <span className="text-xs font-semibold mt-0.5">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {context === 'family' && rotation && (
          <RotationBadge rotation={rotation} onSkip={handleSkip} skipping={skipping} />
        )}

        {/* Person filter (Family tab only) */}
        {context === 'family' && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto">
            <button
              onClick={() => setPersonFilter(null)}
              className={`flex-shrink-0 text-xs rounded-full px-3 py-1 font-medium transition-colors ${!personFilter ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              All
            </button>
            {PEOPLE.map(p => (
              <button
                key={p}
                onClick={() => setPersonFilter(personFilter === p ? null : p)}
                className={`flex-shrink-0 text-xs rounded-full px-3 py-1 font-medium transition-colors ${personFilter === p ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Subtitle + random */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-300 text-sm">
            {activeContext?.subtitle} · <span className="text-slate-500">{visibleCount} titles</span>
            {dismissed.size > 0 && <span className="text-slate-600"> ({dismissed.size} hidden)</span>}
          </h2>
          {visibleCount > 0 && (
            <button onClick={pickRandom} className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Suggest
            </button>
          )}
        </div>

        {/* Random pick */}
        {randomPick && !dismissed.has(randomPick.id) && (
          <div className="mb-4 ring-2 ring-amber-500 rounded-xl overflow-hidden">
            <div className="bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 flex justify-between">
              <span>✨ Random Pick</span>
              <button onClick={() => setRandomPick(null)} className="text-amber-600">✕</button>
            </div>
            <WatchCard
              item={randomPick}
              context={context}
              dismissed={false}
              onDismiss={() => dismiss(randomPick.id)}
              shortlistMap={shortlistMap}
              onShortlistToggle={handleShortlistToggle}
              currentPerson={currentPerson}
            />
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-medium">Nothing to watch here</p>
            <p className="text-sm mt-1">Add some titles to this list!</p>
          </div>
        ) : context === 'family' && personFilter ? (
          /* Filtered by specific person */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleSectionDragEnd(e, personFilteredItems)}>
            <SortableContext items={personFilteredItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {personFilteredItems.map(item => (
                  <WatchCard
                    key={item.id}
                    item={item}
                    context={context}
                    dismissed={dismissed.has(item.id)}
                    onDismiss={() => dismiss(item.id)}
                    shortlistMap={shortlistMap}
                    onShortlistToggle={handleShortlistToggle}
                    addedBy={item.added_by}
                    currentPerson={currentPerson}
                  />
                ))}
                {personFilteredItems.length === 0 && (
                  <div className="text-center py-10 text-slate-500">
                    <p className="font-medium">No picks from {personFilter}</p>
                    <p className="text-sm mt-1">Add a title and it'll appear here</p>
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        ) : context === 'family' && nextChooser ? (
          <>
            {/* Section 1: Chooser's picks (full opacity) */}
            {chooserItems.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{nextChooser}'s picks</span>
                  <span className="text-xs text-slate-500">· {chooserItems.filter(i => !dismissed.has(i.id)).length}</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleSectionDragEnd(e, chooserItems)}>
                  <SortableContext items={chooserItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {chooserItems.map(item => (
                        <WatchCard
                          key={item.id}
                          item={item}
                          context={context}
                          dismissed={dismissed.has(item.id)}
                          onDismiss={() => dismiss(item.id)}
                          shortlistMap={shortlistMap}
                          onShortlistToggle={handleShortlistToggle}
                          addedBy={item.added_by}
                          currentPerson={currentPerson}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Section 2: Everyone else's picks (dimmed) */}
            {otherItems.length > 0 && (
              <div className="opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Other picks</span>
                  <span className="text-xs text-slate-500">· {otherItems.filter(i => !dismissed.has(i.id)).length}</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleSectionDragEnd(e, otherItems)}>
                  <SortableContext items={otherItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {otherItems.map(item => (
                        <WatchCard
                          key={item.id}
                          item={item}
                          context={context}
                          dismissed={dismissed.has(item.id)}
                          onDismiss={() => dismiss(item.id)}
                          shortlistMap={shortlistMap}
                          onShortlistToggle={handleShortlistToggle}
                          addedBy={item.added_by}
                          currentPerson={currentPerson}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleSectionDragEnd(e, items)}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map(item => (
                  <WatchCard
                    key={item.id}
                    item={item}
                    context={context}
                    dismissed={dismissed.has(item.id)}
                    onDismiss={() => dismiss(item.id)}
                    shortlistMap={shortlistMap}
                    onShortlistToggle={handleShortlistToggle}
                    currentPerson={currentPerson}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {showLog && <LogViewing onClose={() => setShowLog(false)} onSaved={() => { setShowLog(false); loadItems(); loadRotation(); }} />}
      {showAdd && <QuickAdd onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadItems(); }} />}
    </div>
  );
}
