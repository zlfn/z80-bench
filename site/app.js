"use strict";

// Display order: the two whole-program benchmarks first, Dhrystone last.
const BENCH_ORDER = ["stdcbench", "coremark", "aes256", "puff", "pi", "crc8", "crc16", "crc32",
  "sieve", "sieve-bit", "fact", "dhrystone"];
const CLOCK_HZ = { z80: 4000000, sm83: 4194304 };
const CPU_NAME = { z80: "Z80", sm83: "SM83" };
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];

const state = { target: "z80", preset: "speed", metric: "cycles" };
let index = null;
let run = null;
let sources = {};
let info = {};
let benchInfo = {};

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

// Data access

// The compilers that build for the selected CPU, in compilers.toml order.
// The baseline is only the yardstick for ratios and is not shown itself.
function compilers() {
  return Object.keys(run.compilers).filter((c) => !run.compilers[c].baseline
    && run.results.some((r) => r.compiler === c && r.target === state.target && r.status !== "unsupported"));
}

function baseline() {
  return Object.keys(run.compilers).find((c) => run.compilers[c].baseline);
}

// The display name from compilers-info.toml.
function label(c) {
  return (info[c]?.name || c) + (info[c]?.modified ? "*" : "");
}

function benches() {
  const known = Object.keys(run.benchmarks);
  return BENCH_ORDER.filter((b) => known.includes(b))
    .concat(known.filter((b) => !BENCH_ORDER.includes(b)).sort());
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
  const vals = rows.filter((r) => r.value != null).map((r) => r.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  // The longest bar leaves room for its label.
  const at = (f) => `calc((100% - 72px) * ${f})`;
  for (const r of rows) {
    const tone = r.value === min ? " best" : r.value === max ? " slow" : "";
    box.append(el("div", { class: "ov-name" + (r.first ? " first" : "") }, r.name));
    const track = el("div", { class: "ov-track" + (r.first ? " first" : "") });
    if (r.value != null) {
      track.append(el("div", { class: "ov-bar" + tone, style: `width:${at(r.value / max)}` }),
        el("span", { class: "ov-val", style: `left:${at(r.value / max)}` }, r.text));
    } else {
      track.append(r.missing);
    }
    if (r.first) r.note.classList.add("first");
    box.append(track, r.note);
  }
}

function renderOverall() {
  $("base-note").textContent = `${label(baseline())} is 1.00×`;
  $("mod-note").hidden = !compilers().some((c) => info[c]?.modified);
  const latest = index.runs.find((r) => r.id === index.latest);
  const scores = latest.summary[state.target][state.preset][state.metric];
  const rows = compilers().map((c) => ({ c, ...scores[c] }))
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));
  barRows($("overall"), rows.map((r) => ({
    name: label(r.c),
    value: r.score || null,
    text: r.score ? ratio(r.score) : "",
    missing: el("span", { class: "ov-none" }, "nothing passed"),
    note: el("div", { class: "ov-pass" + (r.passed < r.total ? " short" : "") }, `${r.passed}/${r.total}`),
  })));
}

// Matrix

