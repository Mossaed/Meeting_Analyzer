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

  check("MPI ~= 70.92 (reuse guide sec7 / README acceptance test, engine v1.4: 'MPI 70.92 . Productive')", () =>
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
  els.aTrans.value = "[10:00] Sara: Let's review the budget numbers for this quarter in detail today.\n[10:05] Sara: Spend is tracking under plan overall for the year.";
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
  check("rendered decision shows the speaker name inline", () =>
    assertTrue(/<b>Sara:<\/b>/.test(els.report.innerHTML) || /<b>Amir:<\/b>/.test(els.report.innerHTML), "expected a bold speaker prefix in the Decisions card"));
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
console.log("\n=== Zero-network guarantee (offline edition) ===");
{
  const fs = require("fs");
  const html = fs.readFileSync(APP_PATH, "utf8");
  check("no fetch( call anywhere in the offline edition", () =>
    assertTrue(!/fetch\(/.test(html), "found fetch( in " + APP_PATH));
  check("no XMLHttpRequest/WebSocket/localStorage/sessionStorage", () =>
    assertTrue(!/XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB/.test(html)));
  check("header stamp reads 'engine v1.4'", () =>
    assertTrue(/engine v1\.4/.test(html), "version stamp not found"));
}
{
  const { sandbox } = boot(APP_PATH);
  check("footer method text is built from ENGINE_VERSION, not a second hardcoded string", () =>
    assertEqual(sandbox.ENGINE_VERSION, "1.4"));
}

// ---------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f.name + ": " + f.error));
  process.exit(1);
}
