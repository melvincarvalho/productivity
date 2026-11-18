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
    color-scheme: light;
    --plane: #f5f5f7;
    --surface: rgba(255, 255, 255, 0.82);
    --surface-solid: #ffffff;
    --ink: #1d1d1f;
    --ink-2: #424245;
    --muted: #6e6e73;
    --grid: rgba(29, 29, 31, 0.08);
    --baseline: #d2d2d7;
    --border: rgba(29, 29, 31, 0.09);
    --accent: #0071e3;
    --accent-hover: #0077ed;
    --accent-soft: rgba(0, 113, 227, 0.09);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 12px 32px rgba(0, 0, 0, 0.04);
    --shadow-hover: 0 2px 4px rgba(0, 0, 0, 0.04), 0 18px 44px rgba(0, 0, 0, 0.07);
    --b0: #004c99;
    --b1: #0069cc;
    --b2: #0a84ff;
    --b3: #64a9f8;
    --b4: #a8cdf3;
  }
  * { box-sizing: border-box; margin: 0; }
  html { scroll-behavior: smooth; }
  body {
    min-width: 320px;
    background:
      radial-gradient(ellipse 70% 360px at 85% -80px, rgba(0, 113, 227, 0.1), transparent 70%),
      radial-gradient(ellipse 55% 300px at 0% 0%, rgba(100, 169, 248, 0.07), transparent 70%),
      var(--plane);
    background-attachment: fixed;
    color: var(--ink);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  button, input, select { font: inherit; }
  button, a, input, select, summary { -webkit-tap-highlight-color: transparent; }
  button { color: inherit; }
  [hidden] { display: none !important; }
  ::selection { background: rgba(0, 113, 227, 0.2); }
  :where(a, button, input, select, summary):focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }
  main { max-width: 1440px; margin: 0 auto; padding: 42px 32px 64px; }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 32px;
    padding: 8px 4px 38px;
  }
  .hero-copy { display: flex; align-items: center; gap: 20px; min-width: 0; }
  .brand {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 19px;
    background: linear-gradient(145deg, #1991ff 0%, #0071e3 48%, #0058b9 100%);
    color: #fff;
    box-shadow: 0 12px 28px rgba(0, 113, 227, 0.24), inset 0 1px 1px rgba(255, 255, 255, 0.28);
  }
  .brand svg { width: 32px; height: 32px; }
  .eyebrow {
    margin-bottom: 4px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.13em;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .hero h1 {
    font-size: clamp(34px, 4vw, 48px);
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  .hero-subtitle { margin-top: 7px; color: var(--muted); font-size: 15px; letter-spacing: -0.01em; }
  .sync-status {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 4px;
    padding: 13px 17px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
  }
  .sync-label { display: flex; align-items: center; gap: 7px; color: var(--ink-2); font-size: 13px; font-weight: 600; }
  .sync-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #30d158;
    box-shadow: 0 0 0 3px rgba(48, 209, 88, 0.12);
  }
  .sync-time { padding-left: 14px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .layout { display: grid; grid-template-columns: 336px minmax(0, 1fr); gap: 24px; align-items: start; }
  .side { position: sticky; top: 24px; display: grid; gap: 16px; }
  .content { min-width: 0; }
  .card {
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
  }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .tile {
    min-height: 120px;
    padding: 19px 20px;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .tile:hover { transform: translateY(-2px); border-color: rgba(0, 113, 227, 0.18); box-shadow: var(--shadow-hover); }
  .tile .label { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: -0.01em; }
  .tile .value {
    margin-top: 7px;
    font-size: 32px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.045em;
    line-height: 1.1;
  }
  .tile .sub { margin-top: 7px; color: var(--muted); font-size: 11px; line-height: 1.4; }
  .activity { padding: 22px; }
  .activity h2 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 15px; font-weight: 650; letter-spacing: -0.015em; }
  .activity-hint { color: var(--muted); font-size: 10px; font-weight: 400; white-space: nowrap; }
  .hist {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    height: 104px;
    margin-top: 18px;
    padding: 0 2px;
    border-bottom: 1px solid var(--baseline);
  }
  .hcol {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    height: 100%;
    padding: 5px 0 0;
    border: none;
    border-radius: 9px 9px 0 0;
    background: none;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .hcol:hover { background: var(--accent-soft); }
  .hcol .n { color: var(--ink-2); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .hcol .bar { width: min(30px, 72%); min-height: 2px; border-radius: 7px 7px 2px 2px; transition: filter 160ms ease, box-shadow 160ms ease; }
  .hcol:hover .bar { filter: brightness(1.06); }
  .hcol.sel { background: var(--accent-soft); }
  .hcol.sel .n { color: var(--accent); }
  .hcol.sel .bar { box-shadow: 0 0 0 2px var(--surface-solid), 0 0 0 4px var(--accent); }
  .hlabels { display: flex; gap: 7px; padding: 9px 2px 0; }
  .hlabels span { flex: 1; color: var(--muted); font-size: 9px; line-height: 1.3; text-align: center; }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
  }
  .search-field { position: relative; display: flex; flex: 1; align-items: center; min-width: 0; }
  .search-field > svg { position: absolute; left: 12px; width: 17px; height: 17px; color: var(--muted); pointer-events: none; }
  .controls input {
    width: 100%;
    min-width: 0;
    padding: 10px 12px 10px 39px;
    border: 0;
    border-radius: 11px;
    outline-offset: -2px;
    background: transparent;
    color: var(--ink);
    font-size: 14px;
  }
  .controls input::placeholder { color: var(--muted); opacity: 0.85; }
  .controls input::-webkit-search-cancel-button { cursor: pointer; }
  .sort-field { position: relative; flex: 0 0 auto; }
  .sort-field svg { position: absolute; top: 50%; right: 11px; width: 13px; height: 13px; color: var(--muted); transform: translateY(-50%); pointer-events: none; }
  .controls select {
    min-height: 40px;
    padding: 8px 34px 8px 13px;
    border: 1px solid var(--border);
    border-radius: 11px;
    appearance: none;
    background: var(--surface-solid);
    color: var(--ink-2);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  #count { padding: 0 11px 0 5px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .repositories { padding: 9px 13px 13px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    padding: 10px 12px 12px;
    border-bottom: 1px solid var(--grid);
    color: var(--muted);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.09em;
    text-align: left;
    text-transform: uppercase;
  }
  th:last-child { width: 132px; }
  th:last-child, td.time { text-align: right; }
  td { padding: 12px; border-bottom: 1px solid var(--grid); }
  tbody tr { transition: background 140ms ease; }
  tbody tr:hover { background: var(--accent-soft); }
  tbody tr:last-child td { border-bottom: 0; }
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 11px;
    border-radius: 50%;
    box-shadow: 0 0 0 3px var(--surface-solid);
    vertical-align: 1px;
  }
  td .owner {
    max-width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 14px;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  td .owner:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  td .sep { padding: 0 3px; color: var(--muted); opacity: 0.65; }
  td a.name {
    color: var(--ink);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
    text-decoration: none;
  }
  td a.name:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  td.time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  #more {
    display: block;
    margin: 15px auto 2px;
    padding: 9px 18px;
    border: 0;
    border-radius: 11px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;
  }
  #more:hover { background: rgba(0, 113, 227, 0.15); transform: translateY(-1px); }
  #worklist { margin-bottom: 20px; padding: 24px; }
  .wl-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; }
  .wl-head h2 { font-size: 20px; font-weight: 650; letter-spacing: -0.025em; }
  .wl-logo { display: inline-block; margin-right: 5px; font-size: 20px; }
  .wl-resolved { color: var(--muted); font-size: 12px; }
  .wl-tabs { display: flex; gap: 5px; margin: 17px 0 3px; border-bottom: 1px solid var(--grid); overflow-x: auto; }
  .wl-tab {
    flex: 0 0 auto;
    margin-bottom: -1px;
    padding: 9px 13px 11px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 9px 9px 0 0;
    background: none;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }
  .wl-tab:hover { background: var(--accent-soft); color: var(--ink); }
  .wl-tab[aria-selected="true"] { border-bottom-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .wl-n {
    display: inline-block;
    min-width: 21px;
    margin-left: 3px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface-solid);
    color: var(--muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: center;
  }
  #wl-items { padding: 0; }
  #wl-items li {
    --k: var(--muted);
    --k-bg: var(--grid);
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr) auto;
    align-items: start;
    gap: 17px;
    padding: 19px 8px;
    border-top: 1px solid var(--grid);
    border-radius: 12px;
    transition: background 150ms ease;
  }
  #wl-items li:first-child { border-top: 0; }
  #wl-items li:hover { background: var(--accent-soft); }
  #wl-items li.k-security { --k: #d70015; --k-bg: rgba(215, 0, 21, 0.1); }
  #wl-items li.k-bug { --k: #0071e3; --k-bg: rgba(0, 113, 227, 0.1); }
  #wl-items li.k-feature { --k: #248a3d; --k-bg: rgba(36, 138, 61, 0.11); }
  #wl-items li.k-docs { --k: #9a6200; --k-bg: rgba(154, 98, 0, 0.11); }
  #wl-items li.k-cleanup { --k: var(--muted); --k-bg: var(--grid); }
  .wl-score { padding-top: 2px; text-align: center; }
  .wl-score b { display: block; color: var(--ink); font-size: 23px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1.15; }
  .wl-track { display: block; height: 4px; margin-top: 8px; border-radius: 4px; background: var(--grid); overflow: hidden; }
  .wl-fill { display: block; height: 100%; border-radius: 4px; background: var(--k); }
  .wl-body { min-width: 0; }
  .wl-pitch { font-size: 15px; }
  .wl-body details summary { font-size: 15px; font-weight: 600; letter-spacing: -0.012em; line-height: 1.45; list-style: none; cursor: pointer; }
  .wl-body details summary::-webkit-details-marker { display: none; }
  .wl-body details summary::after { content: '  ▾'; color: var(--muted); font-weight: 400; }
  .wl-body details[open] summary::after { content: '  ▴'; }
  .wl-body details p { max-width: 78ch; margin-top: 9px; color: var(--ink-2); font-size: 14px; }
  .wl-title { font-size: 15px; font-weight: 600; letter-spacing: -0.012em; line-height: 1.45; }
  .wl-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-bottom: 7px; color: var(--muted); font-size: 12px; }
  .wl-meta a { color: var(--ink-2); text-decoration: none; }
  .wl-meta a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  .wl-chip { padding: 2px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-solid); font-size: 12px; }
  .wl-chip b { color: var(--ink); font-weight: 600; }
  .wl-kind { display: inline-block; padding: 2px 9px; border-radius: 7px; background: var(--k-bg); color: var(--k); font-size: 11px; font-weight: 650; text-transform: capitalize; }
  .wl-status { padding: 2px 8px; border-radius: 7px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 600; }
  .wl-done-badge { padding: 4px 7px; border-radius: 7px; color: #fff; font-size: 10px; font-weight: 600; text-align: center; text-transform: capitalize; }
  .wl-done-badge.done { background: #248a3d; }
  .wl-done-badge.rejected { background: var(--muted); }
  .wl-done-badge.safe-archive { background: #248a3d; }
  .wl-done-badge.needs-human { background: #b56700; }
  .wl-github { color: var(--accent) !important; font-size: 12px; white-space: nowrap; }
  .wl-pin { margin-right: 6px; }
  .wl-pinbtn {
    flex: none;
    align-self: center;
    margin-left: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-solid);
    font-size: 12px;
    opacity: 0.5;
    filter: grayscale(1);
    cursor: pointer;
  }
  .wl-pinbtn:hover { opacity: 1; filter: none; }
  .wl-pinbtn.on { border-color: var(--accent); opacity: 1; filter: none; }
  .wl-pinbtn:disabled { opacity: 0.3; cursor: default; }
  .wl-later { padding: 2px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-solid); color: var(--muted); font-size: 11px; }
  .wl-note { margin-top: 6px; color: var(--ink-2); font-size: 13px; }
  .wl-note a { color: var(--accent); overflow-wrap: anywhere; text-decoration: none; }
  .wl-note a:hover { text-decoration: underline; }
  .b0 { background: var(--b0); }
  .b1 { background: var(--b1); }
  .b2 { background: var(--b2); }
  .b3 { background: var(--b3); }
  .b4 { background: var(--b4); }
  footer { margin-top: 32px; color: var(--muted); font-size: 11px; text-align: center; }
  @media (max-width: 1100px) {
    .layout { grid-template-columns: 300px minmax(0, 1fr); gap: 18px; }
    .tile { padding: 17px; }
    .activity { padding: 19px 16px; }
    .activity h2 { display: block; }
    .activity-hint { display: block; margin-top: 3px; }
    .controls { flex-wrap: wrap; }
    .search-field { flex-basis: 100%; }
    #count { margin-left: auto; }
  }
  @media (max-width: 860px) {
    main { padding: 30px 24px 52px; }
    .layout { grid-template-columns: minmax(0, 1fr); }
    .side { position: static; }
    .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .tile { min-height: 106px; }
    .tile .value { font-size: 29px; }
    .activity h2 { display: flex; }
    .activity-hint { display: inline; margin-top: 0; }
    .hist { height: 116px; }
    .hcol .bar { width: min(44px, 72%); }
    .hlabels span { font-size: 10px; }
  }
  @media (max-width: 640px) {
    main { padding: 22px 16px 40px; }
    .hero { align-items: flex-start; flex-direction: column; gap: 20px; padding: 3px 2px 28px; }
    .hero-copy { align-items: flex-start; gap: 14px; }
    .brand { width: 48px; height: 48px; border-radius: 14px; }
    .brand svg { width: 25px; height: 25px; }
    .hero h1 { font-size: 34px; }
    .hero-subtitle { max-width: 260px; font-size: 13px; line-height: 1.4; }
    .eyebrow { margin-top: 1px; font-size: 9px; }
    .sync-status { align-self: stretch; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 13px; }
    .sync-time { padding-left: 0; font-size: 10px; }
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tile { min-height: 108px; }
    .activity h2 { display: block; }
    .activity-hint { display: block; margin-top: 3px; }
    .controls { gap: 6px; }
    .controls select { max-width: 100%; }
    #count { padding-right: 8px; }
    .repositories { padding: 7px 7px 11px; }
    th { padding: 9px 8px 11px; }
    th:last-child { width: 90px; }
    td { padding: 12px 8px; }
    .dot { margin-right: 6px; }
    td .owner, td a.name { font-size: 13px; }
    td.time { font-size: 11px; }
    #worklist { padding: 18px 13px; }
    .wl-head { display: block; }
    .wl-resolved { display: block; margin-top: 5px; }
    .wl-tabs { gap: 1px; }
    .wl-tab { padding-right: 10px; padding-left: 10px; }
    #wl-items li { grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; padding: 16px 4px; }
    .wl-score b { font-size: 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { transition: none !important; }
  }
</style>
</head>
<body>
<main>
  <header class="hero">
    <div class="hero-copy">
      <div class="brand" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="9" cy="7" r="2.5"></circle>
          <circle cx="9" cy="25" r="2.5"></circle>
          <circle cx="23" cy="12" r="2.5"></circle>
          <path d="M9 9.5v13M23 14.5c0 5-4 6-8 6h-2" stroke-linecap="round"></path>
        </svg>
      </div>
      <div>
        <div class="eyebrow">Local repository index</div>
        <h1>github.com</h1>
        <p class="hero-subtitle">Every repository. One beautifully simple view.</p>
      </div>
    </div>
    <div class="sync-status">
      <span class="sync-label"><span class="sync-dot" aria-hidden="true"></span>Local mirror</span>
      <span class="sync-time">Synced __GENERATED__</span>
    </div>
  </header>

  <div class="layout">
  <aside class="side">
  <div class="tiles">
    <div class="card tile"><div class="label">Repositories</div><div class="value">__REPOS__</div><div class="sub">__REPOS_SUB__</div></div>
    <div class="card tile"><div class="label">Owners</div><div class="value">__OWNERS__</div></div>
    <div class="card tile"><div class="label">Touched this month</div><div class="value">__ACTIVE_MONTH__</div></div>
    <div class="card tile"><div class="label">Touched this year</div><div class="value">__ACTIVE_YEAR__</div></div>
  </div>

  <div class="card activity">
    <h2>Last activity <span class="activity-hint">Click a bar to filter</span></h2>
    <div class="hist" id="hist"></div>
    <div class="hlabels" id="hlabels"></div>
  </div>
  </aside>
  <div class="content">

  <div class="card" id="worklist" hidden>
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
    <div class="search-field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"></circle>
        <path d="m16 16 4 4" stroke-linecap="round"></path>
      </svg>
      <input id="q" type="search" placeholder="Search repositories or owners" aria-label="Filter repos">
    </div>
    <div class="sort-field">
      <select id="sort" aria-label="Sort order">
        <option value="recent">Recently modified</option>
        <option value="name">Name</option>
        <option value="owner">Owner</option>
      </select>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </div>
    <span id="count"></span>
  </div>

  <div class="card repositories">
    <table>
      <thead><tr><th>Repository</th><th>Last modified</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <button id="more" hidden></button>
    <noscript><p style="padding:12px">This dashboard needs JavaScript for the repo list.</p></noscript>
  </div>

  </div>
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
  bar.style.height = (counts[i] ? Math.max(2, Math.round(52 * counts[i] / maxCount)) : 0) + 'px'
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
    document.querySelector('.controls').scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  var all = [], top = [], maxScore = 1
  function applyData (w) {
    document.getElementById('wl-date').textContent = (w.generated || '').slice(0, 10)
    var headline = w.headline || 12
    all = w.items
    maxScore = Math.max.apply(null, all.map(function (x) { return x.score || 0 }).concat([1]))
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
  // first clause of a finding, so the list reads as headlines
  function headline (t) {
    t = String(t || '')
    if (t.length <= 110) return t
    var re = /(: |; | \u2014 |\\. |, so )/g, m
    while ((m = re.exec(t))) {
      if (m.index > 110) break
      if (m.index >= 35) return t.slice(0, m.index)
    }
    var cut = t.lastIndexOf(' ', 100)
    return t.slice(0, cut > 40 ? cut : 100) + '\u2026'
  }
  function row (it, rank) {
    var li = document.createElement('li')
    li.className = 'k-' + (it.kind || 'other')
    var sc = document.createElement('div')
    sc.className = 'wl-score'
    sc.title = 'rank #' + rank + (it.confidence ? '  \u00b7  confidence ' + it.confidence + '/5' : '')
    var num = document.createElement('b')
    num.textContent = it.score
    var track = document.createElement('span')
    track.className = 'wl-track'
    var fill = document.createElement('span')
    fill.className = 'wl-fill'
    fill.style.width = Math.max(4, Math.round(100 * it.score / maxScore)) + '%'
    track.appendChild(fill)
    sc.appendChild(num)
    sc.appendChild(track)
    var body = document.createElement('div')
    body.className = 'wl-body'
    var meta = document.createElement('div')
    meta.className = 'wl-meta'
    if (it.priority === 'pin' && !canWrite) {
      var pin = document.createElement('span')
      pin.textContent = '\uD83D\uDCCC'
      pin.title = 'pinned'
      meta.appendChild(pin)
    }
    var k = document.createElement('span')
    k.className = 'wl-kind'
    k.textContent = it.kind || ''
    meta.appendChild(k)
    var a = document.createElement('a')
    a.className = 'wl-chip'
    a.href = './' + it.repo + '/'
    var parts = String(it.repo).split('/')
    a.appendChild(document.createTextNode(parts[0] + ' / '))
    var rn = document.createElement('b')
    rn.textContent = parts.slice(1).join('/')
    a.appendChild(rn)
    meta.appendChild(a)
    var ef = document.createElement('span')
    ef.textContent = (it.effort || '') + ' effort'
    meta.appendChild(ef)
    var gh = document.createElement('a')
    gh.href = (it.seeAlso && it.seeAlso[1]) || ('https://github.com/' + it.repo)
    gh.textContent = 'GitHub \u2197'
    gh.target = '_blank'; gh.rel = 'noopener'
    gh.className = 'wl-github'
    meta.appendChild(gh)
    var p
    var head = headline(it.pitch)
    if (head === it.pitch) {
      p = document.createElement('div')
      p.className = 'wl-title'
      p.textContent = it.pitch
    } else {
      p = document.createElement('details')
      var sm = document.createElement('summary')
      sm.textContent = head
      var full = document.createElement('p')
      full.textContent = it.pitch
      p.appendChild(sm)
      p.appendChild(full)
    }
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
    body.appendChild(meta)
    body.appendChild(p)
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
    var archived = it.status === 'archived'
    if (archived) li.style.opacity = '0.55'
    var badge = document.createElement('span')
    badge.className = 'wl-done-badge ' + (archived ? 'done' : (it.verdict || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    badge.textContent = archived ? 'archived \\u2713' : (it.verdict === 'NEEDS-HUMAN' ? 'review' : 'archive')
    badge.title = archived ? ('archived ' + (it.archivedAt || '')) : (it.verdict || '')
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
        var aa = a.status === 'archived' ? 1 : 0, bb = b.status === 'archived' ? 1 : 0
        return (aa - bb) || (rank[a.verdict] - rank[b.verdict]) || ((b.confidence || 0) - (a.confidence || 0))
      })
    var remaining = archiveList.filter(function (x) { return x.status !== 'archived' }).length
    document.getElementById('wl-n-archive').textContent = remaining
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

// Archived repos leave the active roster: they stay in the mirror and the
// Archive tab, but drop out of the headline count so it ticks toward the goal.
// Source of truth is magpie/archived.txt (one owner/repo per line; # comments).
const archivedSet = new Set()
try {
  fs.readFileSync(path.join(root, 'melvincarvalho', 'magpie', 'archived.txt'), 'utf8')
    .split('\n').map(s => s.trim())
    .forEach(s => { if (s && s[0] !== '#') archivedSet.add(s) })
} catch (e) {}
const active = repos.filter(r => !archivedSet.has(r[0] + '/' + r[1]))
const archivedCount = repos.length - active.length

const GOAL = 1000
const toGoal = active.length - GOAL
const reposSub = (archivedCount ? archivedCount.toLocaleString('en') + ' archived' : 'goal ' + GOAL.toLocaleString('en'))
  + (toGoal > 0 ? '  ·  ' + toGoal.toLocaleString('en') + ' to ' + GOAL.toLocaleString('en')
               : '  ·  🎯 under ' + GOAL.toLocaleString('en') + '!')

const owners = new Set(active.map(r => r[0])).size
const now = Math.floor(Date.now() / 1000)
const day = 86400
const activeMonth = active.filter(r => now - r[2] < 30 * day).length
const activeYear = active.filter(r => now - r[2] < 365 * day).length
const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
const json = JSON.stringify(active).replace(/</g, '\\u003c')

const page = TEMPLATE
  .replace('__DATA__', () => json)
  .replace(/__REPOS_SUB__/g, reposSub)
  .replace(/__REPOS__/g, active.length.toLocaleString('en'))
  .replace(/__OWNERS__/g, String(owners))
  .replace(/__ACTIVE_MONTH__/g, activeMonth.toLocaleString('en'))
  .replace(/__ACTIVE_YEAR__/g, activeYear.toLocaleString('en'))
  .replace(/__GENERATED__/g, generated)

const out = path.join(root, 'index.html')
fs.writeFileSync(out, page)
console.log('wrote ' + out + ' — ' + active.length + ' active repos, ' + owners + ' owners, ' +
  archivedCount + ' archived' + (empty ? ', ' + empty + ' empty clones skipped' : ''))
