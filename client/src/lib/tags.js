/**
 * Viewing tags — the single place to add or rename one.
 *
 * ADDING A TAG: put it in COMMON_TAGS below. It appears as a chip in the Log-a-
 * viewing form straight away. Use lowercase_with_underscores; the underscores are
 * rendered as spaces, so `family_film_festival` shows as "family film festival".
 * If a tag needs punctuation or capitals it can't get that way, give it an entry
 * in TAG_LABELS.
 *
 * Tags are stored on the viewing as a JSON array of these keys, so **renaming a
 * key orphans existing data** — every viewing already tagged keeps the old
 * string. Change the label, not the key, unless you also mean to migrate.
 *
 * `family_movie_night` is deliberately absent: it drives the choosing rotation
 * and has its own prominent toggle in the form, rather than being buried among
 * the incidental tags.
 */

export const COMMON_TAGS = [
  'solo',
  'cinema',
  'plane',
  'mubi',
  'viff',
  'christmas',
  'birthday',
  'curacao',
  'unfinished',
  'family_film_festival_2026',
];

/** Tags whose display name can't be derived by swapping underscores for spaces. */
const TAG_LABELS = {
  family_film_festival_2026: 'family film festival — 2026',
};

/**
 * How a tag should read on screen.
 * @param {string} tag stored tag key
 * @returns {string}
 */
export function tagLabel(tag) {
  return TAG_LABELS[tag] || String(tag).replace(/_/g, ' ');
}
