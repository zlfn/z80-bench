"use strict";

// The benchmarks of each tier in the order the site lists them, under their
// groups. Only the core tier goes into the scores.
const BENCH_GROUPS = {
  core: [
    ["Suites", ["stdcbench", "coremark", "dhrystone"]],
    ["Applications", ["aes256", "puff", "zx0"]],
    ["Kernels", ["crc8", "crc16", "crc32", "sieve", "sieve-bit"]],
    ["32-bit", ["pi32", "fact32"]],
  ],
  extended: [
    ["64-bit", ["pi64", "fact64"]],
    ["Float", ["mandel", "linsolve"]],
  ],
};
const CLOCK_HZ = { z80: 4000000, sm83: 4194304 };
const CPU_NAME = { z80: "Z80", sm83: "SM83" };
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
// History colors these compilers always get: blue, orange and green. The
// others take the colors left, in display order.
const SERIES_FIXED = { "llvm-z80": "--s1", sdcc: "--s2", "80cc": "--s3" };

const state = { target: "z80", preset: "speed", metric: "cycles", tier: "core" };
let index = null;
let run = null;
let sources = {};
let info = {};
let benchInfo = {};
let cstdInfo = null;

const $ = (id) => document.getElementById(id);

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

function svgEl(tag, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* private mode */ }
}

function load(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

// Formatting

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : 2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K";
  return String(n);
}

function formatValue(n) {
  return state.metric === "cycles" ? compact(n) : n.toLocaleString("en-US");
}

function formatFull(n) {
  return n.toLocaleString("en-US") + (state.metric === "cycles" ? " cycles" : " bytes");
}

function seconds(cycles) {
  const s = cycles / CLOCK_HZ[state.target];
  const mhz = (CLOCK_HZ[state.target] / 1e6).toFixed(state.target === "z80" ? 0 : 2);
  return (s < 1 ? (s * 1000).toFixed(1) + " ms" : s.toFixed(2) + " s") + " at " + mhz + " MHz";
}

function ratio(r) {
  return r.toFixed(2) + "×";
}

function percent(r) {
  const d = (r - 1) * 100;
  return (d < 0 ? "−" : "+") + Math.abs(d).toFixed(1) + "%";
}

// Data access

// The run's compilers in compilers-info.toml order, so a change of order
// reaches runs made before it. Compilers it does not list come last.
function runCompilers() {
  const order = Object.keys(info);
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  return Object.keys(run.compilers).sort((a, b) => rank(a) - rank(b));
}

// The compilers that build for the selected CPU, in that order. The baseline
// is only the yardstick for ratios and is not shown itself.
function available() {
  return runCompilers().filter((c) => !run.compilers[c].baseline
    && run.results.some((r) => r.compiler === c && r.target === state.target && r.status !== "unsupported"));
}

// The ones the viewer has not hidden in Overall.
function compilers() {
  const hidden = hiddenSet();
  return available().filter((c) => !hidden.has(c));
}

function hiddenSet() {
  try {
    const saved = JSON.parse(load("hidden"));
    if (Array.isArray(saved)) return new Set(saved);
  } catch (_) { /* nothing hidden */ }
  return new Set();
}

function setHidden(set) {
  store("hidden", JSON.stringify([...set]));
}

function baseline() {
  return Object.keys(run.compilers).find((c) => run.compilers[c].baseline);
}

// The display name from compilers-info.toml.
function label(c) {
  return info[c]?.name || c;
}

// Marks after a compiler's name, in this order.
const MARKS = {
  nightly: { label: "Built daily", title: "Built every day from its development branch",
    svg: '<path d="M12.8 10.4A5.8 5.8 0 0 1 5.6 3.2a5.8 5.8 0 1 0 7.2 7.2Z"/>' },
  stale: { label: "Unmaintained", title: "No commits for more than six months",
    svg: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.9V8l2.2 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
};
const STALE_DAYS = 183;
const FAMILY_LOGO = { LLVM: "logos/llvm.png", SDCC: "logos/sdcc.svg" };
// Small C never had a logo; this plain mark stands in and follows the text color.
const FAMILY_MARK = {
  "Small C": '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    + '<text x="8" y="11.3" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" font-weight="700" fill="currentColor">C</text></svg>',
};

// A floppy disk, for compilers that can run on a Z80 themselves.
const NATIVE_MARK = '<path d="M2.5 2.5h8.6l2.4 2.4v8.1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
  + '<rect x="5" y="2.5" width="5" height="3.2" fill="currentColor"/>'
  + '<rect x="4.7" y="8.8" width="6.6" height="4.5" rx="0.6" fill="none" stroke="currentColor" stroke-width="1.2"/>';

function isStale(c) {
  const d = info[c]?.last_commit;
  return d ? (Date.now() - Date.parse(d)) / 864e5 > STALE_DAYS : false;
}

function markKinds(c) {
  const kinds = [];
  if (run.compilers[c]?.nightly) kinds.push("nightly");
  if (isStale(c)) kinds.push("stale");
  return kinds;
}

function markIcon(kind, title = MARKS[kind].title) {
  const m = el("span", { class: "cmark " + kind, role: "img", title, "aria-label": title });
  m.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${MARKS[kind].svg}</svg>`;
  return m;
}

function markTitle(c, kind) {
  if (kind === "stale") return `No commits since ${info[c].last_commit}`;
  return MARKS[kind].title;
}

// A compiler's name for the results, with `after` right against it. The cards
// show its marks.
function nameWithMarks(c, after = null) {
  return el("span", { class: "cname" }, el("span", {}, label(c), after));
}

// What the "!" on the selected CPU means.
function renderMarksNote() {
  const box = $("marks-note");
  box.replaceChildren();
  const cs = available();
  if (cs.some((c) => failMark(c))) {
    box.append(el("span", {}, el("span", { class: "fail-mark" }, "!"), "Some benchmarks failed"));
  }
  box.hidden = !box.childElementCount;
}

// The family, how it is built and its marks, under a card's description.
function badges(name, c) {
  const about = info[name] || {};
  const box = el("div", { class: "p-badges" });
  if (about.family) {
    const fam = el("span", { class: "p-badge", title: `Derived from ${about.family}` });
    if (FAMILY_LOGO[about.family]) fam.append(el("img", { src: FAMILY_LOGO[about.family], alt: "" }));
    if (FAMILY_MARK[about.family]) {
      const m = el("span", { class: "fam-mark" });
      m.innerHTML = FAMILY_MARK[about.family];
      fam.append(m);
    }
    fam.append(about.family);
    box.append(fam);
  }
  if (about["runs-on"]) {
    const os = about["runs-on"];
    const icon = el("span", { class: "cmark", "aria-hidden": "true" });
    icon.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${NATIVE_MARK}</svg>`;
    box.append(el("span", { class: "p-badge", title: `The compiler itself can run on a Z80, under ${os}` },
      icon, "Runs on Z80"));
  }
  for (const k of markKinds(name)) {
    box.append(el("span", { class: "p-badge", title: markTitle(name, k) }, markIcon(k, markTitle(name, k)),
      MARKS[k].label));
  }
  return box.childElementCount ? box : null;
}

