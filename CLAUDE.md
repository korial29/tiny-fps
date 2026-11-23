# tiny-fps

The shared agent instructions live in `AGENTS.md`. This file adds Claude Code
rules that keep each session's token use down. `.claude/settings.json` enforces
the file exclusions and quiet test output; these rules cover the rest.

@AGENTS.md

## Reading the repo

- Never read a whole file over 500 lines. Most of `src/client` is 1 000 to
  2 700 lines (`body.ts`, `skin.ts`, `xeno.ts`, `armor.ts`, `render.ts`…).
  Find the symbol with Grep (`-n`), then Read only that range with
  `offset` and `limit`.
- The docs are long (`docs/WEAPON.md` about 120 KB, `docs/ARCHITECTURE.md`
  80 KB, `docs/MOON.md` 55 KB, `docs/PERFORMANCE.md` 30 KB). List the headings
  first with `grep -n '^#' docs/<file>.md`, then read the section you need.
- Never read or grep the generated Base64 files in `src/client/voice/`
  (`mp3.ts`, `opus.ts`, `cast-mp3.ts`, `cast-opus.ts`, about 1 MB). When you
  search the tree from Bash, pass `--exclude-dir=voice` or
  `-g '!src/client/voice/**'`.
- Ask before exploring broadly. A precise target ("the jaw in `skin.ts`")
  beats a scan of `src/client`.

## Running checks

- Run the narrowest tests first: `npx vitest run <test files>`. Run
  `npm run test:ci` only before committing. Never run `npm test` unless the user
  asks for coverage: its coverage table floods the context.
- Delegate the full suite, `npm run lint`, `npm run build && npm run size`,
  `npm run test:durations` and bot matches (`npm run botmatch`) to the
  `checker` subagent. It returns only the failures.
- When a test fails, read the failing assertion and the code under test. Don't
  rerun the whole file with more logging before you have a hypothesis.

## Visual iteration on 3D work

- Take screenshots at 800 × 450 unless the change needs detail; crop to the
  object under work for close views. One screenshot per iteration, not one per
  angle, unless the user asks for several.
- Before a long modelling loop, state the target (proportions, vertex budget
  per level of detail, what the screenshot should show) so each iteration is
  checked against it.
- Keep scratch scripts (benchmarks, screenshot harnesses) in the scratchpad and
  reuse them across iterations instead of rewriting them.

## Session hygiene

- When a task is done and the next one is unrelated, suggest `/clear` to the
  user rather than carrying the old context forward.
- Work in small steps: one change, its test, then the next. Stop and ask when
  the approach turns out wrong instead of patching on top.

## Compact instructions

When compacting, keep: the current task and its acceptance criteria, files
changed and why, failing tests and their errors, measured vertex counts and
frame times, and the user's decisions. Drop: file contents already saved,
passing test output, screenshots already judged, and exploration that led
nowhere.
