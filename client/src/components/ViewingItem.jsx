import { useState } from 'react';
import { api } from '../api';
import { useFamily } from '../context/FamilyContext';
import { parseJSON } from '../utils';
import { tagLabel } from '../lib/tags';

/** A single viewing on the title detail page: shows it, and edits it inline. */
export default function ViewingItem({ v, onDelete, onSaved }) {
  const { allPeople: PEOPLE, memberNames } = useFamily();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedPeople = parseJSON(v.people);
  const watcherNames = parsedPeople.map((p) => p.person);
  const existingPersonRatings = Object.fromEntries(
    parsedPeople.filter((p) => p.rating != null).map((p) => [p.person, p.rating])
  );

  const [draft, setDraft] = useState({
    date: v.date || '',
    notes: v.notes || '',
    people: watcherNames,
    personRatings: existingPersonRatings,
    pickedBy: v.picked_by || null,
    tags: parseJSON(v.tags),
  });

  const isFamilyNight = draft.tags.includes('family_movie_night');

  const dateLabel = v.date
    ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : v.date_precision === 'in_progress'
      ? 'In progress'
      : 'Date unknown';

  function startEdit() {
    setDraft({
      date: v.date || '',
      notes: v.notes || '',
      people: watcherNames,
      personRatings: existingPersonRatings,
      pickedBy: v.picked_by || null,
      tags: parseJSON(v.tags),
    });
    setEditing(true);
  }

  function togglePerson(name) {
    setDraft((d) => ({
      ...d,
      people: d.people.includes(name) ? d.people.filter((p) => p !== name) : [...d.people, name],
    }));
  }

  function setPersonRating(person, rating) {
    setDraft((d) => ({
      ...d,
      personRatings: {
        ...d.personRatings,
        [person]: d.personRatings[person] === rating ? null : rating,
      },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/api/viewings/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: draft.date || null,
          notes: draft.notes || null,
          tags: draft.tags,
          people: draft.people.map((p) => ({
            person: p,
            role: 'chooser',
            rating: draft.personRatings[p] || null,
          })),
          picked_by: draft.pickedBy || null,
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
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Date
          </label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            className="mt-1 w-full bg-slate-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500 text-slate-200"
          />
        </div>

        {/* Who chose — at the top so it's immediately reachable on mobile */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            {isFamilyNight ? 'Who chose movie night?' : 'Who chose?'}
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {memberNames.map((name) => (
              <button
                key={name}
                onClick={() =>
                  setDraft((d) => ({ ...d, pickedBy: d.pickedBy === name ? null : name }))
                }
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  draft.pickedBy === name
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Who watched */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Who watched
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PEOPLE.map((p) => (
              <button
                key={p}
                onClick={() => togglePerson(p)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  draft.people.includes(p)
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
              Ratings
            </label>
            {draft.people.map((person) => (
              <div key={person}>
                <span className="text-xs text-slate-400 mb-1 block">{person}</span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
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

        {/* Tags */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Tags
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {['family_movie_night', 'solo', 'cinema', 'plane', 'mubi', 'unfinished'].map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
                    pickedBy:
                      tag === 'family_movie_night' && !d.tags.includes(tag) ? null : d.pickedBy,
                  }))
                }
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  draft.tags.includes(tag)
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {tagLabel(tag)}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Notes
          </label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
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
          {parsedPeople.some((p) => p.rating != null) ? (
            <span className="text-amber-400 text-xs font-semibold flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {parsedPeople
                .filter((p) => p.rating != null)
                .map((p) => `${p.person} ${p.rating}`)
                .join(' · ')}
            </span>
          ) : v.rating ? (
            <span className="flex items-center gap-0.5 text-amber-400 text-sm font-semibold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {v.rating}/10
            </span>
          ) : null}
          <button
            onClick={startEdit}
            aria-label="Edit viewing"
            className="p-2 -m-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Edit viewing"
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
          <button
            onClick={() => onDelete(v.id)}
            aria-label="Delete viewing"
            className="p-2 -m-1 text-slate-400 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
      {watcherNames.length > 0 && (
        <p className="text-xs text-slate-500 mt-0.5">Watched by {watcherNames.join(', ')}</p>
      )}
      {draft.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {draft.tags.map((t) => (
            <span key={t} className="text-xs bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}
      {v.notes && <p className="text-sm text-slate-300 mt-2 italic">"{v.notes}"</p>}
    </div>
  );
}