function tierOf(bench) {
  return run.benchmarks[bench]?.tier || "core";
}

// [group, benchmarks] pairs of the selected tier in this run. Benchmarks in
// no group come last, under an empty name.
function benchGroups() {
  const groups = BENCH_GROUPS[state.tier] || [];
  const known = Object.keys(run.benchmarks).filter((b) => tierOf(b) === state.tier);
  const grouped = groups.flatMap(([, bs]) => bs);
  return groups.map(([g, bs]) => [g, bs.filter((b) => known.includes(b))])
    .concat([["", known.filter((b) => !grouped.includes(b)).sort()]])
    .filter(([, bs]) => bs.length);
}

function benches() {
  return benchGroups().flatMap(([, bs]) => bs);
}

function result(compiler, bench) {
  return run.results.find((r) => r.compiler === compiler && r.bench === bench
    && r.target === state.target && r.preset === state.preset);
}

function valueOf(r, metric = state.metric) {
  return r && r.status === "ok" ? r[metric === "cycles" ? "cycles" : "size"] : null;
}

function resultFor(compiler, bench, preset) {
  return run.results.find((r) => r.compiler === compiler && r.bench === bench
    && r.target === state.target && r.preset === preset);
}

// Tooltip

const tip = () => $("tip");

function showTip(target, build) {
  const t = tip();
  t.replaceChildren();
  build(t);
  t.hidden = false;
  const box = target.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let x = box.left + box.width / 2 - w / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  let y = box.top - h - 8;
  if (y < 60) y = box.bottom + 8;
  t.style.left = x + "px";
  t.style.top = y + "px";
}

function showTipAt(x, y, build) {
  const t = tip();
  t.replaceChildren();
  build(t);
  t.hidden = false;
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let left = x + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  t.style.left = Math.max(8, left) + "px";
  t.style.top = Math.max(60, Math.min(y - h / 2, window.innerHeight - h - 8)) + "px";
}

function hideTip() {
  tip().hidden = true;
}

// Run summary

function renderMeta() {
  const meta = $("run-meta");
  meta.replaceChildren();
  const ticks = run.ticks || {};
  const items = [
    ["Run", run.id],
    ["Emulator", "z88dk-ticks " + (ticks.commit || "").slice(0, 10)
      + (ticks.patches && ticks.patches.length ? " + " + ticks.patches.length + " fix" : "")],
  ];
  for (const [k, v] of items) meta.append(el("div", {}, el("dt", {}, k), el("dd", {}, v)));
}

// Overall

