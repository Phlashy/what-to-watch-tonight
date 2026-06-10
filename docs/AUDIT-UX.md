# Audit — UX / UI (Phase 2)

**Date:** 2026-05-30
**Lens:** A new family self-hosting this app, using it mostly on phones, plus the stated ambition of a public release and an eventual native mobile product.

Severity key: 🔴 blocks or confuses a core task · 🟡 friction / polish · 🟢 nice-to-have.

---

## 1. Walkthrough of each user flow

### First run / identity (PersonPicker)

- The no-password "Who are you?" screen is a genuinely nice pattern for a shared family device, with pixel avatars and a guest field. 🟢 Good.
- 🟡 **No onboarding/empty-state guidance.** A brand-new self-hoster with an empty database lands on "Tonight" with "Nothing to watch here — Add some titles!" but no pointer to _how_ the app works (lists, contexts, logging). There's no first-run explainer.
- 🟡 **Identity is per-device, silently.** Switching person is buried behind the avatar in the nav. If two people share a phone, attribution silently goes to whoever was last selected. No visible "you are: X" affordance on most screens beyond the small avatar.
- 🟢 Guest names have a `maxLength={30}` on input but no server-side cap.

### Tonight (WhatToWatch) — the flagship screen

- Strong: context tabs, rotation badge, "chooser's picks vs other picks" split, drag-to-reorder, swipe-to-hide, per-person shortlist stars, random "Suggest".
- 🔴 **Two interaction models collide on one card.** A card is simultaneously: a link (tap → detail), a left-swipe-to-hide target, a vertical drag-to-reorder handle, and host to a star popover. On touch this is genuinely hard to get right — the code already fights it (TouchSensor 250ms delay, mouse-vs-vertical heuristics in `SwipeToRemove`). New users will trigger the wrong action. Needs either clearer affordances (explicit handles/buttons) or fewer gestures.
- 🟡 **"Hide" is ambiguous and ephemeral.** Swiping shows "Hide", persisted only to `sessionStorage`, cleared on every context switch and reload. Users won't know whether hiding is permanent, per-session, or per-device. There's no "show hidden" control beyond the count text.
- 🟡 **Rotation badge works, but the Ask tab can contradict it.** The badge ("Next to choose: X", "Last chose: Y") is driven by the `settings` counter and is **correct** (verified live: logging _Arrival_ advanced Gordon→Davin). It advances regardless of who actually chose — correct by the documented "tough luck" rule, though that can surprise. The real issue is **cross-app consistency**: the Ask/chat tab computes rotation a different (unreliable) way and can give a different answer. 🔴 for _consistency_.
- 🟡 The "Suggest" (random pick) is good but gives no way to re-roll excluding the current pick except dismissing it.
- 🟢 Skeleton loaders are present and decent.

### Logging a viewing (LogViewing modal)

- Strong: search local DB _and_ TMDB in one box, per-person ratings, "in progress" toggle, picked-by auto-set to rotation's next chooser on `family_movie_night`. This is the most polished flow.
- 🟡 **Rating model is confusing under the hood and leaks to UX.** Per-person ratings are the real model, but a legacy single `viewings.rating` is still computed ("use currentPerson's rating as group rating for backward compat; fall back to first person"). Users see per-person ratings in some places and a single number in others.
- 🟡 No validation feedback: an empty people list silently logs a viewing with no watchers; no confirmation of what was saved.
- 🟢 Modal is tall on small phones; relies on scroll. "Picked by" was moved up (good, per KNOWN-ISSUES).

### Search

- 🟡 **Search only covers the local DB, not TMDB.** The dedicated Search tab can't find a movie you haven't added yet — but LogViewing and QuickAdd _can_. Inconsistent mental model: "search" means different things in different places. A user looking to add a new title via the obvious Search tab hits a dead end ("No results for X").
- 🟢 Debounced, focuses on mount, shows total count. Good.

### Lists / ListDetail

- 🟡 **Reordering exists on Tonight but not on ListDetail.** You can drag-reorder within a context on Tonight, but the canonical list view has no reorder — priority is invisible and only editable indirectly.
- 🟡 List icons are a **hardcoded emoji map keyed by the original nine list names** (`LIST_ICONS` in `Lists.jsx`). Any list a user creates gets the generic 📋, and a self-hoster's own list names never match. Not data-driven.
- 🟡 Create-list modal derives the internal `name` client-side by lowercasing/underscoring the display name; the server _also_ sanitises. Two sources of truth; collisions surface only as a 409.
- 🟢 The Collection card surfacing at the top of Lists is a reasonable home for it.

### TitleDetail

