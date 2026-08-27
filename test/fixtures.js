// Golden fixtures for the MPEF scoring engine.
//
// FIXTURE A (sample): the app's own built-in "Sample" meeting, run through
// its local rule-based extractor. This is the acceptance test the reuse
// guide (§7) and agent spec describe: "Sample -> Extract & score locally"
// must deterministically render MPI 70.92 - Productive (engine v1.4).
//
// v1.4 moved this value from 75.13: off-agenda ratio is now scored by
// keyword-proximity matching instead of being permanently Not Assessable
// on the local route (see docs/mpef-analyzer-reuse-guide.md §4 and the
// engine v1.4 changelog entry). Every place this acceptance value is
// documented was re-derived and updated together -- see README.md,
// README.txt, and reuse guide §7/§9.
//
// FIXTURE B (workbook): the example meeting shipped in
// docs/mpef-meeting-scorecard.xlsx, transcribed into the canonical §2
// extraction schema and scored by the app's compute(). Expected values
// below were read directly from the workbook's cached formula results
// (openpyxl, data_only=True) -- an independent implementation of the same
// spec (docs/mpef-agent-spec.md §3). Matching to 1e-6 is the parity
// contract described in reuse guide §6 and spec: "change one, change all
// three." Untouched by v1.4: it feeds compute() directly with a non-null
// off_agenda_minutes already set, bypassing the local extractor entirely.
"use strict";

const SAMPLE_EXPECTED = {
  mpi: 70.92267573696147,
  mpiTolerance: 1e-6,
  band: "Productive",
  assessable: 6,
  dims: {
    D1: 65.093537414966, D2: 83.77777777777777, D3: 73.33333333333334,
    D4: 72.5545634920635, D5: 47.22222222222222, D6: 76.25,
  },
  dimTolerance: 1e-6,
};

function agendaItem(title, pm, po, am, ao, substantive, decExp, decMade, closed) {
  return {
    title, planned_minutes: pm, planned_order: po,
    actual_minutes: am, actual_order: ao,
    substantive, decision_expected: decExp, decision_made: decMade, closed,
  };
}
function participant(name, mp, tm, q, a, pr, r, i) {
  return {
    name, present: true, minutes_present: mp, talk_minutes: tm,
    questions: q, answers: a, proposals: pr, risks: r, info: i,
  };
}

// Transcribed from docs/mpef-meeting-scorecard.xlsx: Meeting, Agenda,
// Participants, Presenters, Interaction, Outcomes sheets.
const WORKBOOK_EXTRACTION = {
  meeting: {
    title: "Weekly Product Review", date: "2026-08-12",
    scheduled_minutes: 60, actual_minutes: 63,
    start_delay_minutes: 4, dead_time_minutes: 4, off_agenda_minutes: 6,
    total_talk_minutes: 52, avg_decision_latency_minutes: 12, invitees: 10,
  },
  agenda_items: [
    agendaItem("KPI review", 10, 1, 12, 1, true, false, false, true),
    agendaItem("Roadmap update", 10, 2, 15, 2, true, true, true, true),
    agendaItem("Launch go/no-go", 10, 3, 9, 4, true, true, true, true),
    agendaItem("Budget check", 10, 4, 8, 3, true, false, false, true),
    agendaItem("Hiring update", 10, 5, 5, 5, true, false, false, false),
    agendaItem("AOB", 10, 6, 0, null, false, false, false, false),
  ],
  participants: [
    participant("Sara", 63, 14, 2, 3, 1, 0, 2),
    participant("Amir", 63, 12, 1, 4, 1, 0, 3),
    participant("Lina", 63, 9, 1, 3, 1, 1, 1),
    participant("Omar", 63, 6, 3, 0, 0, 1, 1),
    participant("Dana", 63, 5, 2, 0, 1, 1, 0),
    participant("Karl", 63, 3, 2, 0, 0, 0, 1),
    participant("Mei", 55, 2, 1, 0, 0, 0, 0),
    participant("Tomás", 40, 1, 0, 0, 0, 0, 0),
  ],
  presenters: [
    { name: "Amir", planned_minutes: 15, actual_minutes: 15, words: 2250, filler_words: 30,
      questions_received: 5, questions_answered: 5, median_response_latency_seconds: 8, longest_turn_minutes: 6 },
    { name: "Lina", planned_minutes: 10, actual_minutes: 9, words: 1710, filler_words: 60,
      questions_received: 4, questions_answered: 3, median_response_latency_seconds: 15, longest_turn_minutes: 5 },
  ],
  interaction: {
    questions_raised: 12, questions_answered: 10, questions_deferred: 1,
    feedback_instances: 6, chat_substantive_messages: 5,
    interruptions_per_10min: 1.5, turns_per_10min: 8,
  },
  outcomes: {
    actions_total: 7, actions_with_owner_and_due: 5,
    transcript_items: 9, mom_items: 8, matched_items: 7,
    decisions: [], actions: [],
  },
  quality: { has_timestamps: true, has_speaker_labels: true, notes: [] },
};

// Cached formula results from the Scorecard sheet (openpyxl data_only=True).
const WORKBOOK_EXPECTED = {
  mpi: 77.1674579867014,
  band: "Productive",
  metricsByLabel: {
    "Coverage rate": 83.3333333333333,
    "Avg time adherence": 58.3333333333333,
    "Sequence adherence": 50,
    "Off-agenda ratio": 81.3186813186813,
    "Start delay": 73.3333333333333,
    "Duration overrun": 90,
    "Dead time ratio": 78.8359788359788,
    "Decision latency": 72,
    "Allocation adherence": 95,
    "Pace deviation": 75,
    "Filler per 100 words": 79.6992481203008,
    "Q&A responsiveness": 87.5,
    "Response latency": 88.1818181818182,
    "Monologue ratio": 64.4444444444444,
    "Attendance rate": 80,
    "Avg retention": 93.8492063492063,
    "Active contributors": 87.5,
    "Speaking balance (1−Gini)": 61.5384615384615,
    "Interaction density": 60,
    "Question resolution": 83.3333333333333,
    "Feedback instances": 75,
    "Chat per attendee": 62.5,
    "Interruptions per 10 min": 81.8181818181818,
    "Decision yield": 100,
    "Action completeness": 71.4285714285714,
    "Topic resolution (1−unresolved)": 80,
    "MoM fidelity": 82.6388888888889,
  },
  dims: {
    D1: 68.246336996337, D2: 78.542328042328, D3: 81.6375851244272,
    D4: 76.5775335775336, D5: 75.6628787878788, D6: 83.5168650793651,
  },
  tolerance: 1e-6,
};

module.exports = { SAMPLE_EXPECTED, WORKBOOK_EXTRACTION, WORKBOOK_EXPECTED };