// Rows of a horizontal bar chart: name, bar with its value at the tip, a note
// on the right. Rows with no value show `missing` in place of the bar. Like
// the table, the best bar is blue and the worst yellow.
function barRows(box, rows) {
  box.replaceChildren();
  const vals = rows.filter((r) => r.value != null && !r.hidden).map((r) => r.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  // The longest bar leaves room for its label.
  const at = (f) => `calc((100% - 72px) * ${f})`;
  for (const r of rows) {
    const tone = r.value === min ? " best" : r.value === max ? " slow" : "";
    const off = r.hidden ? " off" : "";
    box.append(el("div", { class: "ov-name" + (r.first ? " first" : "") + off }, r.name));
    const track = el("div", { class: "ov-track" + (r.first ? " first" : "") + off });
    if (r.hidden) {
      // A hidden compiler keeps its score but not its bar, which would not be to scale.
      track.append(el("span", { class: "ov-hidden" }, r.text));
    } else if (r.value != null) {
      track.append(el("div", { class: "ov-bar" + tone, style: `width:${at(r.value / max)}` }),
        el("span", { class: "ov-val", style: `left:${at(r.value / max)}` }, r.text));
    } else {
      track.append(r.missing);
    }
    if (r.first) r.note.classList.add("first");
    if (r.hidden) r.note.classList.add("off");
    box.append(track, r.note);
  }
}

function renderOverall() {
  $("base-note").textContent = `${label(baseline())} is 1.00×`;
  renderMarksNote();
  const latest = index.runs.find((r) => r.id === index.latest);
  const scores = latest.summary[state.target][state.preset][state.metric];
  const hidden = hiddenSet();
  // Hidden compilers go last, so the ranking above them stays unbroken.
  const rank = (r) => (hidden.has(r.c) ? 1e9 : 0) + (r.score ?? 1e6);
  const rows = available().map((c) => ({ c, ...scores[c] })).sort((a, b) => rank(a) - rank(b));
  barRows($("overall"), rows.map((r) => {
    const off = hidden.has(r.c);
    const fail = failMark(r.c);
    const name = nameWithMarks(r.c, fail);
    // A compiler that did not pass everything has its name in red too.
    if (fail) name.classList.add("failing");
    const toggle = el("button", { type: "button", class: "ov-toggle", "aria-pressed": String(!off),
      title: off ? "Show this compiler" : "Hide this compiler" }, eyeIcon(off), name);
    toggle.addEventListener("click", () => {
      if (off) hidden.delete(r.c);
      else hidden.add(r.c);
      setHidden(hidden);
      hideTip();
      renderView();
    });
    return {
      name: toggle,
      hidden: off,
      value: r.score || null,
      text: r.score ? ratio(r.score) : "",
      missing: el("span", { class: "ov-none" }, "nothing passed"),
      note: el("div", { class: "ov-pass" + (r.passed < r.total ? " short" : "") }, `${r.passed}/${r.total}`),
    };
  }));
  $("show-all").hidden = !rows.some((r) => hidden.has(r.c));
}

// A red "!" when any benchmark failed to build or gave a wrong result on
// the selected CPU and preset; the title says how many of each.
function failMark(c) {
  const counts = {};
  for (const r of run.results) {
    if (r.compiler === c && r.target === state.target && r.preset === state.preset
        && tierOf(r.bench) === "core" && r.status !== "ok" && r.status !== "unsupported") {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
  }
  const words = { "build-failed": "build failed", miscompiled: "miscompiled", "run-failed": "did not run" };
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${words[k] || k}`);
  if (!parts.length) return null;
  const title = parts.join(", ");
  return el("span", { class: "fail-mark", title, "aria-label": title }, "!");
}

function eyeIcon(off) {
  const i = el("span", { class: "eye", "aria-hidden": "true" });
  i.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>'
    + (off ? '<path d="M2.5 13.5l11-11"/>' : "") + "</svg>";
  return i;
}

// Matrix

const ICON_FAIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
const ICON_BAD = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.7H1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.2v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="currentColor"/></svg>';

// A failed status as it reads after a benchmark's name.
const STATUS_TEXT = { "build-failed": "failed to build", miscompiled: "miscompiled", "run-failed": "did not run" };

function statusChip(r) {
  const kind = r ? r.status : "missing";
  const label = { "build-failed": "Build failed", miscompiled: "Miscompiled", "run-failed": "Did not run",
    missing: "Not run" }[kind] || kind;
  const s = el("span", { class: "status " + kind });
  s.innerHTML = kind === "miscompiled" ? ICON_BAD : ICON_FAIL;
  s.append(label);
  return s;
}

function renderMatrix() {
  const table = $("matrix");
  table.replaceChildren();
  const cs = compilers();
  const head = el("tr", {}, el("th", { scope: "col" }, "Benchmark"));
  for (const c of cs) head.append(el("th", { scope: "col", class: "c" }, nameWithMarks(c)));
  table.append(el("thead", {}, head));

  const body = el("tbody");
  for (const [group, bs] of benchGroups()) for (const b of bs) {
    // Where the page is too narrow for the names beside the table, a row
    // inside it starts each group.
    if (group && b === bs[0]) {
      body.append(el("tr", { class: "g-sep" },
        el("th", { scope: "rowgroup", colspan: String(cs.length + 1) }, group)));
    }
    const rs = cs.map((c) => result(c, b));
    const vals = rs.map((r) => valueOf(r)).filter((v) => v != null);
    const best = Math.min(...vals);
    const top = Math.max(...vals);
    const baseVal = valueOf(result(baseline(), b));

    const tr = el("tr", { "data-group": group }, el("th", { scope: "row" },
      el("a", { class: "b-name", href: `#src/${b}` }, b)));

    cs.forEach((c, i) => {
      const r = rs[i];
      const v = valueOf(r);
      if (v == null) {
        const td = el("td", { class: "cell fail" }, statusChip(r));
        if (r?.reason) {
          td.tabIndex = 0;
          const show = () => showTip(td, (t) => {
            t.append(el("div", { class: "t-head" }, `${label(c)} · ${b}`), el("div", { class: `t-why ${r.status}` }, r.reason));
            if (r.detail.toLowerCase() !== r.reason.toLowerCase()) t.append(el("div", {}, r.detail));
          });
          td.addEventListener("pointerenter", show);
          td.addEventListener("focus", show);
          td.addEventListener("pointerleave", hideTip);
          td.addEventListener("blur", hideTip);
        }
        tr.append(td);
        return;
      }
      const isBest = v === best;
      const isSlow = !isBest && v === top;
      const td = el("td", { class: "cell" + (isBest ? " best" : isSlow ? " slow" : ""), tabindex: "0" },
        el("span", { class: "v" }, el("span", { class: "n" }, formatValue(v)),
          el("span", { class: "r" }, baseVal ? ratio(v / baseVal) : "")),
        el("span", { class: "bar" }, el("i", { style: `width:${(v / top) * 100}%` })));
      const rank = vals.filter((x) => x < v).length + 1;
      const show = () => showTip(td, (t) => {
        t.append(el("div", { class: "t-head" }, `${label(c)} · ${b}`),
          el("div", { class: "t-val" }, formatFull(v)));
        if (state.metric === "cycles") t.append(el("div", {}, seconds(v)));
        if (baseVal) t.append(el("div", {}, `${ratio(v / baseVal)} ${label(baseline())}`));
        t.append(el("div", {}, isBest ? `Best of ${vals.length}` : `${rank} of ${vals.length}`));
      });
      td.addEventListener("pointerenter", show);
      td.addEventListener("focus", show);
      td.addEventListener("pointerleave", hideTip);
      td.addEventListener("blur", hideTip);
      tr.append(td);
    });
    body.append(tr);
  }
  table.append(body);
  placeGroups();
}

// Puts each group's name beside its rows, outside the table.
function placeGroups() {
  const box = $("matrix-groups");
  const body = $("matrix").tBodies[0];
  if (!body) return;
  const origin = box.parentElement.getBoundingClientRect().top;
  const spans = [];
  for (const tr of body.rows) {
    if (tr.classList.contains("g-sep")) continue;
    const { top, bottom } = tr.getBoundingClientRect();
    const last = spans.at(-1);
    if (last && last.group === tr.dataset.group) last.bottom = bottom;
    else spans.push({ group: tr.dataset.group, top, bottom });
  }
  box.replaceChildren(...spans.filter((s) => s.group).map((s) => el("div", {
    class: "mg", style: `top:${s.top - origin}px;height:${s.bottom - s.top}px`,
  }, el("span", {}, s.group))));
}

// History

// The marks put on a run's point, centered on it.
const FLAG_PATH = { bad: "M-3.5,-3.5L3.5,3.5M3.5,-3.5L-3.5,3.5", good: "M-4,0.5L-1.3,3.2L4,-2.8" };

// The compilers drawn in the History chart: the viewer's choice, or the ones
// compilers-info.toml marks with "history".
function historyShown() {
  try {
    const saved = JSON.parse(load("history"));
    if (Array.isArray(saved)) return new Set(saved);
  } catch (_) { /* nothing saved */ }
  return new Set(Object.keys(info).filter((c) => info[c].history));
}

function renderHistory() {
  const box = $("history-chart");
  box.replaceChildren();
  const runs = index.runs;
  if (!runs.length) {
    box.append(el("p", { class: "empty" }, "No history yet."));
    return;
  }

  const cs = compilers();
  // A compiler keeps its color on both CPUs and whatever is switched off.
  const rest = runCompilers().filter((c) => !run.compilers[c].baseline && !SERIES_FIXED[c]);
  const free = SERIES.filter((s) => !Object.values(SERIES_FIXED).includes(s));
  const color = (c) => `var(${SERIES_FIXED[c] || free[rest.indexOf(c) % free.length]})`;
  // Past the palette, colors come round again on dashed lines.
  const dashed = (c) => rest.indexOf(c) >= free.length;
  const swatch = (c) => dashed(c)
    ? `background:repeating-linear-gradient(90deg, ${color(c)} 0 4px, transparent 4px 7px)`
    : `background:${color(c)}`;
  const shown = historyShown();
  const series = cs.filter((c) => shown.has(c)).map((c) => ({
    c,
    pts: runs.map((r, i) => {
      const s = r.summary?.[state.target]?.[state.preset]?.[state.metric]?.[c];
      return s && s.value ? { i, y: s.value, s } : null;
    }).filter(Boolean),
  })).filter((s) => s.pts.length);

  const legend = el("div", { class: "legend" });
  for (const c of cs) {
    const b = el("button", { type: "button", "aria-pressed": String(shown.has(c)) },
      el("i", { style: swatch(c) }), label(c));
    b.addEventListener("click", () => {
      if (shown.has(c)) shown.delete(c);
      else shown.add(c);
      store("history", JSON.stringify([...shown]));
      renderHistory();
    });
    legend.append(b);
  }
  box.append(legend);
  if (!series.length) {
    box.append(el("p", { class: "empty" }, "Nothing selected."));
    return;
  }

  const W = Math.max(box.clientWidth - 32, 320);
  const H = 300;
  const pad = { l: 44, r: 84, t: 10, b: 28 };
  const ys = series.flatMap((s) => s.pts.map((p) => p.y));
  const lo = Math.min(...ys) * 0.96;
  const hi = Math.max(...ys) * 1.04;
  // A single run sits in the middle.
  const x = (i) => pad.l + (runs.length === 1 ? 0.5 : i / (runs.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": "Geometric mean per compiler over time" });
  const grid = svgEl("g", { class: "grid" });
  const axis = svgEl("g", { class: "axis" });
  const step = (hi - lo) / 4;
  for (let k = 0; k <= 4; k++) {
    const v = lo + step * k;
    grid.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    const t = svgEl("text", { x: pad.l - 8, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = formatValue(v);
    axis.append(t);
  }
  const every = Math.ceil(runs.length / 8);
  runs.forEach((r, i) => {
    if (i % every && i !== runs.length - 1) return;
    const t = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle" });
    t.textContent = r.id.slice(5);
    axis.append(t);
  });
  svg.append(grid, axis);

  const cross = svgEl("line", { class: "cross", y1: pad.t, y2: H - pad.b, visibility: "hidden" });
  svg.append(cross);

  const ends = svgEl("g", { class: "end" });
  const placed = [];
  for (const s of series) {
    const d = s.pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.y)}`).join("");
    svg.append(svgEl("path", { d, fill: "none", stroke: color(s.c), "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": dashed(s.c) ? "6 4" : "none" }));
    const last = s.pts[s.pts.length - 1];
    svg.append(svgEl("circle", { cx: x(last.i), cy: y(last.y), r: 4, fill: color(s.c),
      stroke: "var(--surface)", "stroke-width": 2 }));
    // Label line ends only where they will not collide; the legend covers the rest.
    const ly = y(last.y);
    if (placed.every((p) => Math.abs(p - ly) >= 14)) {
      placed.push(ly);
      const t = svgEl("text", { x: x(last.i) + 10, y: ly + 4 });
      t.textContent = label(s.c);
      ends.append(t);
    }
  }
  svg.append(ends);

  // A cross on a run where the compiler newly failed a benchmark, a check
  // mark where it passed one again, drawn over every line.
  for (const s of series) {
    for (const p of s.pts) {
      const flags = [];
      if (Object.keys(p.s.new_failures || {}).length) flags.push("bad");
      if (p.s.fixed?.length) flags.push("good");
      flags.forEach((kind, k) => {
        const g = svgEl("g", { class: `h-flag ${kind}`,
          transform: `translate(${x(p.i) + (k - (flags.length - 1) / 2) * 10},${y(p.y)})` });
        g.append(svgEl("path", { d: FLAG_PATH[kind], class: "halo" }), svgEl("path", { d: FLAG_PATH[kind] }));
        svg.append(g);
      });
    }
  }

  const hit = svgEl("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b,
    fill: "transparent" });
  hit.addEventListener("pointermove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (runs.length - 1));
    const idx = Math.max(0, Math.min(runs.length - 1, i));
    cross.setAttribute("x1", x(idx));
    cross.setAttribute("x2", x(idx));
    cross.setAttribute("visibility", "visible");
    showTipAt(ev.clientX, ev.clientY, (t) => {
      t.append(el("div", { class: "t-head" }, runs[idx].id));
      const rows = series.map((s) => ({ s, p: s.pts.find((p) => p.i === idx) }))
        .filter((r) => r.p).sort((a, b) => a.p.y - b.p.y);
      for (const { s, p } of rows) {
        t.append(el("div", { class: "t-row" }, el("i", { style: swatch(s.c) }), label(s.c),
          el("b", {}, formatValue(p.y))));
      }
      for (const { s, p } of rows) {
        const failed = Object.entries(p.s.new_failures || {});
        const fixed = p.s.fixed || [];
        if (!failed.length && !fixed.length) continue;
        const box = el("div", { class: "t-change" }, el("div", { class: "t-name" }, label(s.c)));
        for (const [b, st] of failed) {
          box.append(el("div", {}, el("span", { class: "bad" }, "✕"), ` ${b} ${STATUS_TEXT[st] || st}`));
        }
        for (const b of fixed) box.append(el("div", {}, el("span", { class: "good" }, "✓"), ` ${b} passes again`));
        const prev = s.pts.find((q) => q.i === idx - 1);
        if (prev && p.s.step) {
          box.append(el("div", { class: "t-step" },
            `Line ${percent(p.y / prev.y)}, same benchmarks ${percent(p.s.step)}`));
        }
        t.append(box);
      }
    });
  });
  hit.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    hideTip();
  });
  svg.append(hit);
  box.append(svg);
}

// C support

const STANDARDS = ["C2y", "C23", "C11", "C99"];
// The freely available draft WG14 lists for each standard.
const STANDARD_DRAFT = {
  C2y: "N3886", C23: "N3220", C11: "N1570", C99: "N1256",
};
const WG14_DOCS = "https://www.open-std.org/jtc1/sc22/wg14/www/docs/";

// The standards whose features are folded away; all of them at first.
function cstdClosed() {
  try {
    const saved = JSON.parse(load("cstd-closed"));
    if (Array.isArray(saved)) return new Set(saved);
  } catch (_) { /* nothing saved */ }
  return new Set(STANDARDS);
}

// cppstat's descriptions: `code`, _terms_ and Markdown links. A _term_ stands
// on its own, so names such as __has_c_attribute stay as they are.
function descNodes(text) {
  const out = [];
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  plain.split(/(`[^`]+`|(?<!\w)_[^_\s][^_]*_(?!\w))/).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 0) out.push(part);
    else if (part.startsWith("`")) out.push(el("code", {}, part.slice(1, -1)));
    else out.push(el("em", {}, part.slice(1, -1)));
  });
  return out;
}