- Strong: hero, inline-editable title, viewings with inline edit, list memberships, shortlist section, watch providers (with "my services" highlighting), collection, show progress, log button.
- 🟡 **This screen does a lot and shows it.** Five+ distinct editable subsystems stacked vertically (lists, shortlists, where-to-watch, collection, show-progress, viewings). Information hierarchy is flat — everything is a `text-xs uppercase` section header. The most common action (log a viewing) sits below several admin-ish sections.
- 🟡 **Shortlist UI has two different surfaces** on the same page (inline next to each list membership _and_ a standalone "Shortlisted" section), which can show the same data twice or disagree depending on context mapping.
- 🟡 Uses native `confirm()`/`alert()` for delete and collection-duplicate. Blocking, unstyled, jarring on mobile, and inconsistent with the otherwise custom UI.

### Watch Log

- Strong: Movies/Shows split, per-person rating display, filters (person/rating/tag/has-notes), sort, load-more, grouped show rows with status badges.
- 🟡 **Filters differ between tabs with no explanation.** Shows tab has only search; Movies tab has the full filter set. The filter button simply vanishes on the Shows tab.
- 🟡 Tag filter is a free-text box; users must know exact tag strings, and matching is substring `LIKE` (so "comedy" matches "dark_comedy").

### Ask (Chat)

- Strong: suggestion chips, clickable `[[id:Title]]` links, typing indicator, graceful "not configured / out of credits" messages.
- 🔴 **No persistent history.** Navigating away and back wipes the conversation (state only). Documented as known, but it's a real UX regression for a tab people will treat like a chat app.
- 🟡 **Chat answers about rotation can contradict the Tonight tab** (different rotation logic — see Architecture §7). A user asking "whose turn is it?" may get a different answer than the badge shows.
- 🟡 No streaming of responses; the whole reply (after up to 5 tool round-trips) appears at once, which can feel slow.

---

## 2. Mobile responsiveness

- Mobile-first throughout: bottom nav, safe-area padding utilities (`pb-safe`, `safe-bottom`, `pb-modal-safe`), `viewport-fit=cover`, sticky headers, bottom-sheet modals. 🟢 This is done well.
- 🟡 Touch-target sizes are inconsistent. Many icon buttons are `p-1`/`p-1.5` or `w-8 h-8` (~32px), below the 44px guideline the brief asks for (nav close buttons, star toggles, the drag handle, list-item remove ✕). The big primary buttons are fine.
- 🟡 The multi-gesture cards (above) are the single biggest mobile-usability risk.
- 🟢 Desktop is handled as a centered narrow column; acceptable, not optimized (lots of empty space on wide screens).

## 3. Accessibility (basics)

