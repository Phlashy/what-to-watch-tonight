import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import WatchCard from './WatchCard';

/**
 * A drag-sortable list of WatchCards. Tonight renders several of these (the
 * chooser's picks, everyone else's, a person filter, or the plain list), so the
 * dnd-kit wiring lives here once instead of being repeated per section.
 *
 * `onDragEnd` receives the raw dnd event; the page maps it back to this list.
 * `showAddedBy` toggles the "X's pick" label (shown in family sections, hidden
 * in the single-list contexts). `children` renders after the cards (e.g. an
 * empty-state for a person filter).
 */
export default function WatchCardList({
  items,
  sensors,
  onDragEnd,
  dismissed,
  onDismiss,
  shortlistMap,
  onShortlistToggle,
  currentPerson,
  showAddedBy = false,
  children,
}) {
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => (
            <WatchCard
              key={item.id}
              item={item}
              dismissed={dismissed.has(item.id)}
              onDismiss={() => onDismiss(item.id)}
              shortlistMap={shortlistMap}
              onShortlistToggle={onShortlistToggle}
              addedBy={showAddedBy ? item.added_by : undefined}
              currentPerson={currentPerson}
            />
          ))}
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}