const CSTD_MARK = { ok: "✓", bad: "✗", no: "—" };

function hoverTip(td, fill) {
  td.tabIndex = 0;
  const show = () => showTip(td, fill);
  td.addEventListener("pointerenter", show);
  td.addEventListener("focus", show);
  td.addEventListener("pointerleave", hideTip);
  td.addEventListener("blur", hideTip);
}

function cstdCell(r, c, feature) {
  const kind = !r ? "" : r.status === "ok" ? "ok" : r.status === "miscompiled" ? "bad" : "no";
  const td = el("td", { class: `res ${kind}` }, CSTD_MARK[kind] || "");
  if (r && r.status !== "ok") {
    hoverTip(td, (t) => {
      t.append(el("div", { class: "t-head" }, label(c)), el("div", {}, ...descNodes(feature.description)));
      if (r.reason) t.append(el("div", { class: `t-why ${r.status}` }, r.reason));
      if (r.detail && r.detail.toLowerCase() !== (r.reason || "").toLowerCase()) t.append(el("div", {}, r.detail));
    });
  }
  return td;
}

// A feature checked manually says what the compiler did and the version that
// did it, since the check does not run again with each new one.
function cstdManualCell(m, c, feature) {
  const checked = cstdInfo.compilers?.[c];
  if (!m || !checked) return el("td", { class: "res" });
  const td = el("td", { class: `res ${m.result}` }, CSTD_MARK[m.result], el("span", { class: "manual-mark" }, "*"));
  hoverTip(td, (t) => {
    t.append(el("div", { class: "t-head" }, label(c)), el("div", {}, ...descNodes(feature.description)),
      el("div", { class: "t-manual" }, `Checked manually on ${checked.checked} with ${checked.version}`),
      el("div", {}, m.note));
  });
  return td;
}

