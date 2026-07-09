#!/usr/bin/env node
//
// gh-index.js — generate a dashboard index.html for a gh-sync mirror
//
// Scans <root>/<owner>/<repo> directories (default ~/remote/github.com),
// reads each repo directory's mtime (gh-sync.sh sets it to the repo's last
// push), and writes a self-contained <root>/index.html: stat tiles, a
// last-activity histogram, and a searchable, sortable repo list.
//
// Usage: gh-index.js [root]
//
// Run it after gh-sync.sh, or on a cron/timer. No dependencies.

'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>github.com — local mirror</title>
<style>
  :root {
    --plane: #f9f9f7; --surface: #fcfcfb;
    --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --grid: #e1e0d9; --baseline: #c3c2b7;
    --border: rgba(11,11,11,0.10); --accent: #2a78d6;
    --b0: #104281; --b1: #1c5cab; --b2: #2a78d6; --b3: #5598e7; --b4: #86b6ef;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --plane: #0d0d0d; --surface: #1a1a19;
      --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
      --grid: #2c2c2a; --baseline: #383835;
      --border: rgba(255,255,255,0.10); --accent: #3987e5;
      --b0: #9ec5f4; --b1: #6da7ec; --b2: #3987e5; --b3: #256abf; --b4: #184f95;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--plane); color: var(--ink);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 860px; margin: 0 auto; padding: 28px 20px 64px; }
  header h1 { font-size: 22px; font-weight: 600; }
  header p { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px;
  }
  .tiles {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px; margin-top: 20px;
  }
  .tile .label { font-size: 12px; color: var(--ink-2); }
  .tile .value { font-size: 26px; font-weight: 600; margin-top: 2px; }
  .activity { margin-top: 12px; }
  .activity h2 { font-size: 13px; font-weight: 500; color: var(--ink-2); }
  .hist {
    display: flex; align-items: flex-end; gap: 24px;
    height: 130px; margin-top: 12px; padding: 0 4px;
    border-bottom: 1px solid var(--baseline);
  }
  .hcol {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: flex-end; gap: 4px; height: 100%;
    background: none; border: none; padding: 0; cursor: pointer;
    font: inherit; color: inherit;
  }
  .hcol .n { font-size: 12px; color: var(--ink-2); }
  .hcol .bar { width: 24px; border-radius: 4px 4px 0 0; }
  .hcol:hover .bar { opacity: 0.8; }
  .hcol.sel .bar { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
  .hlabels { display: flex; gap: 24px; padding: 6px 4px 0; }
  .hlabels span { flex: 1; text-align: center; font-size: 12px; color: var(--muted); }
  .controls { display: flex; gap: 10px; align-items: center; margin: 24px 0 12px; }
  .controls input, .controls select {
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 12px; font: inherit; font-size: 14px;
  }
  .controls input { flex: 1; min-width: 0; }
  .controls input:focus, .controls select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  #count { color: var(--muted); font-size: 13px; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; font-size: 12px; font-weight: 500; color: var(--muted);
    padding: 4px 8px 10px;
  }
  th:last-child, td.time { text-align: right; }
  td { padding: 7px 8px; border-top: 1px solid var(--grid); }
  .dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    margin-right: 10px; vertical-align: 1px;
  }
  .wl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .wl-head h2 { font-size: 15px; font-weight: 600; }
  .wl-logo { font-size: 15px; }
  .wl-resolved { font-size: 12px; color: var(--muted); }
  .wl-tabs { display: flex; gap: 4px; margin: 12px 0 4px; border-bottom: 1px solid var(--grid); }
  .wl-tab {
    background: none; border: none; border-bottom: 2px solid transparent;
    padding: 7px 12px 9px; font: inherit; font-size: 14px; color: var(--ink-2);
    cursor: pointer; margin-bottom: -1px;
  }
  .wl-tab:hover { color: var(--ink); }
  .wl-tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 500; }
  .wl-n {
    font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted);
    background: var(--plane); border: 1px solid var(--border); border-radius: 20px; padding: 0 6px; margin-left: 2px;
  }
  #wl-items li { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--grid); align-items: baseline; }
  #wl-items li:first-child { border-top: none; }
  .wl-score {
    flex: none; min-width: 34px; text-align: center; font-size: 12px;
    font-variant-numeric: tabular-nums; color: var(--ink-2);
    border: 1px solid var(--border); border-radius: 6px; padding: 1px 0;
  }
  .wl-body { flex: 1; min-width: 0; }
  .wl-pitch { font-size: 14px; }
  .wl-meta { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .wl-meta a { color: var(--ink-2); text-decoration: none; }
  .wl-meta a:hover { text-decoration: underline; color: var(--accent); }
  .wl-kind {
    display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 4px;
    background: var(--b4); color: var(--surface); margin-right: 6px;
  }
  .wl-kind.security { background: #d03b3b; color: #fff; }
  .wl-kind.bug { background: var(--b2); color: #fff; }
  .wl-status {
    margin-left: 6px; font-size: 11px; padding: 0 6px; border-radius: 4px;
    background: var(--b2); color: #fff;
  }
  .wl-done-badge {
    flex: none; min-width: 60px; text-align: center; font-size: 11px;
    padding: 2px 0; border-radius: 6px; color: #fff; text-transform: capitalize;
  }
  .wl-done-badge.done { background: #0ca30c; }
  .wl-done-badge.rejected { background: var(--muted); }
  .wl-done-badge.safe-archive { background: #0ca30c; }
  .wl-done-badge.needs-human { background: #c07a1a; }
  .wl-github {
    margin-left: 8px; font-size: 12px; color: var(--accent);
    text-decoration: none; white-space: nowrap;
  }
  .wl-github:hover { text-decoration: underline; }
  .wl-pin { margin-right: 6px; }
  .wl-pinbtn {
    flex: none; align-self: center; margin-left: 8px; background: none;
    border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px;
    cursor: pointer; font-size: 13px; opacity: 0.45; filter: grayscale(1);
  }
  .wl-pinbtn:hover { opacity: 0.9; filter: none; }
  .wl-pinbtn.on { opacity: 1; filter: none; border-color: var(--accent); }
  .wl-pinbtn:disabled { opacity: 0.3; cursor: default; }
  .wl-later {
    margin-left: 6px; font-size: 11px; padding: 0 6px; border-radius: 4px;
    background: var(--plane); border: 1px solid var(--border); color: var(--muted);
  }
  .wl-note { font-size: 13px; color: var(--ink-2); margin-top: 3px; }
  .wl-note a { color: var(--accent); text-decoration: none; word-break: break-all; }
  .wl-note a:hover { text-decoration: underline; }
  .b0 { background: var(--b0); } .b1 { background: var(--b1); }
  .b2 { background: var(--b2); } .b3 { background: var(--b3); }
  .b4 { background: var(--b4); }
  td .owner {
    background: none; border: none; padding: 0; cursor: pointer;
    font: inherit; color: var(--ink-2);
  }
  td .owner:hover { text-decoration: underline; }
  td .sep { color: var(--muted); padding: 0 2px; }
  td a.name { color: var(--ink); font-weight: 500; text-decoration: none; }
  td a.name:hover { text-decoration: underline; color: var(--accent); }
  td.time { color: var(--ink-2); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  #more {
    display: block; margin: 16px auto 0; background: none;
    border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 18px; font: inherit; font-size: 14px;
    color: var(--ink-2); cursor: pointer;
  }
  #more:hover { background: var(--surface); }
  footer { margin-top: 28px; color: var(--muted); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<main>
  <header>
    <h1>github.com</h1>
    <p>local mirror &middot; synced __GENERATED__</p>
  </header>

  <div class="tiles">
    <div class="card tile"><div class="label">Repos</div><div class="value">__REPOS__</div></div>
    <div class="card tile"><div class="label">Owners</div><div class="value">__OWNERS__</div></div>
    <div class="card tile"><div class="label">Touched this month</div><div class="value">__ACTIVE_MONTH__</div></div>
    <div class="card tile"><div class="label">Touched this year</div><div class="value">__ACTIVE_YEAR__</div></div>
  </div>

  <div class="card activity" style="margin-top:12px">
    <h2>Last activity <span style="color:var(--muted);font-weight:400">&middot; click a bar to filter</span></h2>
    <div class="hist" id="hist"></div>
    <div class="hlabels" id="hlabels"></div>
  </div>

  <div class="card" id="worklist" hidden style="margin-top:12px">
    <div class="wl-head">
      <h2>
        <span class="wl-logo">&#128038;</span> magpie
        <span style="color:var(--muted);font-weight:400">&middot; survey <span id="wl-date"></span></span>
      </h2>
      <span id="wl-resolved" class="wl-resolved"></span>
    </div>
    <div class="wl-tabs" role="tablist">
      <button class="wl-tab" role="tab" data-tab="worklist" aria-selected="true">Worklist <span class="wl-n" id="wl-n-worklist"></span></button>
      <button class="wl-tab" role="tab" data-tab="all" aria-selected="false">All <span class="wl-n" id="wl-n-all"></span></button>
      <button class="wl-tab" role="tab" data-tab="archive" aria-selected="false">Archive <span class="wl-n" id="wl-n-archive"></span></button>
      <button class="wl-tab" role="tab" data-tab="done" aria-selected="false">Done <span class="wl-n" id="wl-n-done"></span></button>
    </div>
    <ol id="wl-items" style="list-style:none"></ol>
  </div>

  <div class="controls">
    <input id="q" type="search" placeholder="Filter repos&hellip; (owner/ to scope)" aria-label="Filter repos">
    <select id="sort" aria-label="Sort order">
      <option value="recent">Recently modified</option>
      <option value="name">Name</option>
      <option value="owner">Owner</option>
    </select>
    <span id="count"></span>
  </div>

  <div class="card" style="padding:8px 12px">
    <table>
      <thead><tr><th>Repository</th><th>Last modified</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <button id="more" hidden></button>
    <noscript><p style="padding:12px">This dashboard needs JavaScript for the repo list.</p></noscript>
  </div>

  <footer>generated by gh-index.js &middot; __GENERATED__</footer>
</main>

<script id="data" type="application/json">__DATA__</script>
<script>
'use strict'
var DATA = JSON.parse(document.getElementById('data').textContent)
var NOW = Math.floor(Date.now() / 1000)
var DAY = 86400
var CUTS = [7, 30, 365, 1095]
var BUCKETS = ['this week', 'this month', 'this year', '1\\u20133 years', 'older']
var CHUNK = 400

function bucketOf (t) {
  var d = (NOW - t) / DAY
  for (var i = 0; i < CUTS.length; i++) if (d < CUTS[i]) return i
  return 4
}
function fmtRel (t) {
  var d = Math.floor((NOW - t) / DAY)
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  if (d < 14) return d + 'd ago'
  if (d < 60) return Math.floor(d / 7) + 'w ago'
  if (d < 365) return Math.floor(d / 30) + 'mo ago'
  return Math.floor(d / 365) + 'y ago'
}

var state = { q: '', bucket: null, sort: 'recent' }
var filtered = []
var rendered = 0
var rowsEl = document.getElementById('rows')
var moreEl = document.getElementById('more')
var countEl = document.getElementById('count')
var qEl = document.getElementById('q')

// histogram
var counts = [0, 0, 0, 0, 0]
DATA.forEach(function (r) { counts[bucketOf(r[2])]++ })
var maxCount = Math.max.apply(null, counts)
var histEl = document.getElementById('hist')
var hlabelsEl = document.getElementById('hlabels')
BUCKETS.forEach(function (name, i) {
  var col = document.createElement('button')
  col.className = 'hcol'
  col.title = counts[i] + ' repos (' + Math.round(100 * counts[i] / DATA.length) + '%)'
  col.setAttribute('aria-pressed', 'false')
  var n = document.createElement('span')
  n.className = 'n'
  n.textContent = counts[i].toLocaleString('en')
  var bar = document.createElement('span')
  bar.className = 'bar b' + i
  bar.style.height = (counts[i] ? Math.max(2, Math.round(96 * counts[i] / maxCount)) : 0) + 'px'
  col.appendChild(n)
  col.appendChild(bar)
  col.addEventListener('click', function () {
    state.bucket = state.bucket === i ? null : i
    var cols = histEl.children
    for (var j = 0; j < cols.length; j++) {
      cols[j].className = 'hcol' + (state.bucket === j ? ' sel' : '')
      cols[j].setAttribute('aria-pressed', String(state.bucket === j))
    }
    apply()
  })
  histEl.appendChild(col)
  var lab = document.createElement('span')
  lab.textContent = name
  hlabelsEl.appendChild(lab)
})

function renderMore () {
  var frag = document.createDocumentFragment()
  var end = Math.min(rendered + CHUNK, filtered.length)
  for (var i = rendered; i < end; i++) {
    var r = filtered[i]
    var tr = document.createElement('tr')
    var td = document.createElement('td')
    var dot = document.createElement('span')
    dot.className = 'dot b' + bucketOf(r[2])
    td.appendChild(dot)
    var ob = document.createElement('button')
    ob.className = 'owner'
    ob.type = 'button'
    ob.textContent = r[0]
    ob.title = 'filter to ' + r[0]
    ob.addEventListener('click', function (o) {
      return function () { qEl.value = o + '/'; state.q = (o + '/').toLowerCase(); apply() }
    }(r[0]))
    td.appendChild(ob)
    var sep = document.createElement('span')
    sep.className = 'sep'
    sep.textContent = '/'
    td.appendChild(sep)
    var a = document.createElement('a')
    a.className = 'name'
    a.textContent = r[1]
    a.href = './' + encodeURIComponent(r[0]) + '/' + encodeURIComponent(r[1]) + '/'
    td.appendChild(a)
    tr.appendChild(td)
    var tt = document.createElement('td')
    tt.className = 'time'
    tt.textContent = fmtRel(r[2])
    tt.title = new Date(r[2] * 1000).toISOString().slice(0, 10)
    tr.appendChild(tt)
    frag.appendChild(tr)
  }
  rowsEl.appendChild(frag)
  rendered = end
  var left = filtered.length - rendered
  moreEl.hidden = left <= 0
  moreEl.textContent = 'Show ' + Math.min(CHUNK, left).toLocaleString('en') + ' more (' + left.toLocaleString('en') + ' remaining)'
}

function apply () {
  filtered = DATA.filter(function (r) {
    if (state.bucket !== null && bucketOf(r[2]) !== state.bucket) return false
    if (state.q && (r[0] + '/' + r[1]).toLowerCase().indexOf(state.q) === -1) return false
    return true
  })
  if (state.sort === 'name') filtered.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0 })
  else if (state.sort === 'owner') filtered.sort(function (a, b) { return (a[0] + '/' + a[1]) < (b[0] + '/' + b[1]) ? -1 : 1 })
  else filtered.sort(function (a, b) { return b[2] - a[2] })
  countEl.textContent = filtered.length.toLocaleString('en') + ' repos'
  rowsEl.textContent = ''
  rendered = 0
  renderMore()
}

var debounce
qEl.addEventListener('input', function () {
  clearTimeout(debounce)
  debounce = setTimeout(function () { state.q = qEl.value.trim().toLowerCase(); apply() }, 80)
})
document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; apply() })
moreEl.addEventListener('click', renderMore)
apply()

// magpie worklist — rendered if the ledger is present in the mirror
fetch('./melvincarvalho/magpie/worklist.json').then(function (r) {
  return r.ok ? r.json() : null
}).then(function (wl) {
  if (!wl || !wl.items || !wl.items.length) return
  var SIDECAR = location.protocol + '//' + location.hostname + ':5446'
  var canWrite = false
  var all = [], top = []
  function applyData (w) {
    document.getElementById('wl-date').textContent = (w.generated || '').slice(0, 10)
    var headline = w.headline || 12
    all = w.items
    top = all.slice(0, headline)
    document.getElementById('wl-n-worklist').textContent = top.length
    document.getElementById('wl-n-all').textContent = all.length
    var rv = w.resolved || {}
    var parts = []
    if (rv.done) parts.push(rv.done + ' done')
    if (rv.accepted) parts.push(rv.accepted + ' in flight')
    if (rv.rejected) parts.push(rv.rejected + ' rejected')
    document.getElementById('wl-resolved').textContent =
      parts.join('  \\u00b7  ') + (parts.length ? '  \\u00b7  ' : '') + (w.total || all.length) + ' surveyed'
  }
  applyData(wl)

  // pin/unpin writes go to the localhost-only sidecar, which appends to
  // decisions.json and returns the regenerated worklist.
  function writeDecision (payload, btn) {
    if (btn) btn.disabled = true
    fetch(SIDECAR + '/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) { return r.ok ? r.json() : Promise.reject() }).then(function (w) {
      applyData(w)
      var active = document.querySelector('.wl-tab[aria-selected="true"]')
      render(active ? active.dataset.tab : 'worklist')
    }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = '!' } })
  }

  var ol = document.getElementById('wl-items')
  function row (it, rank) {
    var li = document.createElement('li')
    var sc = document.createElement('span')
    sc.className = 'wl-score'
    sc.textContent = it.score
    sc.title = 'rank #' + rank + (it.confidence ? '  \\u00b7  confidence ' + it.confidence + '/5' : '')
    var body = document.createElement('div')
    body.className = 'wl-body'
    var p = document.createElement('div')
    p.className = 'wl-pitch'
    if (it.priority === 'pin' && !canWrite) {
      var pin = document.createElement('span')
      pin.className = 'wl-pin'
      pin.textContent = '\\uD83D\\uDCCC'
      pin.title = 'pinned'
      p.appendChild(pin)
    }
    var k = document.createElement('span')
    k.className = 'wl-kind ' + (it.kind || '')
    k.textContent = it.kind || ''
    p.appendChild(k)
    p.appendChild(document.createTextNode(it.pitch))
    var meta = document.createElement('div')
    meta.className = 'wl-meta'
    var a = document.createElement('a')
    a.href = './' + it.repo + '/'
    a.textContent = it.repo
    meta.appendChild(a)
    var gh = document.createElement('a')
    gh.href = (it.seeAlso && it.seeAlso[1]) || ('https://github.com/' + it.repo)
    gh.textContent = 'GitHub \\u2197'
    gh.target = '_blank'; gh.rel = 'noopener'
    gh.className = 'wl-github'
    meta.appendChild(gh)
    meta.appendChild(document.createTextNode('  \\u00b7  ' + (it.effort || '') + ' effort'))
    if (it.status && it.status !== 'open') {
      var st = document.createElement('span')
      st.className = 'wl-status'
      st.textContent = it.status === 'accepted' ? 'in flight' : it.status
      meta.appendChild(st)
    }
    if (it.priority === 'later') {
      var lt = document.createElement('span')
      lt.className = 'wl-later'
      lt.textContent = 'later'
      meta.appendChild(lt)
    }
    body.appendChild(p)
    body.appendChild(meta)
    li.appendChild(sc)
    li.appendChild(body)
    if (canWrite) {
      var toggle = document.createElement('button')
      toggle.className = 'wl-pinbtn' + (it.priority === 'pin' ? ' on' : '')
      toggle.textContent = '\\uD83D\\uDCCC'
      toggle.title = it.priority === 'pin' ? 'unpin' : 'pin to top'
      toggle.addEventListener('click', function () {
        writeDecision({ id: it.id, repo: it.repo, priority: it.priority === 'pin' ? 'normal' : 'pin' }, toggle)
      })
      li.appendChild(toggle)
    }
    return li
  }
  function doneRow (d) {
    var li = document.createElement('li')
    var badge = document.createElement('span')
    badge.className = 'wl-done-badge ' + (d.action || '')
    badge.textContent = d.action || ''
    var body = document.createElement('div')
    body.className = 'wl-body'
    var p = document.createElement('div')
    p.className = 'wl-pitch'
    p.appendChild(document.createTextNode(d.id || ''))
    var meta = document.createElement('div')
    meta.className = 'wl-meta'
    if (d.repo) {
      var a = document.createElement('a')
      a.href = './' + d.repo + '/'
      a.textContent = d.repo
      meta.appendChild(a)
    }
    if (d.ts) meta.appendChild(document.createTextNode((d.repo ? '  \\u00b7  ' : '') + d.ts.slice(0, 10)))
    body.appendChild(p)
    body.appendChild(meta)
    if (d.note) {
      var note = document.createElement('div')
      note.className = 'wl-note'
      // linkify any URLs in the note (PR links etc.)
      var re = /(https?:\\/\\/[^\\s)]+)/g, last = 0, m
      while ((m = re.exec(d.note))) {
        if (m.index > last) note.appendChild(document.createTextNode(d.note.slice(last, m.index)))
        var link = document.createElement('a')
        link.href = m[1]; link.textContent = m[1]; link.target = '_blank'; link.rel = 'noopener'
        note.appendChild(link)
        last = m.index + m[1].length
      }
      if (last < d.note.length) note.appendChild(document.createTextNode(d.note.slice(last)))
      body.appendChild(note)
    }
    li.appendChild(badge)
    li.appendChild(body)
    return li
  }
  // Archive tab: one row per archive candidate from archive-review.json.
  function archiveRow (it) {
    var li = document.createElement('li')
    var badge = document.createElement('span')
    badge.className = 'wl-done-badge ' + (it.verdict || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    badge.textContent = it.verdict === 'NEEDS-HUMAN' ? 'review' : 'archive'
    badge.title = it.verdict || ''
    var body = document.createElement('div')
    body.className = 'wl-body'
    var p = document.createElement('div')
    p.className = 'wl-pitch'
    p.appendChild(document.createTextNode(it.whatItIs || it.repo))
    var meta = document.createElement('div')
    meta.className = 'wl-meta'
    var a = document.createElement('a')
    a.href = './' + it.repo + '/'
    a.textContent = it.repo
    meta.appendChild(a)
    var gh = document.createElement('a')
    gh.href = 'https://github.com/' + it.repo
    gh.textContent = 'GitHub \\u2197'
    gh.target = '_blank'; gh.rel = 'noopener'
    gh.className = 'wl-github'
    meta.appendChild(gh)
    if (it.confidence) meta.appendChild(document.createTextNode('  \\u00b7  confidence ' + it.confidence + '/5'))
    if (it.successor) meta.appendChild(document.createTextNode('  \\u00b7  \\u2192 ' + it.successor))
    body.appendChild(p)
    body.appendChild(meta)
    if (it.reason) {
      var note = document.createElement('div')
      note.className = 'wl-note'
      note.textContent = it.reason
      body.appendChild(note)
    }
    li.appendChild(badge)
    li.appendChild(body)
    return li
  }
  var doneList = []
  var archiveList = []
  function render (which) {
    ol.textContent = ''
    if (which === 'done') {
      if (!doneList.length) {
        var li = document.createElement('li')
        li.style.color = 'var(--muted)'
        li.textContent = 'No resolved items yet.'
        ol.appendChild(li)
        return
      }
      doneList.forEach(function (d) { ol.appendChild(doneRow(d)) })
      return
    }
    if (which === 'archive') {
      if (!archiveList.length) {
        var lia = document.createElement('li')
        lia.style.color = 'var(--muted)'
        lia.textContent = 'No archive candidates.'
        ol.appendChild(lia)
        return
      }
      archiveList.forEach(function (it) { ol.appendChild(archiveRow(it)) })
      return
    }
    var list = which === 'all' ? all : top
    list.forEach(function (it, i) { ol.appendChild(row(it, i + 1)) })
  }
  var tabs = document.querySelectorAll('.wl-tab')
  function select (name) {
    var found = false
    tabs.forEach(function (x) {
      var on = x.dataset.tab === name
      x.setAttribute('aria-selected', String(on))
      if (on) found = true
    })
    render(found ? name : 'worklist')
    if (found && location.hash !== '#' + name) history.replaceState(null, '', '#' + name)
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { select(t.dataset.tab) })
  })
  select((location.hash || '').replace('#', '') || 'worklist')
  document.getElementById('worklist').hidden = false

  // If the localhost write sidecar is reachable, enable pin/unpin buttons.
  fetch(SIDECAR + '/health').then(function (r) { return r.ok }).then(function (ok) {
    if (!ok) return
    canWrite = true
    var active = document.querySelector('.wl-tab[aria-selected="true"]')
    if (active && active.dataset.tab !== 'done') render(active.dataset.tab)
  }).catch(function () {})

  // Done tab reads decisions.json directly: fold to the latest verdict per
  // finding, keep terminal ones (done/rejected), newest first.
  fetch('./melvincarvalho/magpie/decisions.json').then(function (r) {
    return r.ok ? r.json() : []
  }).then(function (decisions) {
    var latest = {}
    decisions.forEach(function (d) { if (d && d.id) latest[d.id] = d })
    doneList = Object.keys(latest).map(function (k) { return latest[k] })
      .filter(function (d) { return d.action === 'done' || d.action === 'rejected' })
      .sort(function (a, b) { return (b.ts || '') < (a.ts || '') ? -1 : 1 })
    document.getElementById('wl-n-done').textContent = doneList.length
    var active = document.querySelector('.wl-tab[aria-selected="true"]')
    if (active && active.dataset.tab === 'done') render('done')
  }).catch(function () {})

  // Archive tab reads the archival-safety review: show archive candidates,
  // confirmed-safe first, then any still needing a human decision.
  fetch('./melvincarvalho/magpie/archive-review.json').then(function (r) {
    return r.ok ? r.json() : null
  }).then(function (rev) {
    if (!rev || !rev.repos) return
    var rank = { 'SAFE-ARCHIVE': 0, 'NEEDS-HUMAN': 1 }
    archiveList = rev.repos.filter(function (x) { return x.verdict in rank })
      .sort(function (a, b) {
        return (rank[a.verdict] - rank[b.verdict]) || ((b.confidence || 0) - (a.confidence || 0))
      })
    document.getElementById('wl-n-archive').textContent = archiveList.length
    var active = document.querySelector('.wl-tab[aria-selected="true"]')
    if (active && active.dataset.tab === 'archive') render('archive')
  }).catch(function () {})
}).catch(function () {})
</script>
</body>
</html>
`

const root = process.argv[2] || path.join(os.homedir(), 'remote', 'github.com')

const repos = []
let empty = 0
for (const owner of fs.readdirSync(root, { withFileTypes: true })) {
  if (!owner.isDirectory() || owner.name.startsWith('.')) continue
  const ownerDir = path.join(root, owner.name)
  for (const entry of fs.readdirSync(ownerDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const repoDir = path.join(ownerDir, entry.name)
    if (!fs.existsSync(path.join(repoDir, '.git'))) continue
    // Skip empty clones (working tree is nothing but .git) — a genuinely
    // empty upstream repo. Not browseable, not workable, pure dashboard noise.
    if (fs.readdirSync(repoDir).every(f => f === '.git')) { empty++; continue }
    const t = Math.floor(fs.statSync(repoDir).mtimeMs / 1000)
    repos.push([owner.name, entry.name, t])
  }
}
repos.sort((a, b) => b[2] - a[2])

const owners = new Set(repos.map(r => r[0])).size
const now = Math.floor(Date.now() / 1000)
const day = 86400
const activeMonth = repos.filter(r => now - r[2] < 30 * day).length
const activeYear = repos.filter(r => now - r[2] < 365 * day).length
const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
const json = JSON.stringify(repos).replace(/</g, '\\u003c')

const page = TEMPLATE
  .replace('__DATA__', () => json)
  .replace(/__REPOS__/g, repos.length.toLocaleString('en'))
  .replace(/__OWNERS__/g, String(owners))
  .replace(/__ACTIVE_MONTH__/g, activeMonth.toLocaleString('en'))
  .replace(/__ACTIVE_YEAR__/g, activeYear.toLocaleString('en'))
  .replace(/__GENERATED__/g, generated)

const out = path.join(root, 'index.html')
fs.writeFileSync(out, page)
console.log('wrote ' + out + ' — ' + repos.length + ' repos, ' + owners + ' owners' +
  (empty ? ' (' + empty + ' empty clones skipped)' : ''))
