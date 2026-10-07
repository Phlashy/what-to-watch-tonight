import { useState } from 'react';
import { useOnEscape } from '../lib/a11y';
import { resolveTitleRef, findOrCreateTitleFromTmdb, createManualTitle } from '../lib/tmdb';

/**
 * Add a title the search can't find. Two paths, one modal:
 *  - Paste a TMDB or IMDb link — if it's on TMDB we add + enrich it just like a
 *    search result. If it isn't (common for festival shorts), we keep the IMDb
 *    id and drop into the manual fields.
 *  - Type the details yourself — for titles no API knows about yet.
 *
 * @param {object}   props
 * @param {string}   [props.initialTitle] prefill the title (e.g. the failed search text)
 * @param {Function} props.onClose
 * @param {Function} props.onAdded called with the new title's id
 */
export default function ManualAddTitle({ initialTitle = '', onClose, onAdded }) {
  useOnEscape(onClose);

  const [link, setLink] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [imdbId, setImdbId] = useState('');
  const [form, setForm] = useState({
    title: initialTitle,
    type: 'movie',
    year: '',
    runtime_minutes: '',
    genre: '',
    content_rating: '',
    poster_url: '',
    synopsis: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function lookUpLink() {
    if (!link.trim()) return;
    setResolving(true);
    setError('');
    setNote('');
    try {
      const r = await resolveTitleRef(link.trim());
      if (r.found) {
        // On TMDB — add + enrich exactly like picking a search result.
        const title = await findOrCreateTitleFromTmdb({
          id: r.tmdb_id,
          media_type: r.media_type,
          title: r.title,
        });
        onAdded(title.id);
        return;
      }
      // Not on TMDB — keep the IMDb id for a later ratings backfill and let the
      // user fill in the rest by hand.
      if (r.imdb_id) setImdbId(r.imdb_id);
      setNote(
        r.imdb_id
          ? "That title isn't on TMDB yet — enter its details below. (I've kept the IMDb id so ratings can fill in later if it appears.)"
          : "That title isn't on TMDB — enter its details below."
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(false);
    }
  }

  async function save() {
    if (!form.title.trim()) {
      setError('A title is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const genre = form.genre
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      const title = await createManualTitle({
        title: form.title.trim(),
        type: form.type,
        year: form.year ? Number(form.year) : null,
        runtime_minutes: form.runtime_minutes ? Number(form.runtime_minutes) : null,
        genre: genre.length ? genre : null,
        content_rating: form.content_rating.trim() || null,
        imdb_id: imdbId || null,
        poster_url: form.poster_url.trim() || null,
        synopsis: form.synopsis.trim() || null,
      });
      onAdded(title.id);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const field =
    'w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500 placeholder:text-slate-500';
  const label = 'text-xs text-slate-400 font-medium mb-1 block';

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add a title manually"
    >
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-modal-safe">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold">Add a title</h2>
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
          <p className="text-xs text-slate-500 mb-4">
            For titles the search can't find — paste a link, or type the details in.
          </p>

          {/* Paste a link */}
          <div className="mb-4">
            <label className={label}>Paste a TMDB or IMDb link</label>
            <div className="flex gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    lookUpLink();
                  }
                }}
                placeholder="themoviedb.org/… or imdb.com/title/tt…"
                className={field}
              />
              <button
                type="button"
                onClick={lookUpLink}
                disabled={resolving || !link.trim()}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 whitespace-nowrap"
              >
                {resolving ? '…' : 'Look up'}
              </button>
            </div>
            {note && <p className="text-xs text-amber-300/90 mt-1.5">{note}</p>}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="h-px bg-slate-800 flex-1" />
            <span className="text-xs text-slate-600">or enter details</span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>

          {/* Manual fields */}
          <div className="space-y-3">
            <div>
              <label className={label}>Title *</label>
              <input value={form.title} onChange={set('title')} className={field} />
            </div>
            <div className="flex gap-2">
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-medium">
                {['movie', 'show'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`px-3 py-1.5 rounded-md capitalize transition-colors ${form.type === t ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={form.year}
                onChange={set('year')}
                inputMode="numeric"
                placeholder="Year"
                className={`${field} w-24`}
              />
              <input
                value={form.runtime_minutes}
                onChange={set('runtime_minutes')}
                inputMode="numeric"
                placeholder="Mins"
                className={`${field} w-20`}
              />
            </div>
            <div className="flex gap-2">
              <input
                value={form.genre}
                onChange={set('genre')}
                placeholder="Genres (comma-separated)"
                className={field}
              />
              <input
                value={form.content_rating}
                onChange={set('content_rating')}
                placeholder="Age (PG…)"
                className={`${field} w-28`}
              />
            </div>
            <div>
              <label className={label}>Poster URL (optional)</label>
              <input value={form.poster_url} onChange={set('poster_url')} className={field} />
            </div>
            <div>
              <label className={label}>Synopsis (optional)</label>
              <textarea
                value={form.synopsis}
                onChange={set('synopsis')}
                rows={3}
                className={`${field} resize-none`}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

          <div className="flex gap-2 mt-5">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {saving ? 'Adding…' : 'Add title'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
