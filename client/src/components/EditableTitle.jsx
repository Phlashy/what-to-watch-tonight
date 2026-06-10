import { useState, useEffect, useRef } from 'react';

/** A title heading that can be edited inline (click the pencil → type → Save). */
export default function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    await onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(value);
            }
          }}
          className="flex-1 bg-slate-800 rounded-lg px-2 py-1 text-lg font-bold outline-none focus:ring-2 ring-amber-500 min-w-0"
        />
        <button
          onClick={save}
          className="text-amber-400 hover:text-amber-300 text-xs font-semibold flex-shrink-0"
        >
          Save
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setDraft(value);
          }}
          aria-label="Cancel editing title"
          className="text-slate-500 text-xs flex-shrink-0"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <h1 className="text-xl font-bold leading-tight">{value}</h1>
      <button
        onClick={() => setEditing(true)}
        className="text-slate-500 hover:text-slate-400 flex-shrink-0"
        aria-label="Edit title"
        title="Edit title"
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
  );
}
