import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import LogViewing from '../components/LogViewing';
import QuickAdd from '../components/QuickAdd';
import ErrorState from '../components/ErrorState';
import WatchCard from '../components/WatchCard';
import WatchCardList from '../components/WatchCardList';
import RotationBadge from '../components/RotationBadge';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';
import { parseJSON } from '../utils';
import { PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';

export default function WhatToWatch() {
  const { currentPerson } = usePerson();
  const { contexts: CONTEXTS, memberNames: PEOPLE } = useFamily();
  const [context, setContext] = useState('family');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [rotation, setRotation] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [randomPick, setRandomPick] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return new Set(parseJSON(sessionStorage.getItem('wtw-dismissed')));
    } catch {
      return new Set();
    }
  });
  const [personFilter, setPersonFilter] = useState(null); // null = All
  // shortlistMap: { titleId -> [persons] }
  const [shortlistMap, setShortlistMap] = useState({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    setRandomPick(null);
    // Note: hidden cards persist across context switches (kept in sessionStorage),
    // so they don't reappear just because you change tabs and come back.
    setPersonFilter(null);
    try {
      const res = await api(`/api/what-to-watch/${context}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      // Build shortlist map from inline shortlisted_by field
      const map = {};
      for (const item of list) {
        const people = parseJSON(item.shortlisted_by).filter(Boolean);
        if (people.length) map[item.id] = people;
      }
      setShortlistMap(map);
    } catch {
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const loadRotation = useCallback(async () => {
    const res = await api('/api/family-rotation');
    const data = await res.json();
    setRotation(data);
  }, []);

  useEffect(() => {
    loadItems();
    if (context === 'family') loadRotation();
  }, [context, loadItems, loadRotation]);

  async function handleSkip() {
    setSkipping(true);
    try {
      const res = await api('/api/family-rotation/skip', { method: 'POST' });
      const data = await res.json();
      setRotation(data);
    } finally {
      setSkipping(false);
    }
  }

  async function handleShortlistToggle(titleId, person) {
    // Optimistically update local state before the API call
    const prev = shortlistMap[titleId] || [];
    const updated = prev.includes(person) ? prev.filter((p) => p !== person) : [...prev, person];
    setShortlistMap((m) => ({ ...m, [titleId]: updated }));

    try {
      await api('/api/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: titleId, person, context }),
      });
    } catch {
      // Revert on failure
      setShortlistMap((m) => ({ ...m, [titleId]: prev }));
    }
  }

  function dismiss(id) {
    setDismissed((prev) => {
      const next = new Set([...prev, id]);
      try {
        sessionStorage.setItem('wtw-dismissed', JSON.stringify([...next]));
      } catch {}
      return next;
    });
    if (randomPick?.id === id) setRandomPick(null);
  }

  function pickRandom() {
    const pool =
      context === 'family' && personFilter
        ? items.filter((i) => isAddedBy(i, personFilter))
        : items;
    const visible = pool.filter((i) => !dismissed.has(i.id));
    if (!visible.length) return;
    setRandomPick(visible[Math.floor(Math.random() * visible.length)]);
  }

  // dnd-kit sensors — pointer (mouse), touch (with delay), and keyboard (a11y reorder)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Reorder items within a section and persist to server
  function handleSectionDragEnd(event, sectionItems) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = sectionItems.findIndex((i) => i.id === active.id);
    const newIdx = sectionItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(sectionItems, oldIdx, newIdx);
    const sectionIds = new Set(sectionItems.map((i) => i.id));

    // Rebuild items: replace section items in their original positions
    setItems((prev) => {
      const result = [];
      let si = 0;
      for (const item of prev) {
        result.push(sectionIds.has(item.id) ? reordered[si++] : item);
      }
      return result;
    });

    const order = reordered.map((i) => i.list_item_id).filter(Boolean);
    if (order.length) {
      api(`/api/lists/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }).catch(() => {});
    }
  }

  const activeContext = CONTEXTS.find((c) => c.id === context);

  // Multi-person added_by helper (handles comma-separated values)
  const isAddedBy = (item, person) =>
    item.added_by
      ?.split(',')
      .map((s) => s.trim())
      .includes(person);

  const visibleItems =
    context === 'family' && personFilter ? items.filter((i) => isAddedBy(i, personFilter)) : items;
  const visibleCount = visibleItems.filter((i) => !dismissed.has(i.id)).length;

  // Sort: shortlisted items first (chooser's stars highest, then any star)
  const nextChooser = rotation?.nextChooser;
  function sortByShortlist(list) {
    return [...list].sort((a, b) => {
      const aByChooser = (shortlistMap[a.id] || []).includes(nextChooser) ? -2 : 0;
      const bByChooser = (shortlistMap[b.id] || []).includes(nextChooser) ? -2 : 0;
      const aByAnyone = (shortlistMap[a.id] || []).length > 0 ? -1 : 0;
      const bByAnyone = (shortlistMap[b.id] || []).length > 0 ? -1 : 0;
      return aByChooser + aByAnyone - (bByChooser + bByAnyone);
    });
  }

  // Family two-section split: chooser's picks at top, everyone else below
  const chooserItems =
    context === 'family' && nextChooser
      ? sortByShortlist(items.filter((i) => isAddedBy(i, nextChooser)))
      : [];
  const otherItems =
    context === 'family' && nextChooser
      ? sortByShortlist(items.filter((i) => !isAddedBy(i, nextChooser)))
      : [];

  // Person filter (when a specific person pill is tapped)
  const personFilteredItems =
    context === 'family' && personFilter
      ? sortByShortlist(items.filter((i) => isAddedBy(i, personFilter)))
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
                Add
              </button>
              <button
                onClick={() => setShowLog(true)}
                className="bg-amber-500 text-black hover:bg-amber-400 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                Log
              </button>
            </div>
          </div>

          {/* Context picker */}
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {CONTEXTS.map((c) => (
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
            {PEOPLE.map((p) => (
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
            {activeContext?.subtitle} ·{' '}
            <span className="text-slate-500">{visibleCount} titles</span>
            {dismissed.size > 0 && (
              <span className="text-slate-500"> ({dismissed.size} hidden)</span>
            )}
          </h2>
          {visibleCount > 0 && (
            <button
              onClick={pickRandom}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Suggest
            </button>
          )}
        </div>

        {/* Random pick */}
        {randomPick && !dismissed.has(randomPick.id) && (
          <div className="mb-4 ring-2 ring-amber-500 rounded-xl overflow-hidden">
            <div className="bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 flex justify-between">
              <span>✨ Random Pick</span>
              <button onClick={() => setRandomPick(null)} className="text-amber-600">
                ✕
              </button>
            </div>
            <WatchCard
              item={randomPick}
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
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message="Couldn’t load tonight’s list." onRetry={loadItems} />
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-medium">Nothing to watch here</p>
            <p className="text-sm mt-1">Add some titles to this list!</p>
          </div>
        ) : context === 'family' && personFilter ? (
          /* Filtered by specific person */
          <WatchCardList
            items={personFilteredItems}
            sensors={sensors}
            onDragEnd={(e) => handleSectionDragEnd(e, personFilteredItems)}
            dismissed={dismissed}
            onDismiss={dismiss}
            shortlistMap={shortlistMap}
            onShortlistToggle={handleShortlistToggle}
            currentPerson={currentPerson}
            showAddedBy
          >
            {personFilteredItems.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                <p className="font-medium">No picks from {personFilter}</p>
                <p className="text-sm mt-1">Add a title and it'll appear here</p>
              </div>
            )}
          </WatchCardList>
        ) : context === 'family' && nextChooser ? (
          <>
            {/* Section 1: Chooser's picks (full opacity) */}
            {chooserItems.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    {nextChooser}'s picks
                  </span>
                  <span className="text-xs text-slate-500">
                    · {chooserItems.filter((i) => !dismissed.has(i.id)).length}
                  </span>
                </div>
                <WatchCardList
                  items={chooserItems}
                  sensors={sensors}
                  onDragEnd={(e) => handleSectionDragEnd(e, chooserItems)}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                  shortlistMap={shortlistMap}
                  onShortlistToggle={handleShortlistToggle}
                  currentPerson={currentPerson}
                  showAddedBy
                />
              </div>
            )}

            {/* Section 2: Everyone else's picks (dimmed) */}
            {otherItems.length > 0 && (
              <div className="opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Other picks
                  </span>
                  <span className="text-xs text-slate-500">
                    · {otherItems.filter((i) => !dismissed.has(i.id)).length}
                  </span>
                </div>
                <WatchCardList
                  items={otherItems}
                  sensors={sensors}
                  onDragEnd={(e) => handleSectionDragEnd(e, otherItems)}
                  dismissed={dismissed}
                  onDismiss={dismiss}
                  shortlistMap={shortlistMap}
                  onShortlistToggle={handleShortlistToggle}
                  currentPerson={currentPerson}
                  showAddedBy
                />
              </div>
            )}
          </>
        ) : (
          <WatchCardList
            items={items}
            sensors={sensors}
            onDragEnd={(e) => handleSectionDragEnd(e, items)}
            dismissed={dismissed}
            onDismiss={dismiss}
            shortlistMap={shortlistMap}
            onShortlistToggle={handleShortlistToggle}
            currentPerson={currentPerson}
          />
        )}
      </div>

      {showLog && (
        <LogViewing
          onClose={() => setShowLog(false)}
          onSaved={() => {
            setShowLog(false);
            loadItems();
            loadRotation();
          }}
        />
      )}
      {showAdd && (
        <QuickAdd
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            loadItems();
          }}
        />
      )}
    </div>
  );
}