// The features in cppstat's order: a probe's result comes from the run, and a
// feature checked manually carries its own. Without cstd.json, the run's probes.
function cstdRows() {
  if (!cstdInfo) {
    return Object.entries(run.benchmarks).filter(([, v]) => v.tier === "cstd")
      .map(([bench, v]) => ({ bench, check: "run", ...v }));
  }
  return cstdInfo.features.filter((f) => f.check === "manual" || (f.check === "run" && run.benchmarks[f.bench]));
}

// Every compiler's probes, whatever CPU is selected: each ran on its first.
// The table is built again only when the compilers shown change, and a
// standard folds by hiding its rows, so the columns and the page stay put.
let cstdShown = null;

function renderCstd() {
  const feats = cstdRows();
  $("cstd").hidden = !feats.length;
  if (!feats.length) return;
  const hidden = hiddenSet();
  const cs = runCompilers().filter((c) => !run.compilers[c].baseline && !hidden.has(c)
    && run.results.some((r) => r.compiler === c && tierOf(r.bench) === "cstd"));
  if (cstdShown === cs.join()) return;
  cstdShown = cs.join();
  const res = (c, b) => run.results.find((r) => r.compiler === c && r.bench === b);
  const works = (c, f) => (f.check === "manual" ? f.results[c]?.result === "ok" : res(c, f.bench)?.status === "ok");

  const table = $("cstd-table");
  table.replaceChildren();
  // The compilers share what the feature and paper columns leave, equally; a
  // long name breaks at its hyphen or space.
  const cols = el("colgroup", {}, el("col", { class: "c-feature" }), el("col", { class: "c-paper" }));
  for (const c of cs) cols.append(el("col"));
  table.append(cols);
  table.style.minWidth = `${340 + 72 * cs.length}px`;

  const head = el("tr", {}, el("th", { scope: "col" }, "Feature"), el("th", { scope: "col" }, "Paper"));
  for (const c of cs) head.append(el("th", { scope: "col", class: "c" }, el("span", { class: "c-name" }, label(c))));
  table.append(el("thead", {}, head));

  const closed = cstdClosed();
  for (const std of STANDARDS) {
    const rows = feats.filter((f) => f.standard === std);
    if (!rows.length) continue;
    const body = el("tbody", { class: closed.has(std) ? "closed" : "" });
    const toggle = el("button", { type: "button", class: "cstd-toggle", "aria-expanded": String(!closed.has(std)) },
      el("span", { class: "chev", "aria-hidden": "true" }, "›"), std,
      el("span", { class: "cstd-count" }, `${rows.length} features`));
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("closed") === false;
      toggle.setAttribute("aria-expanded", String(open));
      const now = cstdClosed();
      if (open) now.delete(std);
      else now.add(std);
      store("cstd-closed", JSON.stringify([...now]));
    });
    const draft = STANDARD_DRAFT[std];
    const group = el("tr", { class: "cstd-group" }, el("th", { scope: "rowgroup" }, toggle),
      el("td", { class: "papers" }, draft
        ? el("a", { href: `${WG14_DOCS}${draft.toLowerCase()}.pdf`, title: `The ${std} draft` }, draft) : ""));
    for (const c of cs) {
      const n = rows.filter((f) => works(c, f)).length;
      // One hue, deeper the more of the standard works.
      const share = n / rows.length;
      group.append(el("td", { class: "cstd-sum", title: `${label(c)}: ${n} of ${rows.length} ${std} features work`,
        style: `--share:${Math.round(share * 100)}%` }, `${n}/${rows.length}`));
    }
    body.append(group);
    for (const f of rows) {
      const tr = el("tr", { class: "cstd-row" },
        el("th", { scope: "row" }, el("a", { class: "f-name", href: `#src/${f.bench}` }, ...descNodes(f.description))),
        el("td", { class: "papers" }, ...paperLinks(f.papers)));
      for (const c of cs) {
        tr.append(f.check === "manual" ? cstdManualCell(f.results[c], c, f) : cstdCell(res(c, f.bench), c, f));
      }
      body.append(tr);
    }
    table.append(body);
  }
  renderCstdOthers();
  fitCstdNames();
}

