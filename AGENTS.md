# AGENTS.md

Guidance for AI coding agents (Codex and others) working in this repository.

**Single source of truth: [CLAUDE.md](CLAUDE.md).** Read it in full before
making changes — project overview, tech stack, build contract, architecture
notes, hard-earned lessons, working agreements and the regression gate all
live there and are kept current. This file intentionally duplicates nothing
(the previous full copy silently drifted out of date); it only pins the
invariants agents most often violate.

## Non-negotiable invariants (details in CLAUDE.md)

1. **Build contract:** after editing any `public/js/*.js`, regenerate its
   `.min.js` (`npm run min`, or `npx terser <src> -o <min> --compress` —
   never `--mangle`) and bump the `?v=N` query string in every referencing
   template. A pre-commit hook automates this:
   `git config core.hooksPath tools/hooks`.
2. **UI i18n:** every new or changed user-facing string gets keys in ALL FOUR
   dictionaries (`public/js/i18n/`: ru/de/en/lt), rendered via `window.t()`
   in JS / `T::s()` in PHP. No hardcoded UI text. The UI language system is
   completely separate from the multi-language *content* system
   (`languages` table) — do not conflate them.
3. **Regression gate:** before changing shared mechanisms (`current` table,
   WebSocket message types, display-target resolution, cross-page Ajax
   commands) consult the impact map in `docs/deploy-checklist.md`; after
   deploying such a change, run its smoke protocol.
4. **Language conventions:** UI-facing text in Russian; code comments and
   developer documentation in English.
5. **Minimal dependencies:** no new libraries or frameworks unless essential.
6. **Never auto-edit:** `*.min.js` (generated), anything in `vendor/`,
   `database/migrate_passwords.php`; `app/config_example.php` only with
   explicit confirmation.
7. **PHP 7.2 on production** — stay within PHP 7.2 language limits.

## Working style

Pavel (sole maintainer) is technical, makes his own structural and
architectural decisions and informs the agent after the fact. The agent's
role is working implementations and bug diagnosis — not second-guessing
structural choices. He provides precise bug-reproduction steps and expects
iterative diagnosis until the bug is actually resolved — do not declare
victory prematurely.

Commit/push: standing permission — after completing any set of changes,
`git add -A`, commit, and push to BOTH remotes (`origin`, `github`) without
asking. Never commit secrets (`app/config.php` is git-ignored) or production
data dumps.
