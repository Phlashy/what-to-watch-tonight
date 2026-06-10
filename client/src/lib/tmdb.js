import { api } from '../api';

/**
 * Create a title in the local library from a TMDB search result and enrich it
 * with TMDB metadata (poster, cast, genres, etc.). Returns the new title's id.
 *
 * @param {object} tmdbItem - a result from /api/tmdb/search (has id, media_type, title/name)
 * @returns {Promise<number>} the created title's id
 */
export async function addTitleFromTmdb(tmdbItem) {
  const res = await api('/api/titles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: tmdbItem.title || tmdbItem.name,
      type: tmdbItem.media_type === 'tv' ? 'show' : 'movie',
    }),
  });
  const title = await res.json();
  await api(`/api/tmdb/enrich/${title.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmdb_id: tmdbItem.id }),
  });
  return title.id;
}
