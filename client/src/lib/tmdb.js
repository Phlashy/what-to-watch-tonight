import { api } from '../api';

/**
 * Get the library's title row for a TMDB search result, creating and enriching
 * it only if we don't already have it.
 *
 * The server does the find-or-create (POST /api/titles matches on tmdb_id), so
 * picking a film the library already holds returns the existing row rather than
 * a second copy of it. We pass `tmdb_id` up front for exactly that reason — the
 * old flow created the row first and attached the TMDB id afterwards, which gave
 * the server nothing to match on and is how the library ended up with two rows
 * each for Weapons, Bugonia and 22 others.
 *
 * @param {object} tmdbItem - a result from /api/tmdb/search (has id, media_type, title/name)
 * @returns {Promise<object>} the title row, with `existing: true` if it was already there
 */
export async function findOrCreateTitleFromTmdb(tmdbItem) {
  const res = await api('/api/titles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: tmdbItem.title || tmdbItem.name,
      type: tmdbItem.media_type === 'tv' ? 'show' : 'movie',
      tmdb_id: tmdbItem.id,
    }),
  });
  const title = await res.json();

  // Only enrich a row we just created. Re-enriching an existing one would
  // overwrite any hand-corrected name or type and needlessly re-queue its
  // Rotten Tomatoes / IMDb scores for a fresh OMDb pull.
  if (!title.existing) {
    await api(`/api/tmdb/enrich/${title.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdb_id: tmdbItem.id }),
    });
  }

  return title;
}

/**
 * As above, but returning just the id — for callers that only need somewhere to
 * navigate to.
 *
 * @param {object} tmdbItem
 * @returns {Promise<number>}
 */
export async function addTitleFromTmdb(tmdbItem) {
  const title = await findOrCreateTitleFromTmdb(tmdbItem);
  return title.id;
}
