# productivity

Various tools to increase productivity.

New here? Read [SKILL.md](SKILL.md) — it's the map to the whole system
(mirror → server → dashboard → magpie surveys) and the gotchas we've hit.

## scripts/gh-sync.sh

Mirror your GitHub world (owned repos + all orgs you belong to) into
`~/remote/github.com/<owner>/<repo>`.

- Skips repos already on disk; `--update` fast-forwards them instead.
- `--no-forks`, `--no-archived`, `--no-private` trim what gets mirrored
  (use `--no-private` when the mirror is served publicly).
- Throttled: sleeps between clones (`--delay N`, default 3s) to stay clear
  of rate limits. Interrupt and re-run any time — it resumes.
- Restores timestamps: each file's mtime is set to its last commit,
  the repo directory's mtime to the last push.

```sh
./scripts/gh-sync.sh --dry-run            # preview everything
./scripts/gh-sync.sh solid nostr-client   # sync specific orgs
./scripts/gh-sync.sh --no-forks --update  # refresh, skipping forks
```

Requires `gh` (authenticated), `git`, `python3`.

## scripts/gh-index.js

Generate a dashboard `index.html` at the root of the mirror — stat tiles,
a last-activity histogram (click a bar to filter), and a searchable,
sortable list of every repo with its last-push time. Self-contained
static HTML (works from `file://`, jspod, or any web server), light and
dark mode.

```sh
./scripts/gh-index.js                    # writes ~/remote/github.com/index.html
./scripts/gh-index.js /path/to/mirror    # custom root
```

Timestamps come from the repo directory mtimes that `gh-sync.sh` sets,
so run it after a sync. Requires `node`, no dependencies.

---

Previous tools (a Freeplane daily-mindmap script and xdotool window-positioning
scripts) were removed as no longer used — see git history if you need them.