// The compiler columns are all as wide; a name too long for one gets a
// smaller font, just enough to stay on one line, and wraps only below 9px.
function fitCstdNames() {
  for (const name of $("cstd-table").querySelectorAll("thead .c-name")) {
    name.style.fontSize = "";
    name.classList.remove("wrap");
    const th = name.parentElement;
    const style = getComputedStyle(th);
    const room = th.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const need = name.getBoundingClientRect().width;
    if (room <= 0 || need <= room) continue;
    const size = parseFloat(getComputedStyle(name).fontSize) * room / need;
    name.style.fontSize = `${Math.max(9, Math.floor(size * 10) / 10)}px`;
    if (size < 9) name.classList.add("wrap");
  }
}

function paperLinks(papers) {
  return Object.entries(papers || {}).map(([n, u]) => el("a", { href: u }, n));
}

// The features no probe or manual check covers, folded away under the table,
// each with the reason.
function renderCstdOthers() {
  const box = $("cstd-others");
  const others = (cstdInfo?.features || []).filter((f) => f.check === "none");
  box.hidden = !others.length;
  if (!others.length || box.dataset.built) return;
  box.dataset.built = "1";
  $("cstd-others-count").textContent = `${others.length} more features not checked`;
  const table = $("cstd-others-table");
  table.append(el("colgroup", {}, el("col", { class: "c-feature" }), el("col", { class: "c-paper" }), el("col")),
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Feature"), el("th", { scope: "col" }, "Paper"),
      el("th", { scope: "col" }, "Why"))));
  for (const std of STANDARDS) {
    const rows = others.filter((f) => f.standard === std);
    if (!rows.length) continue;
    const body = el("tbody", {}, el("tr", { class: "cstd-group" },
      el("th", { scope: "rowgroup", colspan: "3" }, std, el("span", { class: "cstd-count" }, `${rows.length} features`))));
    for (const f of rows) {
      body.append(el("tr", {}, el("th", { scope: "row" }, ...descNodes(f.description)),
        el("td", { class: "papers" }, ...paperLinks(f.papers)), el("td", { class: "why" }, ...descNodes(f.why))));
    }
    table.append(body);
  }
}