const ICON_FAIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
const ICON_BAD = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.7H1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.2v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="currentColor"/></svg>';

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
  for (const c of cs) head.append(el("th", { scope: "col", class: "c" }, label(c)));
  table.append(el("thead", {}, head));

  const body = el("tbody");
  for (const b of benches()) {
    const info = benchInfo[b] || run.benchmarks[b];
    const rs = cs.map((c) => result(c, b));
    const vals = rs.map((r) => valueOf(r)).filter((v) => v != null);
    const best = Math.min(...vals);
    const top = Math.max(...vals);
    const baseVal = valueOf(result(baseline(), b));

    const tr = el("tr", {}, el("th", { scope: "row" }, el("a", { class: "b-name", href: `#src/${b}` }, b),
      el("span", { class: "b-desc" }, info.description)));

    cs.forEach((c, i) => {
      const r = rs[i];
      const v = valueOf(r);
      if (v == null) {
        tr.append(el("td", { class: "cell fail" }, statusChip(r)));
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
}

// History

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
  if (runs.length < 2) {
    box.append(el("p", { class: "empty" }, "No history yet."));
    return;
  }

  const cs = compilers();
  // A compiler keeps its color on both CPUs and whatever is switched off.
  const all = Object.keys(run.compilers).filter((c) => !run.compilers[c].baseline);
  const color = (c) => `var(${SERIES[all.indexOf(c) % SERIES.length]})`;
  const shown = historyShown();
  const series = cs.filter((c) => shown.has(c)).map((c) => ({
    c,
    pts: runs.map((r, i) => {
      const s = r.summary?.[state.target]?.[state.preset]?.[state.metric]?.[c];
      return s && s.value ? { i, y: s.value } : null;
    }).filter(Boolean),
  })).filter((s) => s.pts.length);

  const legend = el("div", { class: "legend" });
  for (const c of cs) {
    const b = el("button", { type: "button", "aria-pressed": String(shown.has(c)) },
      el("i", { style: `background:${color(c)}` }), label(c));
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
  const H = 240;
  const pad = { l: 44, r: 84, t: 10, b: 28 };
  const ys = series.flatMap((s) => s.pts.map((p) => p.y));
  const lo = Math.min(...ys) * 0.96;
  const hi = Math.max(...ys) * 1.04;
  const x = (i) => pad.l + (runs.length === 1 ? 0 : (i / (runs.length - 1)) * (W - pad.l - pad.r));
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
      "stroke-linejoin": "round", "stroke-linecap": "round" }));
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
        t.append(el("div", { class: "t-row" }, el("i", { style: `background:${color(s.c)}` }), label(s.c),
          el("b", {}, formatValue(p.y))));
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

// Compilers and benchmarks

function renderCompilers() {
  const box = $("compiler-cards");
  box.replaceChildren();
  for (const [name, c] of Object.entries(run.compilers)) {
    if (c.baseline) continue;
    const about = info[name] || {};
    const facts = el("dl", { class: "p-facts" });
    const fact = (k, v) => v && facts.append(el("dt", {}, k), el("dd", {}, v));
    fact("Language", about.language);
    fact("License", about.license);
    fact("Modified", about.modified);
    for (const t of ["z80", "sm83"]) {
      for (const p of ["speed", "size"]) {
        const f = c.flags?.[t]?.[p];
        if (f) fact(`${CPU_NAME[t]} ${p}`, el("code", {}, f.join(" ") || "(none)"));
      }
    }
    const host = about.homepage ? new URL(about.homepage).host + new URL(about.homepage).pathname.replace(/\/$/, "") : "";
    const logo = el("div", { class: "p-logo" });
    if (about.logo) logo.append(el("img", { src: about.logo, alt: "", class: about["pixel-art"] ? "pixel" : "" }));
    box.append(el("article", { class: "profile" }, logo, el("div", { class: "p-main" },
      el("header", { class: "p-head" },
        el("h3", {}, label(name)),
        el("span", { class: "p-ver" }, c.version),
        about.homepage ? el("a", { class: "p-link", href: about.homepage }, host) : null),
      el("div", { class: "p-body" },
        el("div", { class: "p-text" }, el("p", {}, about.description || "")),
        facts))));
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
            missing: statusChip(r),
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
  const info = benchInfo[bench] || run.benchmarks[bench];
  if (!files || !info) return;
  $("viewer-title").textContent = bench;
  const sub = $("viewer-sub");
  sub.replaceChildren(info.description, " \u00b7 ",
    info.url ? el("a", { href: info.url }, info.origin) : info.origin);
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
}

function setupControls() {
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
  renderMeta();
  renderView();
  renderCompilers();
  routeHash();
  let width = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      renderHistory();
    }
  });
}

main();
