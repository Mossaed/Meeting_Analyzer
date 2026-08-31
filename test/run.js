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
// Counts <li> items inside one .card.sect section on the (already rendered)
// participant page, identified by its <h2> title -- used to check a
// section's rendered item count against the matching Contributions-cell
// counter (engine v2.2 parity).
function countSectionLis(html, secTitle) {
  const startIdx = html.indexOf(">" + secTitle + "<");
  if (startIdx === -1) return -1;
  const nextCard = html.indexOf('<div class="card sect">', startIdx);
  const chunk = nextCard === -1 ? html.slice(startIdx) : html.slice(startIdx, nextCard);
  const m = chunk.match(/<li/g);
  return m ? m.length : 0;
}

// ---------------------------------------------------------------------
console.log("=== Fixture A: built-in Sample meeting (local rule engine) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);

  check("MPI ~= 70.92 (reuse guide sec7 / README acceptance test: 'MPI 70.92 . Productive'; unchanged since v1.4)", () =>
    assertClose(model.mpi, SAMPLE_EXPECTED.mpi, SAMPLE_EXPECTED.mpiTolerance, "mpi"));
  check("band == Productive", () => assertEqual(model.band, SAMPLE_EXPECTED.band, "band"));
  check("6 of 6 dimensions assessable", () => assertEqual(model.assessable, SAMPLE_EXPECTED.assessable, "assessable"));
  for (const d of Object.keys(SAMPLE_EXPECTED.dims)) {
    check("dimension " + d + " ~= " + SAMPLE_EXPECTED.dims[d], () =>
      assertClose(model.dims[d], SAMPLE_EXPECTED.dims[d], SAMPLE_EXPECTED.dimTolerance, d));
  }
  check("condensed-transcript disclosure fires (honest-measurement rule 1)", () =>
    assertTrue(ext.quality.notes.some(n => /condensed transcript/.test(n)), "notes: " + JSON.stringify(ext.quality.notes)));
  check("agenda_items carry an evidence citation (agent spec sec2/sec5: 'citing a timestamp or line reference')", () =>
    assertTrue(ext.agenda_items.every(i => typeof i.evidence === "string" && i.evidence.length > 0), JSON.stringify(ext.agenda_items.map(i => i.evidence))));
  check("an 'Unresolved' flag cites the agenda item's own evidence, not blank", () => {
    const f = model.flags.find(x => /^Unresolved:/.test(x.text));
    if (!f) throw new Error("expected at least one Unresolved flag on the sample meeting");
    assertTrue(typeof f.evi === "string" && f.evi.length > 0, "flag evidence missing: " + JSON.stringify(f));
  });
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
  // Gate: dead time is never scored by the local (Mode 3 / text-only)
  // route -- it requires an audio pipeline, never derivable from text.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: Let's review the budget numbers for this quarter in detail.\n[10:05] Sara: Overall spend is tracking under plan by a healthy margin.";
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  check("dead time ratio Not Assessable from local/text-only extraction", () =>
    assertNull(model.metrics.find(m => m.label === "Dead time ratio").score));
  check("off-agenda ratio DOES score locally via keyword matching (engine v1.4)", () =>
    assertTrue(model.metrics.find(m => m.label === "Off-agenda ratio").score !== null));
  check("off-agenda keyword-matching disclosed as an approximation, not semantic analysis", () =>
    assertTrue(ext.quality.notes.some(n => /off-agenda ratio derived from keyword proximity/.test(n)), JSON.stringify(ext.quality.notes)));
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
  // same two-step the production path runs (localExtract): a text that was
  // normalized from a structured export carries its blockFmt flag through.
  const uts = sandbox.lxParseTranscript(norm.text, !!norm.fmt);
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
  check("timestamp-first block format '02:32:23  Name' (engine v2.3)", () => {
    const u = extractFirstUtterance(sandbox, "02:32:23  Sara Malik\nThe budget is trending under plan this quarter.\n");
    assertEqual(u && u.sp, "Sara Malik");
  });
  check("a speaker label containing lowercase words survives, timestamp-first (engine v2.3)", () => {
    const u = extractFirstUtterance(sandbox, "02:32:23  The respective team\nThe budget is trending under plan this quarter.\n");
    assertEqual(u && u.sp, "The respective team");
  });
  check("...and speaker-first, which used to drop the whole transcript (engine v2.3)", () => {
    const u = extractFirstUtterance(sandbox, "The respective team 01:19:06\nThe budget is trending under plan this quarter.\n");
    assertEqual(u && u.sp, "The respective team");
  });
  check("block format attributes every turn, both orderings (engine v2.3)", () => {
    const raw = ["02:32:23  The respective team", "We reviewed the budget together.",
      "02:35:10  The Chairman", "Can we close the vendor contract this week?",
      "02:39:44  The respective team", "Yes, by Friday."].join("\n");
    const norm = sandbox.normalizeTranscript(raw);
    const uts = sandbox.lxParseTranscript(norm.text, !!norm.fmt);
    assertEqual(uts.length, 3, "expected one utterance per block");
    assertEqual(uts.map(u => u.sp).join("|"), "The respective team|The Chairman|The respective team");
  });
  check("an ALL-CAPS label and an initialled name are both accepted (engine v2.3)", () => {
    assertEqual(extractFirstUtterance(sandbox, "THE CHAIRMAN 01:19:06\nThe budget is under plan.\n").sp, "THE CHAIRMAN");
    assertEqual(extractFirstUtterance(sandbox, "01:19:06 Sara M.\nThe budget is under plan.\n").sp, "Sara M.");
  });
  check("a sentence is never mistaken for a speaker header (engine v2.3)", () => {
    // Bare (unbracketed) timestamp + a full sentence: too many words and a
    // terminal period, so it stays speech with no speaker attributed.
    const raw = "10:00 We shipped the release last night without any issues on the platform.";
    const norm = sandbox.normalizeTranscript(raw);
    assertNull(norm.fmt, "should not be detected as a block-format export");
    const uts = sandbox.lxParseTranscript(norm.text, !!norm.fmt);
    assertTrue(uts.length === 1 && uts[0].sp === null, JSON.stringify(uts));
  });
  check("a label word on the not-a-name list is never a speaker header (engine v2.3)", () => {
    const norm = sandbox.normalizeTranscript("02:32:23 Decision\nWe approved the budget increase.");
    assertNull(norm.fmt, "\"Decision\" must not open a speaker block");
  });
  check("Arabic block format with Arabic-Indic digits, both orderings (engine v2.3)", () => {
    const body = "\nمراجعة الميزانية نحن ضمن الخطة هذا الربع.";
    assertEqual(extractFirstUtterance(sandbox, "٠٢:٣٢:٢٣  فريق المالية" + body).sp, "فريق المالية");
    assertEqual(extractFirstUtterance(sandbox, "فريق المالية ٠١:١٩:٠٦" + body).sp, "فريق المالية");
  });
  check("inline caption with an early colon keeps its honest no-speaker verdict (engine v2.3)", () => {
    const fresh = boot(APP_PATH);
    fresh.els.aTrans.value = "[10:03] In summary: we shipped it last night without issues.\n[10:06] It has been stable since then across regions.";
    const ext = fresh.sandbox.localExtract();
    assertTrue(ext.quality.has_speaker_labels === false, "loose labels must not leak into inline/caption parsing");
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
console.log("\n=== D7 Follow-Through (info only, weight 0, spec sec3) ===");
{
  const { sandbox } = boot(APP_PATH);
  const withFT = {
    ...WORKBOOK_EXTRACTION,
    outcomes: {
      ...WORKBOOK_EXTRACTION.outcomes,
      follow_through: { prior_actions_due: 6, prior_actions_closed: 4, prior_unresolved_topics: 3, prior_unresolved_recurring: 1 },
    },
  };
  const model = sandbox.compute(withFT);
  check("D7 does not appear in CONFIG.dims (cannot enter the per-dimension average)", () =>
    assertTrue(!Object.prototype.hasOwnProperty.call(sandbox.CONFIG.dims, "D7"), "CONFIG.dims: " + JSON.stringify(sandbox.CONFIG.dims)));
  check("MPI is unchanged whether or not D7 inputs are supplied", () => {
    const modelWithout = sandbox.compute(WORKBOOK_EXTRACTION);
    assertClose(model.mpi, modelWithout.mpi, 1e-9, "mpi");
  });
  check("Prior-action closure matches workbook Outcomes!B20 (4/6 = 66.667)", () => {
    const m = model.metrics.find(x => x.label === "Prior-action closure (info only)");
    assertClose(m.score, 66.6666666666667, 1e-6, "closure score");
  });
  check("Topic recurrence (info) matches workbook Outcomes!B23 inverted (1 - 1/3 = 66.667)", () => {
    const m = model.metrics.find(x => x.label === "Topic recurrence, lower better (info only)");
    assertClose(m.score, 66.6666666666667, 1e-6, "recurrence score");
  });
  check("D7 metrics are Not Assessable when no prior-meeting data is supplied", () => {
    const modelWithout = sandbox.compute(WORKBOOK_EXTRACTION);
    assertNull(modelWithout.metrics.find(x => x.label === "Prior-action closure (info only)").score);
    assertNull(modelWithout.metrics.find(x => x.label === "Topic recurrence, lower better (info only)").score);
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Route B / JSON purity: compute() must not read stale DOM state ===");
{
  // Regression for a bug where compute() OR'd the attendance-textarea's raw
  // text into hasAttData: pasting JSON with NO attendance evidence, while
  // stale text sat in the (unrelated) attendance box, let attendance rate
  // score off speaker-only data -- exactly what the honesty gate forbids.
  const { sandbox, els } = boot(APP_PATH);
  els.aAtt.value = "Sara 10:00-11:00"; // stale leftover text, irrelevant to the pasted JSON
  els.mInv.value = "10";
  const pasted = {
    meeting: { scheduled_minutes: 60, actual_minutes: 60, invitees: 10 },
    agenda_items: [],
    participants: [
      { name: "Sara", present: true, talk_minutes: 30, questions: 1, answers: 0, proposals: 0, risks: 0, info: 1 },
      { name: "Omar", present: true, talk_minutes: 10, questions: 0, answers: 1, proposals: 0, risks: 0, info: 1 },
    ],
    presenters: [], interaction: { questions_raised: 1, questions_answered: 1 },
    outcomes: { actions_total: 0 }, quality: { notes: [] },
  };
  const model = sandbox.compute(pasted);
  check("attendance rate stays Not Assessable when the JSON carries no minutes_present, regardless of stale DOM text", () =>
    assertNull(model.metrics.find(m => m.label === "Attendance rate").score));
  check("active contributors stays Not Assessable under the same condition", () =>
    assertNull(model.metrics.find(m => m.label === "Active contributors").score));

  const modelWithData = sandbox.compute({
    ...pasted,
    participants: pasted.participants.map(p => ({ ...p, minutes_present: 60 })),
  });
  check("attendance rate DOES score once the JSON itself supplies minutes_present", () =>
    assertTrue(modelWithData.metrics.find(m => m.label === "Attendance rate").score !== null));
}
{
  // Regression: scoring a fresh tab's pasted JSON must not raise "not
  // provided" flags for artifacts the JSON demonstrably includes.
  const { sandbox } = boot(APP_PATH);
  const pasted = {
    meeting: { scheduled_minutes: 60, actual_minutes: 60, invitees: 5 },
    agenda_items: [{ title: "Budget", planned_minutes: 10, planned_order: 1, actual_minutes: 11,
      actual_order: 1, substantive: true, decision_expected: true, decision_made: true, closed: true }],
    participants: [{ name: "Sara", present: true, minutes_present: 60, talk_minutes: 30,
      questions: 1, answers: 1, proposals: 1, risks: 0, info: 2 }],
    presenters: [],
    interaction: { questions_raised: 2, questions_answered: 2, feedback_instances: 4, chat_substantive_messages: 12 },
    outcomes: { actions_total: 2, actions_with_owner_and_due: 2, transcript_items: 4,
      mom_items: 4, matched_items: 4 },
    quality: { notes: [] },
  };
  const model = sandbox.compute(pasted);
  const flagTexts = model.flags.map(f => f.text);
  check("no 'Minutes not provided' flag when the JSON supplies mom_items", () =>
    assertTrue(!flagTexts.some(t => /Minutes not provided/.test(t)), JSON.stringify(flagTexts)));
  check("no 'Chat log not provided' flag when the JSON supplies chat_substantive_messages", () =>
    assertTrue(!flagTexts.some(t => /Chat log not provided/.test(t)), JSON.stringify(flagTexts)));
  check("no 'Attendance log not provided' flag when the JSON supplies minutes_present", () =>
    assertTrue(!flagTexts.some(t => /Attendance log not provided/.test(t)), JSON.stringify(flagTexts)));
}

// ---------------------------------------------------------------------
console.log("\n=== Honesty-note prioritization under the 6-note cap ===");
{
  // Regression: when more than 6 disclosures fire, the generic boilerplate
  // note must be dropped before a meeting-specific honesty-gate finding --
  // never the arbitrary "whatever was pushed first" order.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  // WebVTT input (triggers format-normalization note) with no speaker tags,
  // minute-only timestamps too sparse to resolve seconds, and no attendance
  // log -- stacks up: boilerplate, format, condensed/no-speaker, no-attendance,
  // off-agenda, dead-time and interruption notes all in the same run.
  els.aTrans.value = [
    "WEBVTT", "",
    "00:00:01.000 --> 00:00:04.000",
    "<v Sara>Budget review, we are broadly fine on spend this quarter.",
    "",
    "00:10:00.000 --> 00:10:04.000",
    "<v Omar>Any risk we should flag before we move on today?",
  ].join("\n");
  const ext = sandbox.localExtract();
  assertTrue(ext.quality.notes.length <= 6, "notes exceed the 6-slot cap: " + ext.quality.notes.length);
  check("boilerplate 'local rule-based extraction' note is dropped before meeting-specific gates when the budget is tight", () => {
    const hasBoilerplate = ext.quality.notes.some(n => /local rule-based extraction/.test(n));
    const hasCondensedOrGate = ext.quality.notes.some(n => /condensed transcript|minute-level timestamps|no attendance log/.test(n));
    assertTrue(hasCondensedOrGate, "expected a meeting-specific gate note to survive: " + JSON.stringify(ext.quality.notes));
    // Only assert displacement if the budget was actually oversubscribed enough to matter.
    if (!hasBoilerplate) assertTrue(hasCondensedOrGate, "boilerplate correctly dropped in favor of gate notes");
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Advanced evidence: manual dead-time/off-agenda/interruption inputs ===");
{
  // Route A: dead time and interruptions are honesty-gated Not Assessable
  // by default (no audio pipeline) -- confirm they stay n/a without manual
  // input, then that filling the optional fields unlocks them and is
  // disclosed as user-supplied, not extracted. Off-agenda ratio is scored
  // by keyword matching by default since engine v1.4 (see the dedicated
  // off-agenda test above); a manual entry here must still override it.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: We reviewed the whole budget in detail today.\n[10:08] Sara: Overall spend is tracking under plan for the quarter.";

  const extBefore = sandbox.localExtract();
  const modelBefore = sandbox.compute(extBefore);
  check("dead time ratio is Not Assessable with no advanced evidence supplied", () =>
    assertNull(modelBefore.metrics.find(m => m.label === "Dead time ratio").score));
  check("off-agenda ratio already scores via keyword matching before any manual entry", () =>
    assertTrue(modelBefore.metrics.find(m => m.label === "Off-agenda ratio").score !== null));
  check("interruptions metric is Not Assessable with no advanced evidence supplied", () =>
    assertNull(modelBefore.metrics.find(m => m.label === "Interruptions per 10 min").score));

  els.fDead.value = "3";
  els.fOffAgenda.value = "2";
  els.fInterrupt.value = "1.5";
  const extAfter = sandbox.localExtract();
  const modelAfter = sandbox.compute(extAfter);
  check("dead time ratio scores once dead time is manually supplied", () =>
    assertTrue(modelAfter.metrics.find(m => m.label === "Dead time ratio").score !== null));
  check("a manually-supplied off-agenda value overrides the keyword-derived one", () => {
    const m = modelAfter.metrics.find(x => x.label === "Off-agenda ratio");
    assertClose(m.raw, 2 / extAfter.meeting.total_talk_minutes, 1e-9, "off-agenda raw ratio should reflect the manual 2-minute entry");
  });
  check("interruptions metric scores once manually supplied", () =>
    assertTrue(modelAfter.metrics.find(m => m.label === "Interruptions per 10 min").score !== null));
  check("manual dead-time entry is disclosed as user-supplied, not extracted", () =>
    assertTrue(extAfter.quality.notes.some(n => /dead time manually supplied/.test(n)), JSON.stringify(extAfter.quality.notes)));

  // Route B: same override must work when scoring pasted JSON that leaves
  // these fields null -- same "user metadata overrides inference" pattern
  // already used for scheduled minutes / invitees.
  const pasted = {
    meeting: { scheduled_minutes: 60, actual_minutes: 60, invitees: 5,
      dead_time_minutes: null, off_agenda_minutes: null, total_talk_minutes: null },
    agenda_items: [], participants: [], presenters: [],
    interaction: { interruptions_per_10min: null }, outcomes: {}, quality: { notes: [] },
  };
  const { sandbox: sb2, els: els2 } = boot(APP_PATH);
  const beforeB = sb2.compute(pasted);
  check("Route B: dead time stays Not Assessable when JSON is null and no manual input given", () =>
    assertNull(beforeB.metrics.find(m => m.label === "Dead time ratio").score));
  els2.fDead.value = "5";
  els2.fOffAgenda.value = "4";
  els2.fTotalTalk.value = "40";
  els2.fInterrupt.value = "2";
  const afterB = sb2.compute(pasted);
  check("Route B: dead time ratio scores once manually supplied, even though the pasted JSON left it null", () =>
    assertTrue(afterB.metrics.find(m => m.label === "Dead time ratio").score !== null));
  check("Route B: off-agenda ratio scores once manually supplied", () =>
    assertTrue(afterB.metrics.find(m => m.label === "Off-agenda ratio").score !== null));

  // A non-null JSON value must still win over a manual DOM entry (JSON is
  // the more specific, per-meeting source once it actually has the field).
  const pastedWithDead = { ...pasted, meeting: { ...pasted.meeting, dead_time_minutes: 9 } };
  const { sandbox: sb3, els: els3 } = boot(APP_PATH);
  els3.fDead.value = "1"; // should be ignored -- JSON already supplies dead_time_minutes
  const modelC = sb3.compute(pastedWithDead);
  check("Route B: a non-null JSON dead_time_minutes takes precedence over a stray manual entry", () =>
    assertClose(modelC.metrics.find(m => m.label === "Dead time ratio").raw, 9 / 60, 1e-9, "dead ratio"));
}

// ---------------------------------------------------------------------
console.log("\n=== Agenda anchoring & substantive determination (engine v1.5) ===");
{
  // Scenario A/B: substantive is now a content question (word count),
  // never a turn-count or clock question. A single long turn covering an
  // item thoroughly used to be permanently unable to pass span.length>=2.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Security posture — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: Security posture update — we completed the SOC2 audit with zero findings, rotated all service credentials last week, and the pen test report came back clean with only two low-severity items already fixed. Access reviews are current across every team and the new SSO rollout finishes by end of month.";
  const ext = sandbox.localExtract();
  check("a single long turn is substantive (word count, not turn count)", () =>
    assertTrue(ext.agenda_items[0].substantive === true, JSON.stringify(ext.agenda_items[0])));
}
{
  // Scenario C: minute-level timestamps landing two anchors in the same
  // displayed minute used to force actual_minutes=0 -> skipped, even with
  // real multi-turn content.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Standup blockers — Sara — 5 min\n2. Release cut — Sara — 5 min";
  els.aTrans.value = [
    "[10:00] Sara: Standup blockers today, the sync engine keeps failing on flaky test networks in staging.",
    "[10:00] Omar: Is that blocking anything on our side for the rest of this sprint specifically?",
    "[10:00] Sara: Not yet, but we should watch it closely over the next couple of days.",
    "[10:01] Sara: Release cut discussion now, targeting Friday for the next deployment window as planned.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const blockers = ext.agenda_items.find(i => i.title === "Standup blockers");
  check("same-minute anchors don't force actual_minutes to 0", () => assertTrue(blockers.actual_minutes > 0, JSON.stringify(blockers)));
  check("content spanning same-minute anchors is still substantive", () => assertTrue(blockers.substantive === true));
}
{
  // Scenario E: an early throwaway mention of a LATER item ("we'll come
  // back to the budget deck later") used to anchor that item there,
  // truncating it to a 1-turn span and donating its real discussion (and
  // decision) to whichever item anchored next.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Hiring plan — Sara — 10 min\n2. Budget reforecast — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Housekeeping first, the budget deck is in the shared drive, we will come back to it later today.",
    "[10:02] Sara: Hiring plan now, we have three open reqs and two offers out this week for the team.",
    "[10:04] Omar: How is the pipeline looking for the senior roles specifically this quarter?",
    "[10:06] Sara: Strong, we should close both by end of month if things go well.",
    "[10:12] Sara: OK budget reforecast. We are trending eight percent under plan for the year overall.",
    "[10:14] Omar: What drove the improvement compared to last quarter numbers?",
    "[10:16] Sara: Mostly lower cloud spend after the migration finished up last month.",
    "[10:18] Sara: Decision — we reallocate the surplus to the data platform team starting next sprint.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const budget = ext.agenda_items.find(i => i.title === "Budget reforecast");
  check("item anchors on its real discussion, not an earlier passing mention", () =>
    assertEqual(budget.evidence, "t=10:12"));
  check("the real discussion's decision is attributed to the right item", () =>
    assertTrue(budget.closed === true, JSON.stringify(budget)));
}
{
  // Scenario F: two items sharing one ambiguous keyword ("budget") used
  // to orphan whichever item didn't get there first. A second,
  // discriminating keyword on each item should now resolve both correctly.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min\n2. Budget signoff — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Lets do the budget review now, spend is tracking under plan across every team this quarter.",
    "[10:02] Omar: Any risk areas we should flag before we move on to the next topic today?",
    "[10:04] Sara: Not really, we are in good shape heading into next quarter.",
    "[10:10] Sara: Moving to signoff, I need everyone to confirm approval on the numbers by Friday please.",
    "[10:12] Omar: Approved from my side, looks solid to me overall.",
    "[10:14] Sara: Great, decision — we lock the numbers and move forward with the plan as is.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("both items with a shared keyword resolve to their own discussion", () => {
    const review = ext.agenda_items.find(i => i.title === "Budget review");
    const signoff = ext.agenda_items.find(i => i.title === "Budget signoff");
    assertEqual(review.evidence, "t=10:00");
    assertEqual(signoff.evidence, "t=10:10");
    assertTrue(review.located && signoff.located, "both should be located");
  });
}
{
  // Scenario G: with no timestamps, the old actual_minutes>=1 gate became
  // an opaque ~140-word requirement. substantive is now a direct word
  // count, identical with or without timestamps.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Standup blockers — Sara — 10 min\n2. Release cut — Sara — 10 min";
  els.aTrans.value = [
    "Sara: Standup blockers today, the sync engine keeps failing on flaky test networks in staging.",
    "Omar: Any workaround for now while the team investigates the root cause properly?",
    "Sara: Not yet, we are still digging into the logs from last nights failures.",
    "Sara: Release cut discussion now, we are targeting Friday for the next deployment window.",
    "Omar: Sounds reasonable, I will help with the final testing pass this afternoon.",
    "Sara: Decision — we cut Friday, and slip to Monday only if something major comes up.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("no-timestamp transcript: both items are located and substantive", () =>
    assertTrue(ext.agenda_items.every(i => i.located && i.substantive), JSON.stringify(ext.agenda_items)));
}
{
  // A closed item (recorded a decision or action) is substantive
  // regardless of word count -- a crisp go/no-go call shouldn't read as
  // "skipped" just because it was brief. Reproduces the exact sample-
  // meeting case ("Launch go/no-go", ~29 words, closed=true).
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Launch go/no-go — Lina — 10 min";
  els.aTrans.value = "[10:31] Lina: Launch go/no-go for the pricing page. Legal signed off, experiments show +6% conversion, no churn signal.\n[10:38] Sara: Decision: we go live Monday. Lina owns the rollout checklist, due Friday.";
  const ext = sandbox.localExtract();
  check("a brief but closed item is substantive despite being under the word-count floor", () =>
    assertTrue(ext.agenda_items[0].closed === true && ext.agenda_items[0].substantive === true, JSON.stringify(ext.agenda_items[0])));
}
{
  // "not found" (paraphrase, your reported case): a topic discussed with
  // no lexical overlap to the agenda title must be distinguished from a
  // genuine skip -- both in the item record and in the rendered status.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min\n2. Q3 Revenue Forecast — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Budget review time, spend is tracking well under plan across every team this quarter.",
    "[10:05] Omar: How much money do we expect to bring in for the rest of the year overall?",
    "[10:07] Sara: We are projecting strong growth, roughly two point one million for the period ahead.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const forecast = ext.agenda_items.find(i => i.title === "Q3 Revenue Forecast");
  check("a paraphrased topic is marked located:false, not skipped", () =>
    assertTrue(forecast.located === false && forecast.substantive === false, JSON.stringify(forecast)));
  const model = sandbox.compute(ext);
  check("a flag names the not-found item specifically", () => {
    const f = model.flags.find(x => /not found in the transcript/.test(x.text));
    if (!f) throw new Error("expected a not-found flag");
    assertTrue(f.text.includes("Q3 Revenue Forecast"), f.text);
  });
  check("Coverage rate still counts the not-found item against coverage", () =>
    assertEqual(model.metrics.find(m => m.label === "Coverage rate").disp, "50.0% · 1/2"));
  sandbox.render(model);
  check("rendered status shows \"not found\", distinct from \"skipped\"", () =>
    assertTrue(els.report.innerHTML.includes("not found"), "expected a 'not found' status in the rendered coverage map"));
}
{
  // Route B compatibility: a payload that predates the `located` field
  // must default to true (an AI extraction only omits an item it
  // couldn't find at all, so silence should not read as "not found").
  const { sandbox } = boot(APP_PATH);
  const model = sandbox.compute({
    meeting: { scheduled_minutes: 30, actual_minutes: 30 },
    agenda_items: [{ title: "Legacy item", planned_minutes: 10, planned_order: 1, actual_minutes: 8,
      actual_order: 1, substantive: true, decision_expected: false, decision_made: false, closed: true, evidence: "t=00:00" }],
    participants: [], presenters: [], interaction: {}, outcomes: {}, quality: { notes: [] },
  });
  check("agenda_items without a `located` field default to located (Route B back-compat)", () =>
    assertTrue(model.items[0].located !== false, JSON.stringify(model.items[0])));
}
{
  // Canary: a genuinely skipped item ("Out of time — skipping AOB") must
  // still read as skipped, not swept into "substantive" by the relaxed
  // word-count gate.
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const aob = ext.agenda_items.find(i => i.title === "AOB");
  check("AOB canary: genuinely skipped item stays non-substantive", () =>
    assertTrue(aob.located === true && aob.substantive === false, JSON.stringify(aob)));
}

// ---------------------------------------------------------------------
console.log("\n=== Multi-presenter agenda items (engine v1.4) ===");
{
  const { sandbox } = boot(APP_PATH);
  const variants = {
    "Sara & Amir": ["Sara", "Amir"],
    "Sara, Amir": ["Sara", "Amir"],
    "Sara and Amir": ["Sara", "Amir"],
    "Sara, Amir & Lin": ["Sara", "Amir", "Lin"],
  };
  for (const [seg, expected] of Object.entries(variants)) {
    check(`"${seg}" parses as ${expected.length} owners`, () => {
      const items = sandbox.lxParseAgenda(`1. Roadmap — ${seg} — 10 min`);
      assertEqual(JSON.stringify(items[0].owners), JSON.stringify(expected));
      assertEqual(items[0].owner, expected[0], "owner should stay owners[0] for backward compatibility");
    });
  }
  check("a 4-token single name still fails cleanly (no owner), not a crash", () => {
    const items = sandbox.lxParseAgenda("1. Roadmap — Sara Jane Ann Doe — 10 min");
    assertEqual(items[0].owners.length, 0);
  });
  check("noise like 'table topic, 10 min' never becomes an owner", () => {
    const items = sandbox.lxParseAgenda("1. AOB — table topic, 10 min");
    assertEqual(items[0].owners.length, 0);
  });
}
{
  // End-to-end: both co-presenters get credited as presenters (not just
  // the first), each against the item's full planned minutes, with a
  // disclosure note explaining why.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. KPI review — Sara & Amir — 10 min\n2. Budget — Omar — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: KPI review time, activation is up this week overall for us.",
    "[10:02] Amir: I will add the roadmap context on top of that too today.",
    "[10:05] Omar: Budget check, we are under plan for the quarter this time.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const names = ext.presenters.map(p => p.name).sort();
  check("both co-presenters appear in the presenters table", () =>
    assertEqual(JSON.stringify(names), JSON.stringify(["Amir", "Omar", "Sara"])));
  check("each co-presenter is credited with the item's full planned minutes", () => {
    const sara = ext.presenters.find(p => p.name === "Sara");
    const amir = ext.presenters.find(p => p.name === "Amir");
    assertEqual(sara.planned_minutes, 10);
    assertEqual(amir.planned_minutes, 10);
  });
  check("multi-presenter disclosure note fires", () =>
    assertTrue(ext.quality.notes.some(n => /multiple presenters/.test(n)), JSON.stringify(ext.quality.notes)));
  check("agenda_items carries the owners array through to the extraction JSON", () => {
    const kpi = ext.agenda_items.find(i => i.title === "KPI review");
    assertEqual(JSON.stringify(kpi.owners), JSON.stringify(["Sara", "Amir"]));
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Unmatched agenda items: counted as not-covered, not scored 0 on adherence ===");
{
  // Regression: an item the keyword matcher can't locate used to get
  // actual_minutes=0, scoring "Avg time adherence" as a hard 0 -- a
  // matcher failure presented as a measured fact. It should still count
  // as NOT COVERED (a real finding) but drop out of time adherence.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min\n2. Nonexistent topic zzz — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: Let's review the budget numbers for this quarter in detail today, spend is tracking well under plan across every team so far this year.\n[10:05] Omar: What is driving the improvement compared to where we expected to land at this point?\n[10:07] Sara: Mostly lower cloud costs after the migration finished up last month, plus we deferred a couple of hires into next quarter.";
  const ext = sandbox.localExtract();
  const missed = ext.agenda_items.find(i => i.title === "Nonexistent topic zzz");
  check("unmatched item has actual_minutes = null, not 0", () => assertNull(missed.actual_minutes));
  check("unmatched item is not substantive (still counts as not-covered)", () => assertTrue(missed.substantive === false));
  const model = sandbox.compute(ext);
  check("Coverage rate reflects the miss (1 of 2 covered)", () =>
    assertEqual(model.metrics.find(m => m.label === "Coverage rate").disp, "50.0% · 1/2"));
  check("Avg time adherence excludes the unmatched item rather than scoring it 0", () => {
    // only the matched item (10 planned vs its actual span) feeds the average
    const m = model.metrics.find(x => x.label === "Avg time adherence");
    assertTrue(m.score !== null && m.score > 0, "expected a real adherence score, not dragged to 0 by the miss");
  });
}
{
  // Regression for the crash found during exploration: two agenda items
  // whose keywords both hit the SAME utterance used to give the earlier
  // item an empty span (`_end === _first`), and `evi(span[0])` threw on
  // `undefined`. claimedFirsts now guarantees unique anchors.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min\n2. Budget signoff — Sara — 5 min";
  els.aTrans.value = "[10:00] Sara: Quick budget review and signoff together in one go today.\n[10:05] Sara: Sounds good, moving on now to the next item.";
  check("duplicate keyword hit on one utterance does not crash extraction", () => {
    const ext = sandbox.localExtract();
    assertTrue(Array.isArray(ext.agenda_items) && ext.agenda_items.length === 2);
  });
}

// ---------------------------------------------------------------------
console.log("\n=== Zero-count metrics never masquerade as a measured zero (engine v1.4) ===");
{
  // Regression: a regex finding nothing is "no evidence", not "evidence
  // of zero". feedback_instances used to always be a number (0 when the
  // detector didn't fire), scoring a hard 0/100 on band [0,8] and
  // dragging D5 down on no real evidence.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value = "[10:00] Sara: We reviewed the budget figures for the quarter in detail today.\n[10:05] Sara: Overall spend is tracking under plan for the year ahead.";
  const ext = sandbox.localExtract();
  check("feedback_instances is null (not 0) when no praise phrases are detected", () =>
    assertNull(ext.interaction.feedback_instances));
  check("zero-feedback disclosure fires", () =>
    assertTrue(ext.quality.notes.some(n => /no feedback phrases detected/.test(n)), JSON.stringify(ext.quality.notes)));
  const model = sandbox.compute(ext);
  check("Feedback instances metric is Not Assessable, not scored 0/100", () =>
    assertNull(model.metrics.find(m => m.label === "Feedback instances").score));
}
{
  // Sanity: genuine feedback still scores normally (0 isn't over-corrected
  // into always-null).
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  check("real feedback phrases still produce a positive count", () =>
    assertTrue(ext.interaction.feedback_instances > 0));
}

// ---------------------------------------------------------------------
console.log("\n=== Decisions: full text + speaker attribution (engine v1.4) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  check("decision text is not truncated at 80 characters", () =>
    assertTrue(ext.outcomes.decisions.some(d => d.text.length > 80), "expected at least one decision over 80 chars: " +
      JSON.stringify(ext.outcomes.decisions.map(d => d.text.length))));
  check("every decision carries its speaker", () =>
    assertTrue(ext.outcomes.decisions.every(d => typeof d.speaker === "string" && d.speaker.length > 0), JSON.stringify(ext.outcomes.decisions)));
  const model = sandbox.compute(ext);
  sandbox.render(model);
  check("main report no longer renders a Decisions / Action items / Questions card (engine v2.1 — moved to the participant page)", () =>
    assertTrue(!/<h2>Decisions<\/h2>/.test(els.report.innerHTML) && !/<h2>Action items<\/h2>/.test(els.report.innerHTML) && !/<h2>Questions<\/h2>/.test(els.report.innerHTML),
      "unexpected dashboard card found: " + els.report.innerHTML.slice(0, 4000)));
}

// ---------------------------------------------------------------------
console.log("\n=== Questions listed by name in Flags (engine v1.4) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  check("interaction.questions is populated with individual question records", () =>
    assertTrue(Array.isArray(ext.interaction.questions) && ext.interaction.questions.length > 0));
  check("each question carries text, asker, status and evidence", () => {
    const q = ext.interaction.questions[0];
    assertTrue(typeof q.text === "string" && q.text.length > 0);
    assertTrue(["answered", "deferred", "unanswered"].includes(q.status));
    assertTrue(typeof q.evidence === "string" && q.evidence.length > 0);
  });
  const model = sandbox.compute(ext);
  check("a deferred question is listed by full text in the flags, not just a count", () => {
    const f = model.flags.find(x => /^Deferred question/.test(x.text));
    if (!f) throw new Error("expected a per-question deferred flag on the sample meeting");
    assertTrue(f.text.includes("?"), "expected the full question text in the flag");
    assertTrue(typeof f.evi === "string" && f.evi.length > 0, "expected an evidence citation on the flag");
  });
}
{
  // Regression: on the no-speaker-labels path, questions_answered/deferred
  // are null (genuinely not assessable), but the old `||0` coercion in
  // `unans` turned that into "every question unanswered" and flagged all
  // of them high-severity -- directly contradicting the "not assessable"
  // info note fired in the same run.
  const { sandbox, els } = boot(APP_PATH);
  els.aTrans.value = "[10:00] Any objections to the plan here today at all?\n[10:05] It looks like we are all set for now, thanks.";
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  check("interaction.questions is null when speaker labels are unavailable", () =>
    assertNull(ext.interaction.questions));
  check("no 'unanswered question' flags fire when Q&A pairing is not assessable", () =>
    assertTrue(!model.flags.some(f => /unanswered/i.test(f.text)), JSON.stringify(model.flags.map(f => f.text))));
}

// ---------------------------------------------------------------------
console.log("\n=== Anonymize toggle (agent spec sec1/sec5: 'Participation table — anonymizable') ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);

  check("render() does not throw with anonymize off", () => sandbox.render(model));
  check("participation table shows real names when anonymize is off", () =>
    assertTrue(els.report.innerHTML.includes("Sara"), "expected 'Sara' in report HTML"));

  els.anonToggle.checked = true;
  check("render() does not throw with anonymize on", () => sandbox.render(model));
  check("participation table uses P1/P2… once anonymize is on", () =>
    assertTrue(/>P1</.test(els.report.innerHTML) || />P1<\/td>/.test(els.report.innerHTML), "expected an anonymized 'P1' label in report HTML"));
  check("outcomes register (decision/action owners) is unaffected by anonymize (spec scopes it to the participation table only)", () =>
    assertTrue(els.report.innerHTML.includes("Lina") || els.report.innerHTML.includes("Omar"), "expected an action owner's real name to still appear"));
}

// ---------------------------------------------------------------------
console.log("\n=== Participation: silent attendees dropped, disclosed (engine v1.6) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const html = els.report.innerHTML;
  check("Sample's two silent attendees (Mei, Tomás) are not in the Participation table", () =>
    assertTrue(!/Participation[\s\S]{0,50}<\/h2>[\s\S]{0,3000}>Mei</.test(html) && !/Participation[\s\S]{0,50}<\/h2>[\s\S]{0,3000}>Tomás</.test(html),
      "expected Mei/Tomás rows removed from Participation"));
  check("a spoken attendee (Sara) still appears in the Participation table", () =>
    assertTrue(html.includes(">Sara<")));
  check("dropped-attendee count is disclosed under the table", () =>
    assertTrue(/2 attendees present with no recorded speech/.test(html), "expected the count disclosure line"));
  check("D4 scoring still reads the full participant list (silent attendees still count)", () =>
    assertEqual(model.dims.D4, SAMPLE_EXPECTED.dims.D4, "D4 unaffected by the display-only filter"));
}
{
  // A null talk share (unmeasurable, not measured-zero) must never be
  // dropped -- only a positively-measured 0 is display-noise.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Standup — Sara — 10 min";
  els.aTrans.value = [
    "Sara: Quick standup, we shipped the release last night without issues.",
    "Omar: Nice, I will follow up on the metrics dashboard once it settles down this week.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const html = els.report.innerHTML;
  check("with no timestamps, talk share is null (unmeasurable) and rows are not dropped for it", () =>
    assertTrue(html.includes(">Sara<") && html.includes(">Omar<"), "both speakers should still be listed"));
}

// ---------------------------------------------------------------------
console.log("\n=== Decisions: verified, enriched with time/agenda/context/basis (engine v1.6) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Should we approve this budget increase for the platform team?",
    "[10:01] Omar: We have not agreed on the budget allocation yet, still reviewing options.",
    "[10:02] Sara: If we approved the extra headcount, we would need new desks too probably.",
    "[10:03] Omar: We should approve the vendor contract next quarter once legal signs off.",
    "[10:04] Sara: Let's decide on the vendor next week when Amir is back from leave.",
    "[10:05] Omar: Agreed.",
    "[10:06] Sara: Agreed — we approve the Q3 budget increase of 50k for the platform team, effective immediately.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const texts = ext.outcomes.decisions.map(d => d.text);
  check("a question containing the trigger phrase is rejected", () =>
    assertTrue(!texts.some(t => /Should we approve/.test(t)), JSON.stringify(texts)));
  check("a negated trigger ('have not agreed') is rejected", () =>
    assertTrue(!texts.some(t => /have not agreed/.test(t)), JSON.stringify(texts)));
  check("a hypothetical/conditional trigger ('if we approved') is rejected", () =>
    assertTrue(!texts.some(t => /If we approved/.test(t)), JSON.stringify(texts)));
  check("an unadopted proposal ('we should approve') is rejected", () =>
    assertTrue(!texts.some(t => /We should approve/.test(t)), JSON.stringify(texts)));
  check("a deferral to a later date ('decide...next week') is rejected", () =>
    assertTrue(!texts.some(t => /Let's decide on the vendor/.test(t)), JSON.stringify(texts)));
  check("bare assent with no stated outcome ('Agreed.') is rejected", () =>
    assertTrue(!texts.some(t => t.trim() === "Agreed."), JSON.stringify(texts)));
  check("the one real decision beside all six disqualified candidates survives", () =>
    assertTrue(texts.some(t => /we approve the Q3 budget increase of 50k/.test(t)), JSON.stringify(texts)));
}
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  check("every Sample decision carries a time", () =>
    assertTrue(ext.outcomes.decisions.every(d => typeof d.time === "string"), JSON.stringify(ext.outcomes.decisions.map(d => d.time))));
  check("every Sample decision is attributed to its agenda item", () =>
    assertTrue(ext.outcomes.decisions.every(d => typeof d.agenda_item === "string"), JSON.stringify(ext.outcomes.decisions.map(d => d.agenda_item))));
  check("every Sample decision carries multi-line context including the decision itself", () =>
    assertTrue(ext.outcomes.decisions.every(d => Array.isArray(d.context) && d.context.length >= 1), JSON.stringify(ext.outcomes.decisions.map(d => d.context))));
  check("every Sample decision states a basis (the qualifying trigger phrase)", () =>
    assertTrue(ext.outcomes.decisions.every(d => typeof d.basis === "string" && d.basis.length > 0), JSON.stringify(ext.outcomes.decisions.map(d => d.basis))));
  check("a decision corroborated by both an action item and the minutes says so", () => {
    els.aMom.value = "Decision: go live Monday. Action: Lina owns the rollout checklist, due Friday.";
    const ext2 = sandbox.localExtract();
    const launch = ext2.outcomes.decisions.find(d => /go live Monday/.test(d.text));
    assertTrue(!!launch && /corroborated by/.test(launch.basis), JSON.stringify(launch));
  });
  const model = sandbox.compute(ext);
  sandbox.render(model);
  check("MPI is unchanged from v1.5 (70.92) -- all real decisions survived qualification", () =>
    assertClose(model.mpi, SAMPLE_EXPECTED.mpi, SAMPLE_EXPECTED.mpiTolerance, "mpi"));
  sandbox.renderParticipant("Sara");
  const pd = els.report.innerHTML;
  check("participant page shows a decision's agenda-item tag under Decisions stated (engine v2.1)", () =>
    assertTrue(/class="agtag">Launch go\/no-go</.test(pd) || /class="agtag">Budget check</.test(pd), pd.slice(pd.indexOf("Decisions stated"), pd.indexOf("Decisions stated") + 400)));
  check("Decisions stated shows the decision text", () =>
    assertTrue(pd.includes("we go live Monday"), "expected Sara's decision text under Decisions stated"));
  check("Decisions stated is agenda item and text only -- no preceding context line or basis (engine v2.1)", () =>
    assertTrue(!/Launch go\/no-go for the pricing page/.test(pd) && !/matched trigger phrase/.test(pd),
      "expected the preceding context line and basis to no longer render on the participant page"));
}

// ---------------------------------------------------------------------
console.log("\n=== Attendee questions: agenda attribution + topic match (engine v1.6) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const omarQs = ext.interaction.questions.filter(q => q.asker === "Omar");
  check("questions asked during their own agenda item's discussion read 'on topic'", () =>
    assertTrue(omarQs.length === 2 && omarQs.every(q => q.topic_match === "on topic"), JSON.stringify(omarQs)));
  const karl = ext.interaction.questions.find(q => q.asker === "Karl");
  check("a question naming a different item than the one being discussed is flagged 'other item (...)'", () =>
    assertTrue(!!karl && karl.topic_match === "other item (Launch go/no-go)" && karl.agenda_item === "Hiring update", JSON.stringify(karl)));
  check("every question is attributed to the agenda item being discussed when it was asked", () =>
    assertTrue(ext.interaction.questions.every(q => typeof q.agenda_item === "string"), JSON.stringify(ext.interaction.questions.map(q => q.agenda_item))));
  check("an answered question's context includes both the question and the answer", () => {
    const q = ext.interaction.questions.find(q => q.status === "answered");
    assertTrue(!!q && q.context.length === 2, JSON.stringify(q));
  });

  const model = sandbox.compute(ext);
  sandbox.render(model);
  sandbox.renderParticipant("Karl");
  const pd = els.report.innerHTML;
  check("participant page's Questions asked section shows the 'other item' topic-match label (engine v2.1)", () =>
    assertTrue(/other item \(Launch go\/no-go\)/.test(pd), pd.slice(pd.indexOf("Questions asked"), pd.indexOf("Questions asked") + 400)));
  check("participant page's Questions asked section shows the question's resolution status (engine v2.1)", () =>
    assertTrue(/>deferred</.test(pd), "expected Karl's deferred question to show its status"));
  const sara = ext.interaction.questions.find(q => q.status === "answered" && q.responder);
  sandbox.renderParticipant(sara.responder);
  const respPd = els.report.innerHTML;
  check("participant page's Answers given section shows the answer text as context (engine v2.1)", () =>
    assertTrue(respPd.includes(sara.context[1]), "expected the answer excerpt under Answers given"));
}
{
  // A question with no shared vocabulary anywhere must be labelled
  // honestly ("no keyword match"), never asserted as "off topic".
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Budget review — we are trending under plan this quarter across all departments.",
    "[10:02] Omar: Anyone catch the game last night, was it close?",
  ].join("\n");
  const ext = sandbox.localExtract();
  const q = ext.interaction.questions[0];
  check("a question with no shared vocabulary anywhere reads 'no keyword match', not 'off topic'", () =>
    assertTrue(!!q && q.topic_match === "no keyword match", JSON.stringify(q)));
}
{
  // pseudo mode: no real speaker labels, so questions can't be attributed.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Standup — 10 min";
  els.aTrans.value = [
    "[10:00] We shipped the release last night without any issues on the platform.",
    "[10:01] Did the rollout finish cleanly across every region we deployed to?",
    "[10:02] Yes, no issues reported so far from any of the regional teams.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("questions array is null (not assessable) when speaker labels are unavailable", () =>
    assertNull(ext.interaction.questions, JSON.stringify(ext.interaction.questions)));
  let threw = false;
  try { const model = sandbox.compute(ext); sandbox.render(model); } catch (e) { threw = e; }
  check("no speaker labels -- no Questions card is rendered, and the dashboard doesn't throw (engine v2.1)", () =>
    assertTrue(!threw && !/<h2>Questions<\/h2>/.test(els.report.innerHTML), threw && threw.stack));
}

// ---------------------------------------------------------------------
console.log("\n=== Arabic transcript capture (engine v2.0) ===");
{
  // Minimal end-to-end check: before this pass, an Arabic transcript
  // produced NOTHING -- zero speakers, zero questions, zero decisions,
  // every agenda item "not found". This is the regression that must
  // never come back.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. مراجعة المؤشرات — سارة — 10 دقائق";
  els.aTrans.value = [
    "[10:04] سارة: نبدأ بمراجعة المؤشرات. التفعيل ارتفع بنسبة 4 بالمئة هذا الأسبوع، وهذا رقم جيد جدا بالنسبة لنا كفريق وللجميع.",
    "[10:07] عمر: ما سبب ارتفاع التفعيل في هذا الأسبوع تحديدا؟",
    "[10:08] سارة: قائمة التهيئة الجديدة، والبيانات تظهر ذلك بوضوح شديد لجميع الأعضاء في الفريق دائما.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("Arabic speaker names are captured", () =>
    assertEqual(ext.participants.map(p => p.name).sort().join(","), ["سارة", "عمر"].sort().join(",")));
  check("has_speaker_labels is true for an Arabic transcript", () => assertTrue(ext.quality.has_speaker_labels === true));
  check("Arabic question mark (؟) is detected", () => assertEqual(ext.interaction.questions_raised, 1));
  check("Arabic Q&A pairing resolves asker and responder", () => {
    const q = ext.interaction.questions[0];
    assertTrue(q.asker === "عمر" && q.responder === "سارة", JSON.stringify(q));
  });
  check("Arabic agenda item with Arabic-Indic-free duration is located", () => {
    const item = ext.agenda_items[0];
    assertTrue(item.located === true && item.planned_minutes === 10, JSON.stringify(item));
  });
  check("Arabic-majority disclosure note fires, and filler is Not Assessable", () => {
    assertTrue(ext.quality.notes.some(n => /Arabic transcript detected/.test(n)), JSON.stringify(ext.quality.notes));
    assertTrue(ext.presenters.every(p => p.filler_words === null));
  });
}
{
  // Arabic-Indic digits in both the agenda duration and the transcript
  // clock must fold to ASCII and parse identically to Latin digits.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. اجتماع — ١٠ دقائق";
  els.aTrans.value = "[١٠:٠٤] سارة: بداية الاجتماع في الوقت المحدد تماما لجميع الحضور اليوم.";
  const ext = sandbox.localExtract();
  check("Arabic-Indic agenda duration (١٠) parses as 10", () => assertEqual(ext.agenda_items[0].planned_minutes, 10));
  check("Arabic-Indic clock time (١٠:٠٤) parses", () => assertTrue(ext.participants.length === 1 && ext.participants[0].name === "سارة"));
}
{
  // arNorm() must unify common Arabic spelling variants (definite article,
  // alef forms, plural suffixes) the same way lxStem() unifies English
  // suffixes -- this is what lets the agenda anchor on paraphrased Arabic
  // text instead of only an exact substring.
  const { sandbox } = boot(APP_PATH);
  check("arNorm unifies المؤشرات / مؤشرات (definite article + plural)", () =>
    assertEqual(sandbox.arNorm("المؤشرات"), sandbox.arNorm("مؤشرات")));
  check("arNorm normalizes alef variants (أ/إ/آ -> ا)", () =>
    assertEqual(sandbox.arNorm("أحمد"), sandbox.arNorm("احمد")));
}
{
  // Mixed Arabic + English in the SAME utterance must be caught by both
  // lexicons -- code-switching, not just two monolingual meetings.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Sprint Planning — سارة — 10 min";
  els.aTrans.value = [
    "[10:00] سارة: Let's start sprint planning, هل يمكننا إنهاء الـ API هذا الأسبوع؟",
    "[10:01] Omar: اتفقنا — we ship the API by Friday. عمر سيتولى النشر.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("a mixed-script question (؟ at the end of a Latin+Arabic sentence) is detected", () =>
    assertEqual(ext.interaction.questions_raised, 1));
  check("a mixed-script decision (Arabic trigger, English content) is captured", () =>
    assertTrue(ext.outcomes.decisions.some(d => /اتفقنا/.test(d.text)), JSON.stringify(ext.outcomes.decisions)));
}
{
  // Arabic label words (قرار، إجراء...) must never be misread as speaker
  // names, mirroring the existing English not-a-name guard.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. اجتماع — 10 دقائق";
  els.aTrans.value = [
    "[10:00] سارة: نبدأ الاجتماع، لدينا الكثير لنناقشه اليوم مع الفريق بأكمله.",
    "قرار: سنطلق المنتج الجديد الأسبوع القادم بعد الانتهاء من كل الاختبارات المطلوبة.",
  ].join("\n");
  const ext = sandbox.localExtract();
  check("'قرار:' is not read as a speaker name", () =>
    assertTrue(!ext.participants.some(p => p.name === "قرار"), JSON.stringify(ext.participants)));
}
{
  // Full Arabic sample (mirrors the English demo meeting item-for-item):
  // agenda anchoring, decisions, actions, questions, off-agenda scoring,
  // and a final MPI must all come out of the SAME pipeline the English
  // Sample uses, with zero code path forked for language.
  const { sandbox, els } = boot(APP_PATH);
  sandbox.loadArabicSample();
  const ext = sandbox.localExtract();
  check("Arabic Sample: all 6 agenda items located", () =>
    assertTrue(ext.agenda_items.every(i => i.located === true), JSON.stringify(ext.agenda_items.map(i => i.located))));
  check("Arabic Sample: 3 decisions captured, all attributed to an agenda item", () =>
    assertTrue(ext.outcomes.decisions.length === 3 && ext.outcomes.decisions.every(d => d.agenda_item), JSON.stringify(ext.outcomes.decisions.map(d => d.agenda_item))));
  check("Arabic Sample: 2 actions captured with owner and due date", () =>
    assertTrue(ext.outcomes.actions.length === 2 && ext.outcomes.actions.every(a => a.owner && a.due), JSON.stringify(ext.outcomes.actions)));
  check("Arabic Sample: the deferred question is flagged as belonging to a different agenda item", () => {
    const deferred = ext.interaction.questions.find(q => q.status === "deferred");
    assertTrue(!!deferred && /^other item/.test(deferred.topic_match), JSON.stringify(deferred));
  });
  const model = sandbox.compute(ext);
  check("Arabic Sample: produces a valid, assessable MPI", () =>
    assertTrue(isFinite(model.mpi) && model.assessable >= 5, "mpi=" + model.mpi + " assessable=" + model.assessable));
}
{
  // The English Sample must be COMPLETELY unaffected by everything added
  // for Arabic -- same exact MPI as the v1.6 golden fixture.
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  check("English Sample MPI is unchanged after adding Arabic support", () =>
    assertClose(model.mpi, SAMPLE_EXPECTED.mpi, SAMPLE_EXPECTED.mpiTolerance, "mpi"));
}

// ---------------------------------------------------------------------
console.log("\n=== Metric tooltips + i18n (engine v2.0) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const html = els.report.innerHTML;
  const tipCount = (html.match(/class="tip"/g) || []).length;
  check("a tooltip renders for every metric row and every dimension meter (29 + 6)", () =>
    assertEqual(tipCount, 35, "tip count: " + tipCount));
  check("tooltip bubble text matches the metric's own description", () =>
    assertTrue(html.includes(sandbox.METRIC_META.coverage.desc.slice(0, 30)), "coverage description not found in rendered tooltip"));
}
{
  const { sandbox } = boot(APP_PATH);
  const enKeys = Object.keys(sandbox.STR).sort();
  const missingAr = enKeys.filter(k => !sandbox.STR[k].ar);
  const missingEn = enKeys.filter(k => !sandbox.STR[k].en);
  check("every STR entry has both an en and an ar translation", () =>
    assertTrue(missingAr.length === 0 && missingEn.length === 0, "missing ar: " + JSON.stringify(missingAr) + " missing en: " + JSON.stringify(missingEn)));
  const metricKeys = Object.keys(sandbox.METRIC_META).sort();
  const metricArKeys = Object.keys(sandbox.METRIC_META_AR).sort();
  check("METRIC_META and METRIC_META_AR cover the identical key set", () =>
    assertEqual(JSON.stringify(metricKeys), JSON.stringify(metricArKeys)));
  const dimKeys = Object.keys(sandbox.DIM_META).sort();
  const dimArKeys = Object.keys(sandbox.DIM_META_AR).sort();
  check("DIM_META and DIM_META_AR cover the identical key set", () =>
    assertEqual(JSON.stringify(dimKeys), JSON.stringify(dimArKeys)));
}
{
  // Switching language re-renders the SAME computed model (no re-extract,
  // no re-score) with new text -- band/status/topic_match values stay
  // canonical English underneath even though the displayed labels change.
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const mpiBefore = model.mpi;
  const bandBefore = model.band;
  const html = els.report.innerHTML;
  check("Dimension scores card title renders in English by default", () =>
    assertTrue(html.includes("Dimension scores"), "expected default English card title"));
  check("model.band stays the canonical English value regardless of display language", () =>
    assertEqual(bandBefore, "Productive"));
  check("model.mpi is unaffected by rendering", () => assertEqual(model.mpi, mpiBefore));
}

// ---------------------------------------------------------------------
console.log("\n=== Participation counts + participant drill-down (engine v2.0) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  els.demoBtn._listeners.click[0]();
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const html = els.report.innerHTML;
  check("Participation table has a dots button per shown attendee", () =>
    assertTrue((html.match(/class="dotsBtn"/g) || []).length >= 5, "expected at least 5 dotsBtn buttons"));
  check("Sara's row carries her name in the drill-down button's data-pname", () =>
    assertTrue(html.includes('data-pname="Sara"'), "expected data-pname=\"Sara\" on a dotsBtn"));
  check("the standalone Q/D/A columns are gone from the Participation table (engine v2.2)", () =>
    assertTrue(!/<th class="num">Q<\/th>/.test(html) && !/<th class="num">D<\/th>/.test(html) && !/<th class="num">A<\/th>/.test(html), "expected only the Contributions cell to carry these letters"));
  check("the Contributions cell carries all seven letters, D and T included (engine v2.2)", () =>
    assertTrue(/Q0 · A1 · P1 · R1 · I2 · D2 · T0/.test(html), "expected Sara's row to read Q0·A1·P1·R1·I2·D2·T0 -- " + (html.match(/Q\d[^<]*/g) || [])));
  check("every shown Sample attendee's Q/A/P/R/I/D/T counters match the plan's expected table (engine v2.2)", () => {
    const expected = { Sara: "Q0 · A1 · P1 · R1 · I2 · D2 · T0", Omar: "Q2 · A0 · P1 · R0 · I0 · D0 · T1",
      Amir: "Q0 · A1 · P0 · R1 · I1 · D1 · T0", Dana: "Q0 · A0 · P0 · R1 · I0 · D0 · T0",
      Lina: "Q0 · A0 · P0 · R0 · I1 · D0 · T1", Karl: "Q1 · A0 · P0 · R0 · I0 · D0 · T0" };
    for (const [n, want] of Object.entries(expected))
      assertTrue(html.includes(want), n + ": expected \"" + want + "\" in the rendered table");
  });
  check("extraction timeline entries carry kind and answer tags (engine v2.2)", () => {
    const sara = ext.participants.find(p => p.name === "Sara");
    assertTrue(sara.timeline.some(u => u.kind === "info") && sara.timeline.some(u => u.answer === true),
      JSON.stringify(sara.timeline));
  });
  check("Questions/Answers/Proposals/Risks/Info sections render exactly as many items as the matching Contributions-cell counter, for every shown attendee (engine v2.2)", () => {
    const mismatches = [];
    ["Sara", "Omar", "Amir", "Dana", "Lina", "Karl"].forEach(nm => {
      const p = ext.participants.find(x => x.name === nm);
      sandbox.renderParticipant(nm);
      const pageHtml = els.report.innerHTML;
      [["Questions asked", "questions"], ["Answers given", "answers"], ["Proposals", "proposals"], ["Risks", "risks"], ["Info", "info"]]
        .forEach(([sec, key]) => {
          const rendered = countSectionLis(pageHtml, sec);
          if (rendered !== (p[key] || 0)) mismatches.push(nm + " " + sec + ": counter=" + p[key] + " rendered=" + rendered);
        });
    });
    assertTrue(mismatches.length === 0, mismatches.join("; "));
  });

  sandbox.renderParticipant("Sara");
  const pd = els.report.innerHTML;
  check("participant page renders the participant's name as a heading", () =>
    assertTrue(/<h1>Sara<\/h1>/.test(pd)));
  check("participant page includes a decision Sara actually stated", () =>
    assertTrue(pd.includes("we go live Monday"), "expected Sara's decision text on her own page"));
  check("participant page includes an action Omar owns when viewing Omar", () => {
    sandbox.renderParticipant("Omar");
    const omarPd = els.report.innerHTML;
    assertTrue(omarPd.includes("update the sheet"), "expected Omar's owned action on his page");
  });
  check("participant page includes her off-agenda-tagged utterances section", () =>
    assertTrue(/Off-agenda contributions/.test(els.report.innerHTML)));
  check("off-agenda entry names the agenda keywords it was checked against (engine v2.1)", () =>
    assertTrue(/matching none of the agenda&#39;s keywords \(kpi, roadmap, launch/.test(els.report.innerHTML),
      els.report.innerHTML.slice(els.report.innerHTML.indexOf("Off-agenda contributions"), els.report.innerHTML.indexOf("Off-agenda contributions") + 600)));
  check("Back button is present and re-renders the report when clicked via the delegated handler", () => {
    sandbox.renderParticipant("Sara");
    assertTrue(els.report.innerHTML.includes('id="pdBackBtn"'));
  });
  check("the unattributed-items catch-all card is absent on a normal meeting like the Sample (engine v2.1)", () => {
    sandbox.render(model);
    assertTrue(!/Unattributed items/.test(els.report.innerHTML), "catch-all card should not render when every item is tied to a participant row");
  });
  check("per-person off_agenda_minutes sums to the global off_agenda_minutes on the Sample (engine v2.4)", () => {
    const sum = Math.round(ext.participants.reduce((a,p) => a + (p.off_agenda_minutes||0), 0) * 10) / 10;
    assertEqual(sum, ext.meeting.off_agenda_minutes, "per-person off-agenda minutes should sum to the scored global");
  });
  check("'Agenda drift by member' card renders under Participation, with Karl's other-item question named and reported deferred (engine v2.4)", () => {
    sandbox.render(model);
    const html = els.report.innerHTML;
    const partsIdx = html.indexOf(">Participation<");
    const driftIdx = html.indexOf("Agenda drift by member");
    assertTrue(partsIdx !== -1 && driftIdx > partsIdx, "drift card should render after the Participation card");
    const handled = html.slice(html.indexOf("How they were handled"), html.indexOf("How they were handled") + 300);
    assertTrue(/Karl/.test(handled) && /deferred/.test(handled), handled);
    assertTrue(/1 of 3/.test(html), "expected the Sample's one other-item question of three total");
  });
  check("'no keyword match' (Unclear) is never counted as off-topic in the drift tile (engine v2.4)", () => {
    sandbox.render(model);
    // Sample has 1 other-item question and 0 no-keyword-match questions;
    // the "1 of 3" tile must reflect other-item only, not other+unclear.
    const html = els.report.innerHTML;
    const tileIdx = html.indexOf("Agenda drift by member");
    assertTrue(/1 of 3/.test(html.slice(tileIdx, tileIdx + 400)), "off-topic tile should count only the 'other item' verdict");
  });
}
{
  // off_agenda_minutes must be null (not a false zero) per person too,
  // under the exact same condition the global figure is null.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "";
  els.aTrans.value = "[10:00] We shipped the release last night without any issues on the platform.\n[10:05] It went fine across every region we deployed to.";
  const ext = sandbox.localExtract();
  check("off_agenda_minutes is null, not 0, per person when off-agenda isn't assessable (engine v2.4)", () => {
    assertNull(ext.meeting.off_agenda_minutes);
    ext.participants.forEach(p => assertNull(p.off_agenda_minutes, p.name));
  });
  const model = sandbox.compute(ext);
  sandbox.render(model);
  check("both halves gated (no agenda, no speaker labels) -- the drift card is skipped entirely, not shown empty (engine v2.4)", () => {
    assertTrue(!/Agenda drift by member/.test(els.report.innerHTML));
  });
}
{
  // No speaker labels: question half of the drift card reads Not
  // Assessable, but the talk half (which only needs the agenda + text)
  // still renders real minutes.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Budget review — 10 min";
  els.aTrans.value = [
    "[10:00] We shipped the release last night without any issues on the platform and it went smoothly for the whole team here.",
    "[10:05] Did the rollout finish cleanly across every region we deployed to and are there lingering concerns about regressions.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  check("no speaker labels -- drift card's question half is Not Assessable, talk half still renders (engine v2.4)", () => {
    const html = els.report.innerHTML;
    assertTrue(/Agenda drift by member/.test(html), "card should still render for the talk half");
    const driftIdx = html.indexOf("Agenda drift by member");
    const tiles = html.slice(driftIdx, html.indexOf("</table>", driftIdx));
    assertTrue(/Not assessable — no speaker labels/.test(tiles), tiles);
    assertTrue(typeof ext.meeting.off_agenda_minutes === "number", "off-agenda minutes should still be assessable from the agenda+text alone");
  });
}
{
  // Route B JSON predating v2.4's off_agenda_minutes field must still
  // render the drift card's question half without throwing, degrading
  // the per-person talk column to Not Assessable.
  const { sandbox, els } = boot(APP_PATH);
  const legacy = {
    meeting: { title: "t", date: null, scheduled_minutes: 30, actual_minutes: 30, start_delay_minutes: 0,
      dead_time_minutes: null, off_agenda_minutes: 5, total_talk_minutes: 20, avg_decision_latency_minutes: null, invitees: 5 },
    agenda_items: [{ title: "Item", planned_minutes: 10, planned_order: 1, actual_minutes: 10, actual_order: 1,
      substantive: true, decision_expected: false, decision_made: false, closed: false, evidence: "L1", owners: ["Sara"], located: true }],
    participants: [{ name: "Sara", present: true, minutes_present: 30, talk_minutes: 10, questions: 0, answers: 0, proposals: 0, risks: 0, info: 0 }],
    presenters: [],
    interaction: { questions_raised: 1, questions_answered: 1, questions_deferred: 0,
      questions: [{ text: "q?", asker: "Sara", status: "answered", responder: "Omar", evidence: "L1", agenda_item: "Item", topic_match: "other item (Foo)" }],
      feedback_instances: null, chat_substantive_messages: null, interruptions_per_10min: null, turns_per_10min: null },
    outcomes: { actions_total: 0, actions_with_owner_and_due: 0, transcript_items: 0, mom_items: null, matched_items: null, decisions: [], actions: [] },
    quality: { has_timestamps: false, has_speaker_labels: true, notes: [] },
  };
  let threw = false, model;
  try { model = sandbox.compute(legacy); sandbox.render(model); } catch (e) { threw = e; }
  check("legacy Route B JSON without participants[].off_agenda_minutes renders the drift card without throwing (engine v2.4)", () => {
    assertTrue(!threw, threw && threw.stack);
    const html = els.report.innerHTML;
    assertTrue(/Agenda drift by member/.test(html));
    const rowIdx = html.indexOf("Off-agenda talk");
    const row = html.slice(rowIdx, html.indexOf("</table>", rowIdx));
    assertTrue(/<td class="num" dir="ltr">—<\/td>\s*<td class="num" dir="ltr">—<\/td><\/tr>/.test(row), row);
  });
}
{
  // A decision/action/question whose person can't be reached from any
  // Participation row -- an owner-less action -- must still surface
  // somewhere on the report, via the unattributed catch-all card.
  const { sandbox, els } = boot(APP_PATH);
  els.aAgenda.value = "1. Vendor — Sara — 10 min";
  els.aTrans.value = [
    "[10:00] Sara: Legal will review the vendor contract by Friday so we can close it out next sprint.",
  ].join("\n");
  const ext = sandbox.localExtract();
  const model = sandbox.compute(ext);
  sandbox.render(model);
  const html = els.report.innerHTML;
  check("an owner-less action item appears in the unattributed catch-all card (engine v2.1)", () =>
    assertTrue(/Unattributed items/.test(html) && /review the vendor contract/.test(html), html.slice(html.indexOf("Unattributed"), html.indexOf("Unattributed") + 400)));
}
{
  // Legacy Route B JSON predating quality.agenda_keywords must still render
  // the off-agenda section -- falling back to a generic sentence instead of
  // naming keywords it was never given.
  const { sandbox, els } = boot(APP_PATH);
  const legacy = {
    meeting: { title: "t", date: null, scheduled_minutes: 30, actual_minutes: 30, start_delay_minutes: 0,
      dead_time_minutes: null, off_agenda_minutes: null, total_talk_minutes: 20, avg_decision_latency_minutes: null, invitees: 5 },
    agenda_items: [{ title: "Item", planned_minutes: 10, planned_order: 1, actual_minutes: 10, actual_order: 1,
      substantive: true, decision_expected: false, decision_made: false, closed: false, evidence: "L1", owners: ["Sara"], located: true }],
    participants: [{ name: "Sara", present: true, minutes_present: 30, talk_minutes: 10, questions: 0, answers: 0, proposals: 0, risks: 0, info: 0,
      timeline: [{ text: "an off-agenda remark", time: "L1", agenda_item: "Item", off_agenda: true }] }],
    presenters: [],
    interaction: { questions_raised: 0, questions_answered: 0, questions_deferred: 0, questions: null,
      feedback_instances: null, chat_substantive_messages: null, interruptions_per_10min: null, turns_per_10min: null },
    outcomes: { actions_total: 0, actions_with_owner_and_due: 0, transcript_items: 0, mom_items: null, matched_items: null, decisions: [], actions: [] },
    quality: { has_timestamps: false, has_speaker_labels: true, notes: [] }, // no agenda_keywords -- legacy JSON
  };
  let threw = false;
  try {
    const model = sandbox.compute(legacy);
    sandbox.render(model);
    sandbox.renderParticipant("Sara");
  } catch (e) { threw = e; }
  check("legacy JSON without quality.agenda_keywords renders the off-agenda section with a generic fallback, not throwing (engine v2.1)", () =>
    assertTrue(!threw && /Classified off-agenda by keyword proximity to the agenda/.test(els.report.innerHTML), threw && threw.stack));
}
{
  // Legacy Route B JSON without chat/timeline must degrade gracefully,
  // not throw -- same defensive-read posture as the v1.6 fields.
  const { sandbox, els } = boot(APP_PATH);
  const legacy = {
    meeting: { title: "t", date: null, scheduled_minutes: 30, actual_minutes: 30, start_delay_minutes: 0,
      dead_time_minutes: null, off_agenda_minutes: null, total_talk_minutes: 20, avg_decision_latency_minutes: null, invitees: 5 },
    agenda_items: [{ title: "Item", planned_minutes: 10, planned_order: 1, actual_minutes: 10, actual_order: 1,
      substantive: true, decision_expected: false, decision_made: false, closed: false, evidence: "L1", owners: ["Sara"], located: true }],
    participants: [{ name: "Sara", present: true, minutes_present: 30, talk_minutes: 10, questions: 0, answers: 0, proposals: 0, risks: 0, info: 0 }],
    presenters: [],
    interaction: { questions_raised: 0, questions_answered: 0, questions_deferred: 0, questions: null,
      feedback_instances: null, chat_substantive_messages: null, interruptions_per_10min: null, turns_per_10min: null },
    outcomes: { actions_total: 0, actions_with_owner_and_due: 0, transcript_items: 0, mom_items: null, matched_items: null, decisions: [], actions: [] },
    quality: { has_timestamps: false, has_speaker_labels: true, notes: [] },
  };
  let threw = false;
  try {
    const model = sandbox.compute(legacy);
    sandbox.render(model);
    sandbox.renderParticipant("Sara");
  } catch (e) { threw = e; }
  check("legacy participant JSON without chat/timeline renders the drill-down page without throwing", () =>
    assertTrue(!threw, threw && threw.stack));
  check("missing timeline shows the no-timeline message", () =>
    assertTrue(/no timestamped timeline available/i.test(els.report.innerHTML)));
}
{
  // A timeline saved before v2.2 (or a hand-written Route B one) has no
  // kind/answer tags at all -- the participant page must still classify
  // each utterance correctly by falling back to utterKind() on the raw
  // text, and skip Answers given (that needs Q&A pairing, not derivable
  // from text alone) rather than guessing.
  const { sandbox, els } = boot(APP_PATH);
  const legacy = {
    meeting: { title: "t", date: null, scheduled_minutes: 30, actual_minutes: 30, start_delay_minutes: 0,
      dead_time_minutes: null, off_agenda_minutes: null, total_talk_minutes: 20, avg_decision_latency_minutes: null, invitees: 5 },
    agenda_items: [{ title: "Item", planned_minutes: 10, planned_order: 1, actual_minutes: 10, actual_order: 1,
      substantive: true, decision_expected: false, decision_made: false, closed: false, evidence: "L1", owners: ["Sara"], located: true }],
    participants: [{ name: "Sara", present: true, minutes_present: 30, talk_minutes: 10, questions: 1, answers: 0, proposals: 1, risks: 1, info: 0,
      timeline: [
        { text: "Should we ship this by Friday?", time: "L1", agenda_item: "Item", off_agenda: false },
        { text: "I suggest we split the release into two phases instead", time: "L2", agenda_item: "Item", off_agenda: false },
        { text: "There is a real risk the vendor contract slips past the deadline", time: "L3", agenda_item: "Item", off_agenda: false },
      ] }],
    presenters: [],
    interaction: { questions_raised: 1, questions_answered: 0, questions_deferred: 0, questions: null,
      feedback_instances: null, chat_substantive_messages: null, interruptions_per_10min: null, turns_per_10min: null },
    outcomes: { actions_total: 0, actions_with_owner_and_due: 0, transcript_items: 0, mom_items: null, matched_items: null, decisions: [], actions: [] },
    quality: { has_timestamps: false, has_speaker_labels: true, notes: [] },
  };
  let threw = false;
  try {
    const model = sandbox.compute(legacy);
    sandbox.render(model);
    sandbox.renderParticipant("Sara");
  } catch (e) { threw = e; }
  const pd = els.report.innerHTML;
  check("a legacy timeline with no kind/answer tags still classifies via the utterKind() fallback, without throwing (engine v2.2)", () =>
    assertTrue(!threw, threw && threw.stack));
  check("...Questions asked gets the question utterance", () =>
    assertTrue(pd.slice(pd.indexOf("Questions asked"), pd.indexOf("Answers given")).includes("Should we ship"), pd));
  check("...Proposals gets the suggestion utterance", () =>
    assertTrue(pd.slice(pd.indexOf("Proposals"), pd.indexOf("Risks")).includes("split the release"), pd));
  check("...Risks gets the risk utterance", () =>
    assertTrue(pd.slice(pd.indexOf("Risks"), pd.indexOf("Info")).includes("vendor contract slips"), pd));
  check("...Answers given stays empty rather than guessing (no answer tag to derive from text alone)", () =>
    assertTrue(pd.slice(pd.indexOf("Answers given"), pd.indexOf("Proposals")).includes(">None recorded")));
}

// ---------------------------------------------------------------------
console.log("\n=== Route B (pasted JSON) back-compat with v1.6 fields (engine v1.6) ===");
{
  const { sandbox, els } = boot(APP_PATH);
  const legacy = {
    meeting: { title: "t", date: null, scheduled_minutes: 30, actual_minutes: 30, start_delay_minutes: 0,
      dead_time_minutes: null, off_agenda_minutes: null, total_talk_minutes: 20, avg_decision_latency_minutes: null, invitees: 5 },
    agenda_items: [],
    participants: [{ name: "Sara", present: true, minutes_present: 30, talk_minutes: 10, questions: 0, answers: 0, proposals: 0, risks: 0, info: 0 }],
    presenters: [],
    interaction: { questions_raised: 1, questions_answered: 1, questions_deferred: 0,
      questions: [{ text: "q?", asker: "Sara", status: "answered", responder: "Omar", evidence: "L1" }],
      feedback_instances: null, chat_substantive_messages: null, interruptions_per_10min: null, turns_per_10min: null },
    outcomes: { actions_total: 0, actions_with_owner_and_due: 0, transcript_items: 1, mom_items: null, matched_items: null,
      decisions: [{ text: "We agreed to proceed.", speaker: "Sara", evidence: "L2" }], actions: [] },
    quality: { has_timestamps: false, has_speaker_labels: true, notes: [] },
  };
  let model, threw = false;
  try {
    model = sandbox.compute(legacy);
    sandbox.render(model);
  } catch (e) { threw = e; }
  check("legacy Route B JSON without agenda_item/context/basis/topic_match still scores without throwing", () =>
    assertTrue(!threw, threw && threw.stack));
  check("legacy Route B JSON still produces a valid MPI", () =>
    assertTrue(model && isFinite(model.mpi)));
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
  check("header stamp reads 'engine v2.4'", () =>
    assertTrue(/engine v2\.4/.test(html), "version stamp not found"));
}
{
  const { sandbox } = boot(APP_PATH);
  check("footer method text is built from ENGINE_VERSION, not a second hardcoded string", () =>
    assertEqual(sandbox.ENGINE_VERSION, "2.4"));
}

// ---------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f.name + ": " + f.error));
  process.exit(1);
}
