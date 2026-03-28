# Code Review, QA & Stabilization

## Context

This project may have gone through several rounds of bug fixing where each fix introduced regressions to previously working features. The goal of this session is to stabilize the codebase, establish automated testing, and set up practices that prevent this from happening again. The project may be deployed on a Raspberry Pi.

**Do not start fixing anything until the full review is complete and you have a comprehensive plan.**

---

## Phase 1: Audit (Read Everything First)

Before changing a single line of code:

1. **Read every file in the project.** Understand the full architecture and how modules depend on each other.

2. **Create a dependency map.** Document which files import/call/depend on which other files. Identify tight coupling (where changing one module is likely to break another).

3. **Create a feature inventory.** List every feature that currently exists and its status:
   - ✅ Working correctly
   - ⚠️ Partially working (describe what's broken)
   - ❌ Broken (describe the bug)
   - 🔇 Not yet implemented

4. **Identify root causes, not symptoms.** For each bug, trace it back to the actual root cause. Many bugs that look separate often share a root cause (e.g., a shared state mutation, a timing issue, a data flow mismatch). Group related bugs together.

5. **Review existing documentation for staleness and overlap.** Check that docs like README, ARCHITECTURE, and KNOWN-ISSUES are accurate and not redundant with each other. Flag any that need updating or removal.

6. **Write up the full audit as `AUDIT.md`** in the project root before proceeding.

---

## Phase 2: Test Harness (Before Any Fixes)

Create automated tests that capture the current expected behavior. This is the safety net that prevents regressions.

### 2a. Set up the test framework

- Use a lightweight test framework appropriate to the project (e.g., Node's built-in `node:test` + `node:assert`, or Vitest if already in use — keep dependencies minimal)
- Create a `/tests` directory
- Add a `test` script to package.json (e.g., `npm test`)
- Run both `npm test` and `npm run build` (if a build step exists) to verify the project compiles cleanly, not just that tests pass

### 2b. Write tests for core systems

Prioritize tests for the things that kept breaking. Adapt these categories to the project:

**Data layer:**
- Database queries return expected results
- Data mutations (create, update, delete) work correctly and are idempotent where expected
- Data validation and constraints are enforced
- Edge cases: empty results, missing records, duplicate entries

**API / routing:**
- Each endpoint returns correct status codes and response shapes
- Authentication and authorization are enforced where required
- Error responses are consistent and informative
- Query parameters and request bodies are validated

**Business logic:**
- Core algorithms produce correct output for known inputs
- State transitions follow expected rules
- Calculations and transformations are accurate
- Edge cases and boundary conditions are handled

**UI / client-side:**
- Components render correctly with expected data
- User interactions (clicks, form submissions) trigger correct behavior
- Loading, empty, and error states display properly
- Navigation and routing work as expected

**Integration points:**
- External API calls are handled correctly (including failures and timeouts)
- Real-time features (WebSockets, polling) sync state correctly
- File system operations (reads, writes) work reliably

### 2c. Write integration tests

- Full user flow: the most common path a user takes through the application end-to-end
- Multi-user scenarios (if applicable): concurrent usage, shared state consistency

### 2d. Run all tests and document results

- Every test should PASS against current behavior (even if that behavior has bugs — we're capturing the baseline)
- For known bugs: write the test to expect the CORRECT behavior, mark it as a known failure, and note what it should do once fixed

---

## Phase 3: Fix Bugs (The Disciplined Way)

Now fix bugs, but follow this protocol for EVERY fix:

### The Fix Protocol

```
FOR EACH BUG:
1. Identify the specific test(s) that cover this bug
   - If no test exists yet, WRITE ONE FIRST that demonstrates the bug (it should fail)
2. Trace the root cause (don't just fix the symptom)
3. Make the MINIMAL change needed to fix the root cause
4. Run the FULL test suite (not just the test for this bug)
5. If any other test breaks:
   - STOP. Do not proceed.
   - Understand why the fix caused a regression
   - Find a fix approach that resolves the bug WITHOUT breaking other tests
6. Only move to the next bug when ALL tests pass
7. After every 3 bugs fixed, do a manual smoke test of the full application flow
```

### Fix Priority Order

1. **Crashes and errors** — anything that prevents the application from running
2. **Data integrity issues** — anything that corrupts, loses, or misrepresents data
3. **Core functionality** — the primary features users depend on
4. **Secondary features** — supporting features and workflows
5. **UI/display issues** — visual glitches, layout problems, responsive design
6. **Polish** — animations, transitions, copy, minor UX improvements

---

## Phase 4: Code Quality Review

After all bugs are fixed and tests pass, review the codebase for quality:

### Architecture
- Is there clear separation of concerns (e.g., data access, business logic, routing, UI)?
- Are there any circular dependencies?
- Is shared code (constants, types, utility functions) properly centralized?
- Could a new developer understand the codebase in 30 minutes?

### Common Anti-Patterns to Look For
- **Shared mutable state** between modules (the #1 cause of "fix one thing, break another")
- **Magic numbers/strings** instead of named constants
- **Mixed concerns** (e.g., database queries inside route handlers, business logic in UI components)
- **Missing error handling** (especially in async code, network requests, and file operations)
- **Inconsistent data formats** (e.g., dates as strings in some places and objects in others)
- **Race conditions** in async code or concurrent operations
- **Copy-pasted code** that should be a shared function

### Refactor if necessary
- Extract shared constants to a dedicated file
- Ensure application state is immutable or has controlled mutation points
- Make sure server-side logic and client-side rendering are cleanly separated
- Add JSDoc comments to all public functions

---

## Phase 5: Documentation

Create or update these files:

### README.md
- How to install and run (step by step, assume the reader is not a developer)
- How to use the application
- Configuration and environment setup
- Deployment instructions (including Raspberry Pi if applicable)

### ARCHITECTURE.md
- System overview with a text diagram
- Module responsibilities (one paragraph per file/module)
- Data flow: how a user action flows through the system (client → server → database → response)
- Key design decisions and trade-offs

### CONTRIBUTING.md (Best Practices for Future Development)

This is the most important document. It establishes the rules for all future work on this and other projects:

```markdown
# Development Best Practices

## The Golden Rules

1. **Never fix a bug without a test.** Before fixing anything, write a test that
   demonstrates the bug. The test should fail. Fix the bug. The test should pass.
   All other tests should still pass.

2. **Run the full test suite after every change.** Not just the test you're working
   on. Every test. If anything breaks, stop and understand why before proceeding.

3. **Make minimal changes.** The smallest fix that solves the problem is the best fix.
   Resist the urge to refactor while bug-fixing — those are separate tasks.

4. **Understand before you change.** Read the code around the bug. Understand why it
   was written that way. The previous approach may have been protecting something
   you can't see yet.

5. **One concern per commit.** Each commit should do ONE thing: fix one bug, add one
   feature, refactor one module. Never mix them.

## Adding a New Feature

1. Write a brief spec: what does it do, how does the user interact with it?
2. Identify which modules need to change
3. Write tests for the expected behavior first
4. Implement the feature
5. Run full test suite
6. Manual testing
7. Commit

## Bug Fix Checklist

- [ ] I can reproduce the bug reliably
- [ ] I have written a test that demonstrates the bug
- [ ] I have identified the root cause (not just the symptom)
- [ ] My fix is the minimal change needed
- [ ] All tests pass after my fix (not just the new one)
- [ ] I have manually tested the application flow
- [ ] I have not changed any code unrelated to this bug

## Code Style

- Use `const` by default, `let` when reassignment is needed, never `var`
- All functions have JSDoc comments explaining params and return values
- Constants live in a dedicated file, not scattered as magic numbers
- Application state is only modified through defined functions, never directly
- Error handling on all async operations and network events
- Console.log statements are removed before committing (use a debug flag instead)

## Working with Claude Code

When asking Claude Code to make changes:

1. **Always provide the test results** so it knows what's passing and failing
2. **Ask it to run `npm test` after every change** and share the results
3. **If a fix breaks other tests, tell it to revert and try a different approach**
4. **Ask it to explain what it changed and why** — if the explanation doesn't make
   sense, the fix probably isn't right
5. **After all fixes, ask: "Would you be confident showing this code to a senior
   engineer? Is there anything you'd be embarrassed by?"** — this is a surprisingly
   effective prompt for getting Code to self-review
6. **Never commit without running the full test suite first**
```

---

## Phase 6: Final Verification

1. Run the full test suite — everything should pass
2. Start the application and manually test the primary user flow — everything should work
3. Test from multiple devices/browsers if applicable
4. Test on mobile if the application has a mobile UI
5. Test edge cases:
   - Unexpected or missing input
   - Concurrent usage (multiple users/tabs)
   - Network interruption or slow connections
   - Empty states (no data, first-time user)
   - Boundary conditions (very large inputs, special characters)
6. Document any remaining known issues in a `KNOWN-ISSUES.md` file

---

## Deliverables Checklist

When this session is complete, the project should have:

- [ ] `AUDIT.md` — full codebase audit with feature inventory
- [ ] `/tests/` directory with comprehensive test suite
- [ ] All identified bugs fixed without regressions
- [ ] `README.md` — setup and usage instructions
- [ ] `ARCHITECTURE.md` — system documentation
- [ ] `CONTRIBUTING.md` — development best practices and methodology
- [ ] `KNOWN-ISSUES.md` — any remaining issues documented
- [ ] Clean, well-commented, modular code
- [ ] `npm test` runs all tests and passes

## Important Reminders

- **Do NOT skip Phase 1 and 2.** The audit and test harness are not optional. They are what prevent the whack-a-mole cycle from repeating.
- **Do NOT batch fixes.** One bug at a time, full test suite between each.
- **If you're unsure whether a change is safe, ask yourself: "What else depends on the thing I'm changing?"** If you don't know the answer, read more code before making the change.
- **The goal is a codebase we're proud of, not just one that works.** Quality matters because this project will be built on for months.
