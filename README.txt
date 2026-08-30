MPEF ANALYZER — OFFLINE EDITION
Meeting Performance Evaluation Framework v1.0

WHAT THIS IS
A single-file app that scores meeting productivity from meeting artifacts
(agenda, transcript, minutes, chat, attendance). Extraction and scoring both
run entirely on your computer. No internet, no installation, no account.

HOW TO OPEN
1. Save mpef-analyzer-offline.html anywhere on your computer.
2. Double-click it. It opens in your browser (Chrome, Edge, Firefox, or
   Safari from recent years all work).
3. The dark header should read "engine v1.6" - the filename never changes
   between versions, so this stamp is the only reliable way to check you
   have a current build. If it's missing or older, get a fresh copy.

QUICK START
- Press "Sample" to load a demo meeting, then "Extract & score locally"
  to see the full dashboard. On an unmodified build this always renders
  MPI 70.92 - Productive.
- For your own meeting: fill the meeting details, then paste (or use the
  small "Import file" link to load from disk) the agenda and transcript -
  minutes, chat and attendance are optional but unlock more metrics -
  then press "Extract & score locally".
- Transcripts work best with timestamps and speaker labels, e.g.
  [10:04] Sara: Let's get started...
  Plain "Name: text" lines work too, and exports from Teams / Zoom
  (WebVTT, SRT, "Name 0:04" blocks) are recognized automatically -
  paste them as-is, any size.

BETTER EXTRACTION (OPTIONAL, ANY AI)
The built-in engine is rule-based. For messy transcripts you can use any AI
chat tool: press "1 - Copy extraction prompt" (or "Save as .txt" for very large
transcripts), give it to the AI, copy the
JSON it returns into step 2, then press "3 - Score pasted JSON". Scoring is
identical either way.

GOOD TO KNOW
- Anything the text cannot truly support (silence, audio overlaps, pace or
  filler words in summarized notes, response latency without second-level
  timestamps) is reported "Not Assessable" - never estimated. Notes-style
  transcripts therefore score fewer metrics than full word-for-word ones;
  the flags panel tells you exactly what was skipped and why.
- The extraction JSON appears in an editable box, so you can correct any
  count and re-score instantly. "Download extraction JSON" saves it, or
  "Import file" loads a previously-saved one back in.
- Agenda lines can list more than one presenter, e.g.
  "3. Launch go/no-go - Lina & Marco - 10 min" - both get credited.
- Off-agenda ratio is estimated by keyword matching against your agenda
  (an approximation, always flagged as such - not true topic understanding).
  Dead time and interruption rate still can't be read from text at all -
  if you have them from a recording, the "Advanced evidence" section on
  the left lets you enter them by hand to unlock those metrics.
- Agenda items are matched to the transcript by stemmed keyword overlap, not
  exact wording, so "Q3 forecast" can match "forecasting for the quarter".
  If an item genuinely can't be matched (very different wording, or truly
  not discussed) it's labeled "not found" in the coverage map - distinct
  from "skipped" - and named in the flags panel so you can check it.
- Decisions are checked, not just pattern-matched - a question, a hedge
  ("we should approve"), or bare "Agreed." with nothing decided is excluded.
  Each surviving decision shows the full statement, who said it, when, which
  agenda item it belongs to, the surrounding exchange, and what qualified it
  as a real decision.
- Every question is listed under "Attendee questions", grouped by who asked
  it, tagged with the agenda item under discussion and whether it matched
  that item's topic, another item's, or neither - so a question asked in
  the wrong slot doesn't get lost.
- The Participation table only lists attendees who actually spoke; a silent
  attendee (present but never heard from) is dropped from the table with a
  disclosed count, not shown at a flat 0% - they still count in attendance
  rate, active contributors and speaking balance.
- Nothing is saved between sessions and nothing ever leaves your device.
- Use "Print / save as PDF", or "Download report (.html)" for a
  standalone copy, at the bottom of a report to keep or share results.
