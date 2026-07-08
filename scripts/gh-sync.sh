#!/usr/bin/env bash
#
# gh-sync.sh — mirror your GitHub world into ~/remote/github.com/<owner>/<repo>
#
# Clones every repo you own plus every repo in every org you belong to.
# Repos already on disk are left untouched (or fast-forwarded with --update).
# After cloning, each file's mtime is set to the last commit that touched it,
# and the repo directory's mtime is set to the repo's last push time.
#
# Usage: gh-sync.sh [options] [owner|owner/repo ...]
#
#   --update        fetch + fast-forward repos that already exist (default: skip)
#   --dry-run       print what would be done without cloning
#   --delay N       seconds to sleep between clones/fetches (default 3)
#   --no-forks      skip forked repos
#   --no-archived   skip archived repos
#   --root DIR      destination root (default ~/remote/github.com)
#
# Positional args restrict the sync:
#   gh-sync.sh melvincarvalho          # one owner only
#   gh-sync.sh solid nostr-client      # two orgs
#   gh-sync.sh melvincarvalho/clgrep   # a single repo
#
# Requires: gh (authenticated), git, python3

set -euo pipefail

ROOT="$HOME/remote/github.com"
DELAY=3
LIST_DELAY=0.2
UPDATE=0 DRY=0 FORKS=1 ARCHIVED=1
FILTERS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)      UPDATE=1 ;;
    --dry-run)     DRY=1 ;;
    --delay)       DELAY="$2"; shift ;;
    --no-forks)    FORKS=0 ;;
    --no-archived) ARCHIVED=0 ;;
    --root)        ROOT="$2"; shift ;;
    -h|--help)     sed -n '2,25p' "$0" | cut -c3-; exit 0 ;;
    -*)            echo "unknown option: $1" >&2; exit 1 ;;
    *)             FILTERS+=("$1") ;;
  esac
  shift
done

ME=$(gh api user --jq .login)
JQ='.[] | [.full_name, (.pushed_at // ""), (.fork|tostring), (.archived|tostring)] | @tsv'

# Emit "full_name<TAB>pushed_at<TAB>fork<TAB>archived" for one owner.
list_owner() {
  local o=$1
  if [[ $o == "$ME" ]]; then
    gh api 'user/repos?affiliation=owner&per_page=100' --paginate --jq "$JQ" || true
  else
    gh api "orgs/$o/repos?per_page=100&type=all" --paginate --jq "$JQ" 2>/dev/null \
      || gh api "users/$o/repos?per_page=100" --paginate --jq "$JQ" 2>/dev/null \
      || echo "warn: could not list repos for $o" >&2
  fi
}

list_all() {
  local owners=()
  if [[ ${#FILTERS[@]} -gt 0 ]]; then
    local f
    for f in "${FILTERS[@]}"; do owners+=("${f%%/*}"); done
  else
    owners+=("$ME")
    mapfile -t -O "${#owners[@]}" owners < <(gh api user/orgs --paginate --jq '.[].login')
  fi
  printf '%s\n' "${owners[@]}" | sort -u | while read -r o; do
    list_owner "$o"
    sleep "$LIST_DELAY"
  done
}

# Does this repo pass the positional-arg filters?
selected() {
  [[ ${#FILTERS[@]} -eq 0 ]] && return 0
  local full=$1 owner=${1%%/*} f
  for f in "${FILTERS[@]}"; do
    [[ $f == "$full" || $f == "$owner" ]] && return 0
  done
  return 1
}

# Set each tracked file's mtime to the last commit that touched it.
restore_mtimes() {
  python3 - "$1" <<'PY'
import os, subprocess, sys
repo = sys.argv[1]
tracked = set(subprocess.run(
    ['git', '-C', repo, 'ls-files', '-z'],
    capture_output=True).stdout.decode(errors='replace').split('\0'))
tracked.discard('')
proc = subprocess.Popen(
    ['git', '-C', repo, '-c', 'core.quotepath=off', 'log', '-m',
     '--no-renames', '--format=%x00%ct', '--name-only'],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
ts = None
for raw in proc.stdout:
    line = raw.decode(errors='replace').rstrip('\n')
    if not line:
        continue
    if line.startswith('\0'):
        ts = int(line[1:])
        continue
    if line in tracked:
        tracked.discard(line)
        try:
            os.utime(os.path.join(repo, line), (ts, ts), follow_symlinks=False)
        except OSError:
            pass
        if not tracked:
            break
proc.stdout.close()
proc.terminate()
proc.wait()
PY
}

echo "listing repos$([[ ${#FILTERS[@]} -gt 0 ]] && echo " for: ${FILTERS[*]}" || echo " for $ME + all orgs (this can take a few minutes)")..."
mapfile -t REPOS < <(list_all | sort -u)
echo "found ${#REPOS[@]} repos"

new=0 skipped=0 updated=0 failed=0 filtered=0
for entry in "${REPOS[@]}"; do
  IFS=$'\t' read -r full pushed fork archived <<<"$entry"
  [[ -z $full ]] && continue
  selected "$full" || continue
  if [[ $FORKS -eq 0 && $fork == true ]] || [[ $ARCHIVED -eq 0 && $archived == true ]]; then
    filtered=$((filtered + 1))
    continue
  fi
  owner=${full%%/*} name=${full#*/}
  dest="$ROOT/$owner/$name"

  if [[ -d $dest ]]; then
    if [[ $UPDATE -eq 0 ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    echo "update  $full"
    [[ $DRY -eq 1 ]] && { updated=$((updated + 1)); continue; }
    if git -C "$dest" pull --ff-only --quiet 2>/dev/null; then
      restore_mtimes "$dest"
      [[ -n $pushed ]] && touch -d "$pushed" "$dest"
      updated=$((updated + 1))
    else
      echo "warn: could not fast-forward $full (dirty tree, diverged, or no upstream)" >&2
      failed=$((failed + 1))
    fi
    sleep "$DELAY"
    continue
  fi

  echo "clone   $full"
  [[ $DRY -eq 1 ]] && { new=$((new + 1)); continue; }
  mkdir -p "$ROOT/$owner"
  if gh repo clone "$full" "$dest" -- --quiet 2>/dev/null; then
    restore_mtimes "$dest"
    [[ -n $pushed ]] && touch -d "$pushed" "$dest"
    new=$((new + 1))
  else
    echo "warn: clone failed: $full" >&2
    failed=$((failed + 1))
  fi
  sleep "$DELAY"
done

echo
echo "done: $new cloned, $updated updated, $skipped already present (skipped), $filtered filtered out, $failed failed$([[ $DRY -eq 1 ]] && echo ' [dry run]')"