- 🔴 **Pervasive missing labels.** Icon-only buttons across NavBar, modals, stars, drag handles, remove buttons have no `aria-label`. Screen-reader users get unlabeled buttons.
- 🔴 **Modals are not accessible.** LogViewing/QuickAdd/TMDBPicker/AddToList lack `role="dialog"`, `aria-modal`, focus trapping, and Escape-to-close. Background remains focusable.
- 🟡 **No keyboard path** for swipe-to-hide or drag-to-reorder (dnd-kit has keyboard sensors available but they're not wired up).
- 🟡 Color-contrast: heavy use of `text-slate-500/600` on `slate-800/900` for secondary text and "hint" labels likely fails WCAG AA for small text. The amber-on-slate primary is fine.
- 🟡 No semantic headings hierarchy (section titles are styled spans/h3s inconsistently); card titles are `h3` with no surrounding landmark structure.
- 🟢 `lang="en"`, theme-color, and viewport meta are present.

## 4. Information hierarchy & navigation

- 🟢 Five-tab bottom nav (Tonight/Log/Search/Lists/Ask) + identity is intuitive and learnable.
- 🟡 **Collection is a hidden sixth destination** reachable only via a card on the Lists page (and title detail). It's a first-class feature with second-class navigation.
- 🟡 On TitleDetail and Tonight, _everything_ is the same visual weight (tiny uppercase slate headers). The eye has no anchor. Primary actions don't dominate.
- 🟡 Context labels ("Nupur", "Solo", "Davin", "Xmas") are family-private and hardcoded-feeling; for a public template the example config should model generic contexts so a new family understands the concept.

## 5. Error handling, loading & empty states

- 🟢 Loading skeletons exist on most pages (though each page reimplements its own).
- 🟡 **Empty states are thin.** "Nothing to watch here", "This list is empty", "No movies found" — functional but offer no next step except a generic add button, and no onboarding for a truly empty install.
- 🔴 **Network/server errors mostly vanish.** `api.js` throws on non-OK, but most callers wrap the call in `try { ... } finally { setLoading(false) }` with **no `catch`** — so a failed load just shows an empty screen or stale data with no error message or retry. FamilyContext is worse: if `/api/config` fails, the whole app renders `null` forever (blank screen) with only a `console.error`.
- 🟡 Server errors that aren't explicitly caught return Express's default **HTML** 500, which `api.js` can't parse into `{error}`, so the user sees a generic "Request failed".

## 6. Visual design coherence

- 🟢 Strong, consistent dark theme: slate surfaces, amber accent, rounded-xl cards, consistent chip styling. It reads as **one app**, not a patchwork — impressive for an iteratively-built project.
- 🟡 The few inconsistencies: native `confirm/alert` dialogs break the visual language; star iconography appears in three slightly different treatments; "pick"/"chosen by"/"added_by"/"picked_by" terminology varies across screens for the same concept.

---

## 7. Missing features a user would reasonably expect

The brief explicitly asks: _what else haven't we found?_ Beyond the documented backlog (persistent chat, search-everywhere, offline, pixel-avatar polish — note avatars **are** now integrated), the following are reasonable expectations that are absent or half-present:

🔴 / 🟡 **Functional gaps:**

1. **Search the catalog including not-yet-added titles** (TMDB) from the Search tab — currently only Add flows can. (🔴 dead-end as described above.)
2. **Edit a list** (rename, change description, delete a list, change its icon). You can _create_ lists but not rename or delete them anywhere in the UI.
3. **Delete a title** entirely. No UI path; titles accumulate (652 and rising, including likely dupes — there's a `dedup-titles.js` script but no in-app tooling).
4. **Reorder / set priority within ListDetail** (only Tonight reorders).
5. **Mark "watched" directly from a card** without opening the full Log modal (a one-tap "we watched this" on Tonight would match the core use case).
6. **Filter/sort the Search and Collection views** (Collection has format chips only; no sort, no search; Search has no type/genre filters).
7. **Surface where-to-watch / streaming availability on list & card views**, not just after manually expanding on TitleDetail. The data is cached on the title and _is_ shown on Tonight cards, but not on Search/ListDetail/Collection.
8. **Per-person "for me" views** — the app knows who you are but there's no "my shortlist", "my ratings", "my stats" screen (the chat can produce stats, but there's no UI surface).
9. **Episode-level logging for shows** (already noted as a future request; the show model is session-grained only).
10. **Notifications / "it's your turn" nudge** — rotation is passive; on a family device a gentle prompt would fit.
11. **Undo** for destructive actions (delete viewing, remove from list, finish-a-show-nukes-all-lists). Today these are immediate and, in the show-status case, surprisingly broad.

🟡 **Data-trust gaps a user will hit:** 12. **`finished`/`dropped` on a show removes it from _every_ list** for _everyone_ (server `show-status.js`). One person marking "finished" can silently empty a shared watchlist. _(It removes from `list_items` only — the Watch Log / viewing history is NOT affected.)_ Users won't expect a per-person status to mutate shared lists globally. 13. **Rotation is correct on Tonight but the Ask tab can disagree** — the two screens compute it from different sources. A user who asks the chat "whose turn?" may get a different answer than the badge. _(`picked_by` is populated for app-logged viewings; the earlier "no real data" claim was based on a stale dev DB and was wrong.)_

---

## 8. Top UX priorities (summary)

| #   | Issue                                                                     | Sev | Where                            |
| --- | ------------------------------------------------------------------------- | --- | -------------------------------- |
| 1   | Card gesture overload (tap/swipe/drag/star on one element)                | 🔴  | WhatToWatch                      |
| 2   | Errors silently vanish; blank-screen on config failure                    | 🔴  | api.js, all pages, FamilyContext |
| 3   | Search tab can't find un-added titles (dead end)                          | 🔴  | Search                           |
| 4   | Modals & icon buttons inaccessible (no labels/roles/focus)                | 🔴  | global                           |
| 5   | Rotation inconsistent across Tonight (correct) vs Ask (unreliable source) | 🔴  | rotation/chat                    |
| 6   | Chat history not persisted                                                | 🟡  | Chat                             |
| 7   | finished/dropped show empties all shared lists (not Watch Log), no undo   | 🟡  | show-status                      |
| 8   | Can't rename/delete lists or delete titles                                | 🟡  | Lists                            |
| 9   | Touch targets < 44px; native confirm/alert                                | 🟡  | global                           |
| 10  | Thin empty/onboarding states for fresh installs                           | 🟡  | global                           |

These feed the prioritized plan in `AUDIT-RECOMMENDATION.md`.
