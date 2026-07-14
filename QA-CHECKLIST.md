# Manual QA Checklist

This checklist covers scenarios that have caused real bugs in the past. Run it after any
non-trivial change, and always before a Pi deployment.

The automated test suite (`npm test`) covers server-side data logic. This checklist covers
UI behaviour, mobile UX, and cross-cutting flows that tests can't easily reach.

> **Multiple instances:** the code runs as more than one independent instance
> (see [DEPLOYMENT.md](docs/DEPLOYMENT.md#running-more-than-one-instance)). A
> shared-code change is deployed to **every** instance, so after such a deploy,
> run at least the **Smoke Test** and **§11 Instance Configuration** against
> *each* instance's URL — not only the primary one. A change that looks fine on
> the instance you develop against can still break another (e.g. one has the Ask
> tab disabled, or a password gate the other lacks).

---

## Before You Start

```bash
npm test          # must be 0 failures
npm run build     # must complete with no errors (client/)
```

---

## 1. Deployment Integrity

> **Root cause of past bugs:** `client/dist/` wasn't in git, so the Pi was silently serving
> a stale build while the DB was up-to-date. Always verify the client version after deploying.

- [ ] After `git pull && pm2 restart` on the Pi, open the app in a browser
- [ ] Confirm a recently added feature or visible change is present (not a cached old version)
- [ ] Check the browser console — no 404s for JS/CSS assets
- [ ] Check that the Movies / Shows toggle is visible on the WatchLog page (good version sentinel)

---

## 2. TMDB Search (All Entry Points)

> **Root cause of past bugs:** (1) `QuickAdd` had no `type` param → movie-only results.
> (2) Parallel movie+tv results were returned movies-first, burying TV shows.
> (3) TMDB's `/search/multi` ranked by global popularity, so niche TV shows disappeared.

### Log a Viewing modal

- [ ] Open "Log a Viewing" from any title detail page or from the + button
- [ ] Type a TV show title (e.g. "Dark", "Hollow Crown", "Good Girl's Guide to Murder")
- [ ] Confirm the TV show appears in the "From TMDB" results with a "· TV" badge
- [ ] Confirm it appears near the **top**, not buried after a list of movies

### Add to Watch List modal (QuickAdd)

- [ ] Open Lists → "Add Title"
- [ ] Search for a TV show (e.g. "Succession")
- [ ] Confirm the TV show appears with a "· TV" badge
- [ ] Confirm all lists (including "Shows to Watch") appear in the list picker after selecting a result

### Fix TMDB (TMDBPicker)

- [ ] Open any title → "Fix TMDB" button
- [ ] Confirm you can toggle between "Movie" and "TV Show" search types
- [ ] Confirm results change appropriately

---

## 3. Logging a Viewing — Mobile Form Order

> **Root cause of past bug:** "Who chose?" was positioned after the per-person ratings grid
> (10 buttons × N people), making it unreachable on mobile without heavy scrolling.

- [ ] Open "Log a Viewing" on a **phone** (or narrow browser window)
- [ ] Confirm field order from top: **Title search → Date → Picked by → Who watched → Ratings → Tags → Notes**
- [ ] Confirm "Picked by" is visible without scrolling on a typical phone screen

---

## 4. Editing a Viewing — Mobile Form Order

> Same root cause as above, in the TitleDetail inline edit form.

- [ ] On any title with viewings, tap the edit (pencil) icon on a viewing
- [ ] Confirm field order: **Date → Who chose? → Who watched → Ratings → Tags → Notes**
- [ ] Confirm "Who chose?" is visible immediately without scrolling

---

## 5. Family Movie Night Rotation

> **Root cause of past bug:** `viewing_people.role` was always 'chooser' for everyone,
> so the rotation query couldn't determine who actually picked the film.
> Fixed by storing `picked_by` on the viewing row itself.

- [ ] Log a viewing tagged `family_movie_night`
- [ ] Confirm the "Who chose Movie Night?" picker auto-selects the rotation's next person
- [ ] After saving, confirm the rotation badge on the What To Watch page advances to the next person

---

## 6. Collection ("Own it")

> **Root cause of past bug:** The only way to add a DVD/digital copy was a tiny unlabelled
> disc icon hidden inside the streaming providers section — only visible after loading providers.

- [ ] Open any title detail page that has **not** had streaming providers loaded
- [ ] Confirm "Own it" is visible in the action buttons row (alongside "Add to list")
- [ ] Tap "Own it" → select Digital → confirm a platform text field appears
- [ ] Type "Apple" → save → confirm the item appears as "Apple" on the title page
- [ ] Confirm you can remove the item (× button)

---

## 7. TV Show Status Tracking

- [ ] Open a title with `type = show`
- [ ] Confirm "Show Progress" section is present with Wishlist / Watching / Finished / Dropped pills for each person
- [ ] Set a person's status to "Watching" → confirm it persists on reload
- [ ] Set status to "Finished" → confirm the show disappears from any watchlist it was on
- [ ] Tap the active pill again → confirm it clears (toggles off)

---

## 8. WatchLog — Movies / Shows Split

- [ ] Open WatchLog
- [ ] Confirm Movies and Shows tabs are present
- [ ] Movies tab: shows individual viewings with dates and ratings
- [ ] Shows tab: shows sessions grouped by title (not individual viewings), with session count and last-watched date
- [ ] Filters (person, rating) apply to the Movies tab; Shows tab shows all shows

---

## 9. Lists — Create & QuickAdd

- [ ] Open Lists page
- [ ] Confirm two header buttons: "Add Title" (grey) and "New List" (amber)
- [ ] Tap "New List" → enter a name → confirm it appears in the list immediately
- [ ] Tap "Add Title" → confirm QuickAdd opens and shows **all** lists including any dynamically created ones (e.g. "Shows to Watch", "Tuesday Night Movie Night")

---

## 10. PWA Home Screen Update Behaviour

> **Root cause of past bug:** iOS cached `index.html` with a 1-year immutable header.
> Fixed by: `index: false` on express.static, plus a service worker using network-first for navigation.

- [ ] Deploy a change with a visible UI difference
- [ ] On a phone with the home screen shortcut, open the app
- [ ] Confirm the new UI change is visible (if not, the service worker isn't running — the user needs to remove and re-add the shortcut once)
- [ ] On second and subsequent opens, confirm the app always shows the latest version

---

## 11. Instance Configuration (per instance, after a shared-code deploy)

> Each instance is defined entirely by its `.env` + `family.config.json`. This
> section confirms an instance is still *itself* after a shared-code deploy —
> run it against **each** instance's own URL.

- [ ] The person picker shows **this instance's** family members, with their avatars
- [ ] The rotation banner names this instance's rotation order (not another instance's)
- [ ] Lists/contexts match this instance's config
- [ ] **Password gate:** on a password-protected instance, a fresh browser (or
      incognito) is challenged before any data loads, and the correct password unlocks it
- [ ] **Ask tab:** present on instances *with* an Anthropic key; **absent** on
      instances without one (it should not appear-then-error)
- [ ] No cross-contamination: data added here does not appear on the other instance

---

## Smoke Test (Run After Any Deployment)

Quick pass through the main flows (per instance after a shared-code deploy):

- [ ] What To Watch page loads, shows titles for the current person's context
- [ ] Tap a title → TitleDetail page loads with poster, metadata, viewings
- [ ] Log a Viewing → save → viewing appears in TitleDetail
- [ ] WatchLog → both Movies and Shows tabs load
- [ ] Lists page → all lists visible with correct counts
- [ ] Search → typing returns results
- [ ] Chat → ask a simple question → response returns _(skip on instances with the Ask tab disabled)_
