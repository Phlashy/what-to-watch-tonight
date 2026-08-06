import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import TitleCard from '../components/TitleCard';
import QuickAdd from '../components/QuickAdd';
import SortSelect from '../components/SortSelect';
import { useConfirm } from '../components/ConfirmDialog';
import { usePersistedState } from '../lib/usePersistedState';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SORT_OPTIONS = [
  { value: 'manual', label: 'Manual order' },
  { value: 'unwatched', label: 'Unwatched first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'year', label: 'Year (newest)' },
  { value: 'rating', label: 'Rating (highest)' },
  { value: 'recent', label: 'Recently added' },
];

/**
 * "Unwatched first": everything you haven't seen rises to the top, then the
 * watched ones in the order you saw them — longest ago first, most recent at the
 * very bottom. So the list reads as "pick from up here" and the stuff you just
 * watched gets out of the way.
 *
 * Array.prototype.sort is stable, so the unwatched block keeps the list's own
 * curated order rather than being shuffled into something arbitrary.
 */
function byUnwatchedFirst(a, b) {
  if (!a.last_watched && !b.last_watched) return 0;
  if (!a.last_watched) return -1;
  if (!b.last_watched) return 1;
  return a.last_watched.localeCompare(b.last_watched);
}

// Sort a copy for the non-manual views (manual returns the array untouched).
function sortItems(items, sort) {
  const copy = [...items];
  if (sort === 'unwatched') return copy.sort(byUnwatchedFirst);
  if (sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'year') return copy.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === 'rating') return copy.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
  if (sort === 'recent')
    return copy.sort((a, b) => (b.added_at || '').localeCompare(a.added_at || ''));
  return copy;
}

// The card body shared by both the draggable and static rows.
function RowBody({ item, onRemove, removing }) {
  return (
    <>
      <TitleCard item={item} addedBy={item.added_by} />
      <button
        onClick={() => onRemove(item.id)}
        disabled={removing === item.id}
        aria-label={`Remove ${item.title} from list`}
        className="absolute top-2 right-2 bg-slate-900/80 hover:bg-red-900/80 text-slate-400 hover:text-red-300 rounded-full p-1.5 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
      {item.note && (
        <div className="px-3 pb-2 -mt-1 text-xs text-slate-500 italic">{item.note}</div>
      )}
    </>
  );
}

// Draggable row — used only in Manual mode.
function SortableRow({ item, onRemove, removing }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.title}`}
        className="flex items-center px-1 text-slate-500 hover:text-slate-300 touch-none cursor-grab active:cursor-grabbing"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      <div className="flex-1 relative group">
        <RowBody item={item} onRemove={onRemove} removing={removing} />
      </div>
    </div>
  );
}

export default function ListDetail() {
  const confirm = useConfirm();
  const { name } = useParams();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [sort, setSort] = usePersistedState(`wtw-sort-list-${name}`, 'manual');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/lists/${name}/items`);
      const d = await res.json();
      setList(d.list);
      setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function removeItem(itemId) {
    if (
      !(await confirm({ message: 'Remove from list?', confirmLabel: 'Remove', destructive: true }))
    )
      return;
    setRemoving(itemId);
    await api(`/api/lists/${name}/items/${itemId}`, { method: 'DELETE' });
    setRemoving(null);
    loadList();
  }

  // Manual reorder (drag) — update local order and persist the new priorities.
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIdx, newIdx);
    setItems(reordered);
    const order = reordered.map((i) => i.id);
    api(`/api/lists/items/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }).catch(() => {});
  }

  if (loading)
    return (
      <div className="pb-safe">
        <div className="px-4 pt-safe space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );

  const isManual = sort === 'manual';
  const displayItems = isManual ? items : sortItems(items, sort);

  return (
    <div className="pb-safe">
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50">
        <div className="px-4 pt-safe pb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/lists"
              className="text-slate-400 hover:text-white"
              aria-label="Back to lists"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{list?.display_name}</h1>
              <p className="text-xs text-slate-500">{items.length} titles</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-amber-500 text-black rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              + Add
            </button>
          </div>
          {items.length > 1 && (
            <div className="flex justify-end mt-3">
              <SortSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS}
                label="Sort titles"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">📋</div>
            <p>This list is empty</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 bg-amber-500 text-black rounded-xl px-6 py-2 text-sm font-semibold"
            >
              Add something
            </button>
          </div>
        ) : isManual ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    onRemove={removeItem}
                    removing={removing}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          displayItems.map((item) => (
            <div key={item.id} className="relative group">
              <RowBody item={item} onRemove={removeItem} removing={removing} />
            </div>
          ))
        )}
      </div>

      {showAdd && (
        <QuickAdd
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            loadList();
          }}
        />
      )}
    </div>
  );
}