// Compilers and benchmarks

function renderCompilers() {
  const box = $("compiler-cards");
  box.replaceChildren();
  for (const name of runCompilers()) {
    const c = run.compilers[name];
    if (c.baseline) continue;
    const about = info[name] || {};
    const facts = el("dl", { class: "p-facts" });
    const fact = (k, v) => v && facts.append(el("dt", {}, k), el("dd", {}, v));
    fact("Language", about["language-url"] && about.language
      ? el("a", { href: about["language-url"] }, about.language) : about.language);
    fact("License", about.license);
    fact("Builds", c.nightly ? `Every day from ${about.branch || "its development branch"}` : "A fixed release");
    fact("Last commit", about.last_commit);
    const flags = el("dl", { class: "p-facts" });
    for (const t of ["z80", "sm83"]) {
      for (const p of ["speed", "size"]) {
        const f = c.flags?.[t]?.[p];
        if (f) flags.append(el("dt", {}, `${CPU_NAME[t]} ${p}`), el("dd", {}, el("code", {}, f.join(" ") || "(none)")));
      }
    }
    const options = el("details", { class: "p-options" }, el("summary", {}, "Compiler options"), flags);
    const host = about.homepage ? new URL(about.homepage).host + new URL(about.homepage).pathname.replace(/\/$/, "") : "";
    const logo = el("div", { class: "p-logo" });
    if (about.logo) logo.append(el("img", { src: about.logo, alt: "", class: about["pixel-art"] ? "pixel" : "" }));
    box.append(el("article", { class: "profile" }, logo, el("div", { class: "p-main" },
      el("header", { class: "p-head" },
        el("h3", {}, label(name)),
        el("span", { class: "p-ver" }, c.version),
        about.homepage ? el("a", { class: "p-link", href: about.homepage }, host) : null),
      el("div", { class: "p-body" },
        el("div", { class: "p-text" }, el("p", {}, about.description || ""),
          about.since ? el("p", { class: "p-since" }, `Since ${about.since}`) : null, badges(name, c)),
        el("div", { class: "p-side" }, facts, options)))));
  }
}

// Every compiler with both presets, in cycles and in bytes, on the selected CPU.
function renderBenchmarks() {
  const box = $("bench-cards");
  box.replaceChildren();
  const cs = compilers();
  const base = baseline();
  const fmt = { cycles: compact, size: (n) => n.toLocaleString("en-US") };
  for (const b of benches()) {
    const about = benchInfo[b] || run.benchmarks[b];
    const charts = el("div", { class: "bench-charts" });
    for (const [metric, title] of [["cycles", "Cycles"], ["size", "Bytes"]]) {
      const rows = [];
      for (const c of cs) {
        for (const p of ["speed", "size"]) {
          const r = resultFor(c, b, p);
          const v = valueOf(r, metric);
          const bv = valueOf(resultFor(base, b, p), metric);
          rows.push({
            name: el("span", {}, label(c), " ", el("span", { class: "preset" }, p)),
            first: p === "speed" && c !== cs[0],
            value: v,
            text: v == null ? "" : fmt[metric](v),
            missing: el("span", { class: "fail-why", title: r?.detail || "" }, statusChip(r),
              r?.reason ? el("span", { class: "why" }, r.reason) : null),
            note: el("div", { class: "ov-pass" }, v != null && bv ? ratio(v / bv) : ""),
          });
        }
      }
      const bars = el("div", { class: "overall bars" });
      barRows(bars, rows);
      charts.append(el("div", { class: "bench-chart" }, el("h4", {}, title), bars));
    }
    box.append(el("article", { class: "bench", id: `bench-${b}` },
      el("header", { class: "bench-head" },
        el("h3", {}, el("a", { href: `#src/${b}` }, b)),
        about.url ? el("a", { class: "bench-origin", href: about.url }, about.origin) : null),
      el("p", { class: "bench-text" }, about.details || about.description),
      charts));
  }
}

// Source viewer

