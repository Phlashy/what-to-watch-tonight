import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePerson } from '../context/PersonContext';
import { useFamily } from '../context/FamilyContext';
import { useOnEscape } from '../lib/a11y';

/** Bottom-sheet for adding/removing a title to/from lists, with a "picked by" selector. */
export default function AddToListSheet({ titleId, currentMemberships, onClose, onAdded }) {
  useOnEscape(onClose);
  const { currentPerson } = usePerson();
  const { memberNames } = useFamily();
  const [lists, setLists] = useState([]);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set((currentMemberships || []).map((l) => l.name)));
  const [removing, setRemoving] = useState(null);
  const [pickedBy, setPickedBy] = useState(currentPerson ? [currentPerson] : []);

  // Build a map of list name -> list_item_id for removal
  const membershipMap = Object.fromEntries(
    (currentMemberships || []).map((l) => [l.name, l.list_item_id])
  );

  useEffect(() => {
    api('/api/lists')
      .then((r) => r.json())
      .then(setLists);
  }, []);

  async function addToList(listName) {
    setAdding(listName);
    try {
      const res = await api(`/api/lists/${listName}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title_id: titleId,
          added_by: pickedBy.length > 0 ? pickedBy.join(',') : currentPerson || null,
        }),
      });
      if (res.ok || res.status === 409) {
        setAdded((s) => new Set([...s, listName]));
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
      await api(`/api/lists/${listName}/items/${itemId}`, { method: 'DELETE' });
      setAdded((s) => {
        const n = new Set(s);
        n.delete(listName);
        return n;
      });
      delete membershipMap[listName];
      onAdded?.();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add to list"
    >
      <div
        className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">Add to list</h2>
            <button
              onClick={onClose}
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
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-medium mb-2 block">Picked by</label>
            <div className="flex flex-wrap gap-1.5">
              {memberNames.map((name) => {
                const isSelected = pickedBy.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() =>
                      setPickedBy((prev) =>
                        isSelected ? prev.filter((p) => p !== name) : [...prev, name]
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-amber-500 text-black'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            {lists.map((list) => {
              const isOn = added.has(list.name);
              const isAdding = adding === list.name;
              const isRemoving = removing === list.name;
              return (
                <button
                  key={list.name}
                  onClick={() => (isOn ? removeFromList(list.name) : addToList(list.name))}
                  disabled={isAdding || isRemoving}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isOn
                      ? 'bg-slate-800 text-green-400 hover:text-red-400 active:scale-[0.98]'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-[0.98]'
                  }`}
                >
                  <span>{list.display_name || list.name}</span>
                  {isOn ? (
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : isAdding ? (
                    <svg
                      className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-slate-500 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
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
