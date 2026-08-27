#!/usr/bin/env node
// Regression suite for mpef-analyzer-offline.html's scoring engine.
// No dependencies. Run: node test/run.js
"use strict";
const path = require("path");
const { boot } = require("./dom-stub");
const { SAMPLE_EXPECTED, WORKBOOK_EXTRACTION, WORKBOOK_EXPECTED } = require("./fixtures");

const APP_PATH = path.join(__dirname, "..", "mpef-analyzer-offline.html");

let pass = 0, fail = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ok  " + name);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message || String(e) });
    console.log("FAIL  " + name);
    console.log("        " + (e.message || e));
  }
}
function assertClose(actual, expected, tol, msg) {
  if (actual === null || actual === undefined || !isFinite(actual))
    throw new Error((msg || "value") + ": expected ~" + expected + ", got " + actual);
  if (Math.abs(actual - expected) > tol)
    throw new Error((msg || "value") + ": expected " + expected + " (+/-" + tol + "), got " + actual);
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || "value") + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
function assertTrue(cond, msg) { if (!cond) throw new Error(msg || "expected true"); }
function assertNull(v, msg) { if (v !== null) throw new Error((msg || "value") + ": expected null, got " + JSON.stringify(v)); }

// ---------------------------------------------------------------------
console.log("=== Fixture A: built-in Sample meeting (local rule engine) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);

  check("MPI ~= 75.13 (reuse guide sec7 / README acceptance test: 'MPI 75 . Productive')", () =>
    assertClose(model.mpi, SAMPLE_EXPECTED.mpi, SAMPLE_EXPECTED.mpiTolerance, "mpi"));
  check("band == Productive", () => assertEqual(model.band, SAMPLE_EXPECTED.band, "band"));
  check("6 of 6 dimensions assessable", () => assertEqual(model.assessable, SAMPLE_EXPECTED.assessable, "assessable"));
  for (const d of Object.keys(SAMPLE_EXPECTED.dims)) {
    check("dimension " + d + " ~= " + SAMPLE_EXPECTED.dims[d], () =>
      assertClose(model.dims[d], SAMPLE_EXPECTED.dims[d], SAMPLE_EXPECTED.dimTolerance, d));
  }
  check("condensed-transcript disclosure fires (honest-measurement rule 1)", () =>
    assertTrue(ext.quality.notes.some(n => /condensed transcript/.test(n)), "notes: " + JSON.stringify(ext.quality.notes)));
}

// ---------------------------------------------------------------------
console.log("\n=== Fixture B: workbook example meeting (docs/mpef-meeting-scorecard.xlsx) ===");
{
  const { sandbox } = boot(APP_PATH);
  const model = sandbox.compute(WORKBOOK_EXTRACTION);

  check("MPI matches workbook Scorecard!C49 to 1e-6", () =>
    assertClose(model.mpi, WORKBOOK_EXPECTED.mpi, WORKBOOK_EXPECTED.tolerance, "mpi"));
  check("band matches workbook Scorecard!C50", () => assertEqual(model.band, WORKBOOK_EXPECTED.band, "band"));

  for (const d of Object.keys(WORKBOOK_EXPECTED.dims)) {
    check("dimension " + d + " matches workbook to 1e-6", () =>
      assertClose(model.dims[d], WORKBOOK_EXPECTED.dims[d], WORKBOOK_EXPECTED.tolerance, d));
  }
  for (const label of Object.keys(WORKBOOK_EXPECTED.metricsByLabel)) {
    check("metric '" + label + "' matches workbook to 1e-6", () => {
      const m = model.metrics.find(x => x.label === label);
      if (!m) throw new Error("metric not found in app output: " + label);
      assertClose(m.score, WORKBOOK_EXPECTED.metricsByLabel[label], WORKBOOK_EXPECTED.tolerance, label);
    });
  }
}

// ---------------------------------------------------------------------
console.log("\n=== Evidence-honesty gates (agent spec sec1 EVIDENCE-HONESTY GATES) ===");
{
  // Gate: condensed transcript (<50% of floor time transcribed) blanks
  // pace/filler/monologue/density.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value =
    "[10:00] Sara: We reviewed the budget.\n" +
    "[10:10] Sara: It looks fine overall.\n" +
    "[10:20] Omar: Any risk there at all?\n" +
    "[10:30] Sara: Not that we can see right now.";
  const ext = sandbox.localExtract();
  check("condensed transcript detected on sparse timestamped input", () =>
    assertTrue(ext.quality.notes.some(n => /condensed transcript/.test(n)), JSON.stringify(ext.quality.notes)));
  const model = sandbox.compute(ext);
  check("pace deviation is Not Assessable on condensed transcript", () =>
    assertNull(model.metrics.find(m => m.label === "Pace deviation").score));
  check("monologue ratio is Not Assessable on condensed transcript", () =>
    assertNull(model.metrics.find(m => m.label === "Monologue ratio").score));
}
{
  // Gate: minute-level timestamps make response latency Not Assessable.
  const { sandbox, els } = boot(APP_PATH);
  els.aTrans.value =
    "[10:00] Sara: Any objections to the plan here today?\n" +
    "[10:01] Omar: None from me, looks solid to go.";
  const ext = sandbox.localExtract();
  check("minute-level timestamps flagged", () =>
    assertTrue(ext.quality.notes.some(n => /minute-level timestamps/.test(n)), JSON.stringify(ext.quality.notes)));
}
{
  // Gate: off-agenda ratio and dead time are never scored by the local
  // (Mode 3 / text-only) route -- they require semantic mapping / audio.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: Let's review the budget numbers for this quarter in detail.\n[10:05] Sara: Overall spend is tracking under plan by a healthy margin.";
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  check("off-agenda ratio Not Assessable from local/text-only extraction", () =>
    assertNull(model.metrics.find(m => m.label === "Off-agenda ratio").score));
  check("dead time ratio Not Assessable from local/text-only extraction", () =>
    assertNull(model.metrics.find(m => m.label === "Dead time ratio").score));
}
{
  // Gate: not-a-name guard -- label prefixes are never mistaken for speakers.
  const { sandbox } = boot(APP_PATH);
  check("'Decision' is not treated as a speaker name", () => assertTrue(!sandbox.isName("Decision")));
  check("'Action' is not treated as a speaker name", () => assertTrue(!sandbox.isName("Action")));
  check("'Sara' is treated as a speaker name", () => assertTrue(sandbox.isName("Sara")));
}

