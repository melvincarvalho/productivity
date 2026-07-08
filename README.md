# productivity

Various tools to increase productivity.

## scripts/gh-sync.sh

Mirror your GitHub world (owned repos + all orgs you belong to) into
`~/remote/github.com/<owner>/<repo>`.

- Skips repos already on disk; `--update` fast-forwards them instead.
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

---

Previous tools (a Freeplane daily-mindmap script and xdotool window-positioning
scripts) were removed as no longer used — see git history if you need them.
