# Known Issues

Last updated: 2026-03-28

## Resolved

- **SQL injection in what-to-watch query** — String interpolation replaced with parameterized queries
- **picked_by update too broad** — Now scoped to family_to_watch list only
- **Shortlist stars missing on TitleDetail** — Added standalone shortlist section
- **Shortlist toggle not optimistic** — Now updates UI immediately, reverts on failure
- **Dismissed cards lost on refresh** — Now persisted to sessionStorage
- **bug-report.md review (2026-03-28)** — 17 bugs were reported and verified; 16 of 17 were already fixed (including delete-button visibility on mobile, which uses correct mobile-first Tailwind classes). The remaining open items are tracked below.

## Open Issues

### Accessibility
- No ARIA labels on icon buttons (NavBar tabs, modal close buttons, star toggles)
- Modals lack `role="dialog"` and `aria-modal` attributes
- Cards lack semantic heading hierarchy
- No keyboard navigation support for swipe-to-dismiss or drag-and-drop

### Performance
- TitleDetail loads all viewings without pagination (fine for current data, could be an issue if a title accumulates many viewings)
- Chat AI genre/director stats parse JSON arrays in JavaScript rather than SQL
- No database index on `viewing_people.person` (would speed up person-filtered queries)

### Data Model
- `cast` is a SQL reserved word — used unquoted in some queries; works but fragile
- `tags` stored as JSON array but filtered with `LIKE` — partial string matches could produce false positives (e.g., tag "comedy" would match "dark_comedy")
- `genre` and `cast` stored as JSON strings — normalized tables would improve queryability but add complexity

### Missing Features
- Pixel avatars created (`PixelAvatar.jsx`) but not integrated into PersonPicker or NavBar
- No search bar on all pages (only on dedicated Search page)
- No persistent chat history (resets on page navigation)
- No offline support (PWA manifest only, no service worker)
- No API authentication (acceptable for local network use)

### UX
- Loading skeleton components are not shared (each page has its own inline skeleton)
- Some `console.log` statements may remain in development code
- Guest name input in PersonPicker has no max length enforcement
