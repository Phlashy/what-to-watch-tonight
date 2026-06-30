import { useState } from 'react';
import { api } from '../api';
import { useConfirm } from './ConfirmDialog';
import { useOnEscape } from '../lib/a11y';

const ICON_CHOICES = [
  '📋',
  '👨‍👩‍👧‍👦',
  '💑',
  '🎭',
  '📺',
  '🎬',
  '🌟',
  '👦',
  '👧',
  '🎄',
  '🤝',
  '🍿',
  '❤️',
  '⭐',
  '🏆',
  '🎯',
  '🎃',
  '👻',
  '🚀',
  '🐉',
  '🧙',
  '🎸',
  '📚',
  '😂',
];

/** Edit a list: rename, change description/icon, or delete it. */
export default function EditListModal({ list, onClose, onSaved }) {
  useOnEscape(onClose);
  const confirm = useConfirm();
  const [displayName, setDisplayName] = useState(list.display_name || '');
  const [description, setDescription] = useState(list.description || '');
  const [icon, setIcon] = useState(list.icon || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await api(`/api/lists/${list.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          description: description.trim() || null,
          icon: icon || null,
        }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete "${list.display_name}"?`,
      message:
        'This removes the list and its memberships. Your titles and viewing history are kept.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/api/lists/${list.name}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit list"
    >
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Edit List</h2>
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
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">List name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                autoFocus
                className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">
                Description <span className="text-slate-500">(optional)</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((em) => (
                  <button
                    type="button"
                    key={em}
                    onClick={() => setIcon(em)}
                    aria-label={`Icon ${em}`}
                    className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors ${
                      icon === em
                        ? 'bg-amber-500/20 ring-2 ring-amber-500'
                        : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!displayName.trim() || saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="px-4 py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