const C_KEYWORDS = "auto break case const continue default do else enum extern for goto if inline register "
  + "restrict return sizeof static struct switch typedef union volatile while";
const C_TYPES = "void char short int long float double signed unsigned _Bool bool size_t uintptr_t "
  + "int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t";
const C_TOKEN = new RegExp([
  String.raw`(?<comment>\/\*[\s\S]*?\*\/|\/\/[^\n]*)`,
  String.raw`(?<pre>^[ \t]*#[^\n]*)`,
  String.raw`(?<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`,
  String.raw`(?<number>\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)[uUlLfF]*\b)`,
  `(?<keyword>\\b(?:${C_KEYWORDS.split(" ").join("|")})\\b)`,
  `(?<type>\\b(?:${C_TYPES.split(" ").join("|")})\\b)`,
].join("|"), "gm");

// Lines of highlighted code, built as DOM so file contents never reach innerHTML.
function highlight(text) {
  const code = $("viewer-code");
  code.replaceChildren();
  let line = el("span", { class: "l" });
  const add = (cls, str) => {
    const parts = str.split("\n");
    parts.forEach((part, i) => {
      if (i) {
        code.append(line, "\n");
        line = el("span", { class: "l" });
      }
      if (part) line.append(cls ? el("span", { class: "t-" + cls }, part) : part);
    });
  };
  let last = 0;
  for (const m of text.replace(/\n$/, "").matchAll(C_TOKEN)) {
    add(null, text.slice(last, m.index));
    add(Object.keys(m.groups).find((k) => m.groups[k] !== undefined), m[0]);
    last = m.index + m[0].length;
  }
  add(null, text.replace(/\n$/, "").slice(last));
  code.append(line);
}

async function showFile(bench, path) {
  for (const t of $("viewer-files").querySelectorAll("button")) {
    t.setAttribute("aria-current", String(t.dataset.path === path));
  }
  $("viewer-path").textContent = path;
  const res = await fetch(`src/${path}`);
  highlight(res.ok ? await res.text() : "// not found");
  document.querySelector(".v-code").scrollTop = 0;
  history.replaceState(null, "", `#src/${bench}/${path}`);
}

function openSource(bench, path) {
  const files = sources[bench];
  // A C feature checked manually is in no run.
  const info = benchInfo[bench] || run.benchmarks[bench] || cstdInfo?.features.find((f) => f.bench === bench);
  if (!files || !info) return;
  $("viewer-title").textContent = bench;
  const sub = $("viewer-sub");
  sub.replaceChildren(info.description);
  if (info.origin) sub.append(" \u00b7 ", info.url ? el("a", { href: info.url }, info.origin) : info.origin);
  // Files grouped by directory, in the order publish.py listed them.
  const list = $("viewer-files");
  list.replaceChildren();
  let dir = null;
  for (const f of files) {
    const d = f.slice(0, f.lastIndexOf("/"));
    if (d !== dir) {
      list.append(el("div", { class: "v-dir" }, d));
      dir = d;
    }
    const item = el("button", { type: "button", "data-path": f, title: f }, f.slice(d.length + 1));
    item.addEventListener("click", () => showFile(bench, f));
    list.append(item);
  }
  const dialog = $("viewer");
  if (!dialog.open) dialog.showModal();
  showFile(bench, files.includes(path) ? path : files[0]);
}

function routeHash() {
  const m = location.hash.match(/^#src\/([^/]+)(?:\/(.+))?$/);
  if (m) openSource(decodeURIComponent(m[1]), m[2] && decodeURIComponent(m[2]));
}

function setupViewer() {
  const dialog = $("viewer");
  dialog.querySelector(".v-close").addEventListener("click", () => dialog.close());
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    history.replaceState(null, "", location.pathname + location.search);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && dialog.open) dialog.close();
  });
  window.addEventListener("hashchange", routeHash);
}

// Controls

function syncControls() {
  for (const seg of document.querySelectorAll(".seg")) {
    for (const b of seg.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(state[seg.dataset.key] === b.dataset.value));
    }
  }
}

function renderView() {
  syncControls();
  renderOverall();
  renderMatrix();
  renderHistory();
  renderBenchmarks();
  renderCstd();
}

function setupControls() {
  $("show-all").addEventListener("click", () => {
    setHidden(new Set());
    renderView();
  });
  for (const seg of document.querySelectorAll(".seg")) {
    seg.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      state[seg.dataset.key] = b.dataset.value;
      store("view", JSON.stringify(state));
      hideTip();
      renderView();
    });
  }
  try {
    Object.assign(state, JSON.parse(load("view") || "{}"));
  } catch (_) { /* keep defaults */ }
}

function setupTheme() {
  const saved = load("theme");
  if (saved) document.documentElement.dataset.theme = saved;
  document.querySelector(".theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store("theme", next);
    renderHistory();
  });
}

async function main() {
  setupTheme();
  setupControls();
  setupViewer();
  index = await (await fetch("data/index.json")).json();
  run = await (await fetch(`data/runs/${index.latest}.json`)).json();
  sources = await (await fetch("data/sources.json")).json();
  info = await (await fetch("data/compilers.json")).json();
  benchInfo = await (await fetch("data/benchmarks.json")).json();
  // Older data has no list of C features beyond the run's probes.
  cstdInfo = await fetch("data/cstd.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  renderMeta();
  renderView();
  renderCompilers();
  routeHash();
  new ResizeObserver(placeGroups).observe($("matrix"));
  new ResizeObserver(fitCstdNames).observe($("cstd-table").parentElement);
  let width = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      renderHistory();
    }
  });
}

main();
