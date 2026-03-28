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
