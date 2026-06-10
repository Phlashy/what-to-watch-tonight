import { useState } from 'react';

/** Inline form for adding a title to the physical/digital collection. */
export default function AddToCollectionForm({ onSave, onClose, saving }) {
  const [format, setFormat] = useState('dvd');
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="bg-slate-800 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
          Add to Collection
        </span>
        <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="flex gap-2">
        {[
          ['dvd', 'DVD'],
          ['bluray', 'Blu-ray'],
          ['digital', 'Digital'],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFormat(val)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              format === val
                ? 'bg-amber-500 text-black'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {format === 'digital' && (
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="Apple, Google Play, Vudu, etc."
          className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200 placeholder:text-slate-500"
        />
      )}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
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
