---
name: repo-mirror
description: Understand and operate Melvin's local GitHub mirror — sync repos with real timestamps, serve them read-only over HTTP, render the dashboard, and run magpie surveys that pick work worth doing. Use when asked to sync/mirror repos, refresh the dashboard, run a survey, or work across the estate.
---

# repo-mirror

This repo (`melvincarvalho/productivity`) holds the tooling for a **local
mirror of Melvin's entire GitHub world** and the system built on top of it.
If you are a new agent, read this first — it is the map.

## The whole system in one picture

```
GitHub  ──gh-sync.sh──►  ~/remote/github.com/<owner>/<repo>   (the mirror, ~1100 repos)
                                    │  dir mtime = repo's last push time
                                    ├──gh-index.js──►  index.html   (dashboard + worklist panel)
                                    ├──jss (pm2)────►  http://localhost:5445  (read-only HTTP + git)
                                    └──magpie───────►  melvincarvalho/magpie/  (surveys → worklist)
```

Everything is plain files on disk. The mirror is the substrate; the server
makes it browsable; magpie decides what's worth working on.

## The pieces

**`scripts/gh-sync.sh`** — clones every repo Melvin owns plus every repo in
every org he belongs to into `~/remote/github.com/<owner>/<repo>`. Idempotent
(skips repos already on disk; `--update` fast-forwards). Throttled with a
`--delay` between clones. After each clone it sets file mtimes to each file's
last commit and the repo dir mtime to the repo's `pushed_at`. Flags:
`--update`, `--dry-run`, `--no-forks`, `--no-archived`, `--no-private`.

**`scripts/gh-index.js`** — scans the mirror and writes
`~/remote/github.com/index.html`: stat tiles, a last-activity histogram, a
searchable/sortable repo list (full inventory embedded as JSON in
`<script id="data">`), and a **worklist panel** that fetches
`melvincarvalho/magpie/worklist.json` when present. Zero deps. Re-run anytime.

**The server** — `jss` (JavaScriptSolidServer) under pm2, app name
`github-mirror`:
`jss start --root ~/remote/github.com --public --read-only --git --host 0.0.0.0 --port 5445`.
Serves the mirror at http://localhost:5445 . `--public` skips auth AND never
writes into the served dir; `--read-only` rejects writes; `--git` enables
`git clone http://localhost:5445/<owner>/<repo>`. `pm2 save` persists it.

**`melvincarvalho/magpie`** — the survey system. Its own `SKILL.md`
(also at http://localhost:5445/melvincarvalho/magpie/SKILL.md) is the
authoritative spec for schemas, scoring, the ledger, and the hard rules.
Read it before running a survey.

**The write sidecar** — `magpie-serve.mjs` under pm2, app name `magpie-serve`,
bound to `127.0.0.1:5446`. The mirror server is read-only, so this tiny
localhost-only endpoint is the ONLY writer of `decisions.json`: it appends one
entry (append-only) and reruns `refresh-worklist.mjs`. The dashboard's
pin/unpin buttons POST to it; they only appear when `/health` is reachable, so
LAN viewers get a clean read-only view. `pm2 save` persists it.

## Hard-won facts (don't rediscover these)

- **jss returns 403 for any dotfile path** ("Dotfile access is not allowed").
  So `.git/*` is NOT fetchable over HTTP — per-repo scratchpads in
  `.git/magpie.json` are filesystem-only; anything the dashboard must read
  lives in the magpie repo (which IS served).
- **The mirror contains private repos.** gh-sync clones everything visible,
  including private org repos. The server is `--public`, so on 0.0.0.0 those
  are exposed to the LAN. Known private clones were catalogued during setup;
  future syncs can use `--no-private`. Never put private-repo details into a
  ledger that gets pushed to a public remote.
- **`pushed_at` can be null** (never-pushed repos). gh-sync uses a `-`
  placeholder and skips the `touch`; a null once crashed the whole run under
  `set -e`. Don't reintroduce a bare `touch -d "$pushed"`.
- **Some clones are empty** (0 git objects) — repos that were empty at first
  clone and got content later. gh-sync doesn't yet detect+re-fetch these;
  the first survey flagged `nanoblog` and `liwi`. A real gh-sync bug to fix.
- **Screenshots**: this box runs chromium as a snap; it can't write into
  `/tmp`. Screenshot into a dir under `$HOME` and clean up.

## Running a survey (what magpie does)

Full spec is in the magpie SKILL.md; the shape that worked:

1. **Taste first.** Read every entry of `melvincarvalho/magpie/decisions.json`.
   Rejected patterns must not resurface; accepted patterns score higher.
2. **Inventory, no API.** Parse the `<script id="data">` JSON out of
   `~/remote/github.com/index.html` for the repo list + freshness.
3. **Shallow score** all candidates (recency, missing README/LICENSE, has
   package.json). Pick a cohort of ~25 to deep-read; rotate cohorts across
   runs so the whole estate gets covered over time.
4. **Fan out.** Spawn ~5 subagents, ~5 repos each, in parallel. Each reads
   code/docs/git-log at filesystem speed, finds CONCRETE checkable items
   (real bugs, security smells, broken instructions), writes findings to each
   repo's `.git/magpie.json`, and returns a JSON array. Staleness alone is
   never a finding.
5. **Score & assemble.** `score = impact × confidence × reach × kindWeight /
   effort`. Write the full set to `surveys/YYYY-MM-DD.json` and the top ~12 to
   `worklist.json`. Commit + push the magpie repo; regenerate the dashboard.

## Working the worklist (a pin is a work request)

The human pins items in the dashboard; a **pin means "work on this next."** When
asked to work the worklist, read `worklist.json`, take `priority: "pin"` items
first (then by score), do the work on a branch as a PR, and record `accepted`
(in flight) → `done` in `decisions.json`. Full spec in the magpie `SKILL.md`
("Working the worklist"). This is the loop: pin in the UI → agent turns it into
a PR → it shows up in the Done tab.

## Hard rules (from magpie — repeated because they matter)

- **Propose, never execute.** Deletions, archivals, force-pushes are worklist
  items for a human. Code changes happen on branches, delivered as PRs. Never
  push to a default branch.
- **The mirror is read-only ground truth.** Never modify a surveyed repo's
  working tree during a survey. The only write allowed into a surveyed repo is
  its own `.git/magpie.json` scratchpad, which is never committed.
- **`decisions.json` is append-only, forever.**

## Common commands

```sh
./scripts/gh-sync.sh --update            # refresh the mirror (throttled)
./scripts/gh-sync.sh --dry-run           # preview without cloning
node ./scripts/gh-index.js               # regenerate the dashboard
pm2 restart github-mirror                # bounce the server
pm2 logs github-mirror                   # server logs
```

The natural cadence: `gh-sync.sh --update && node scripts/gh-index.js`, then
a survey, on a timer.