// ---------------------------------------------------------------------
console.log("\n=== Transcript format auto-detection (reuse guide sec3 Route A) ===");
function extractFirstUtterance(sandbox, raw) {
  const norm = sandbox.normalizeTranscript(raw);
  const uts = sandbox.lxParseTranscript(norm.text);
  return uts.find(u => u.sp);
}
{
  const { sandbox } = boot(APP_PATH);
  check("bracket format '[10:04] Name: text'", () => {
    const u = extractFirstUtterance(sandbox, "[10:04] Sara: Let's get started with the review.");
    assertEqual(u && u.sp, "Sara");
  });
  check("name-first format 'Name [10:04]: text'", () => {
    const u = extractFirstUtterance(sandbox, "Sara [10:04]: Let's get started with the review.");
    assertEqual(u && u.sp, "Sara");
  });
  check("plain 'Name: text' (no timestamp)", () => {
    const u = extractFirstUtterance(sandbox, "Sara: Let's get started with the review please.");
    assertEqual(u && u.sp, "Sara");
  });
  check("WebVTT with <v Name> voice tags", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Sara>Let's get started with the review.\n";
    const u = extractFirstUtterance(sandbox, vtt);
    assertEqual(u && u.sp, "Sara");
  });
  check("SRT numbered cues with --> timing", () => {
    const srt = "1\n00:00:01,000 --> 00:00:04,000\nSara: Let's get started with the review.\n";
    const u = extractFirstUtterance(sandbox, srt);
    assertEqual(u && u.sp, "Sara");
  });
  check("Teams export 'Name 0:04' block format", () => {
    const teams = "Sara 0:04\nLet's get started with the review.\n";
    const u = extractFirstUtterance(sandbox, teams);
    assertEqual(u && u.sp, "Sara");
  });
  check("caption-only input with no speaker labels still parses (people metrics n/a)", () => {
    const fresh = boot(APP_PATH);
    fresh.els.aTrans.value =
      "[10:00] We reviewed the budget together as planned.\n[10:05] It came in under target for the quarter.";
    const ext = fresh.sandbox.localExtract();
    assertTrue(ext.quality.has_speaker_labels === false, "has_speaker_labels should be false");
    assertTrue(ext.quality.notes.some(n => /no speaker labels/.test(n)));
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Tolerant JSON repair (Route B constrained-output resilience) ===");
{
  const { sandbox } = boot(APP_PATH);
  check("well-formed JSON parses", () => {
    const r = sandbox.tolerantParse('{"meeting":{"title":"x"}}');
    assertEqual(r.meeting.title, "x");
  });
  check("truncated JSON (cut mid-string) is repaired", () => {
    const truncated = '{"meeting":{"title":"Weekly Revi';
    const r = sandbox.tolerantParse(truncated);
    assertTrue(typeof r === "object" && r.meeting !== undefined, "expected a repaired object");
  });
  check("JSON wrapped in markdown fences is stripped", () => {
    const r = sandbox.tolerantParse('```json\n{"meeting":{"title":"x"}}\n```');
    assertEqual(r.meeting.title, "x");
  });
  check("text with no JSON at all throws a clear error", () => {
    let threw = false;
    try { sandbox.tolerantParse("no json here"); } catch (e) { threw = true; }
    assertTrue(threw, "expected tolerantParse to throw");
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Zero-network guarantee (offline edition) ===");
{
  const fs = require("fs");
  const html = fs.readFileSync(APP_PATH, "utf8");
  check("no fetch( call anywhere in the offline edition", () =>
    assertTrue(!/fetch\(/.test(html), "found fetch( in " + APP_PATH));
  check("no XMLHttpRequest/WebSocket/localStorage/sessionStorage", () =>
    assertTrue(!/XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB/.test(html)));
  check("header stamp reads 'engine v1.3'", () =>
    assertTrue(/engine v1\.3/.test(html), "version stamp not found"));
}

// ---------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f.name + ": " + f.error));
  process.exit(1);
}
