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
3. The dark header should read "engine v2.6" - the filename never changes
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
  (WebVTT, SRT) are recognized automatically - paste them as-is, any size.
  Block-style transcripts, where the speaker sits on its own line above
  what they said, work in either order and with any timestamp style:
      02:32:23  The respective team
      We are eight percent under on infrastructure this quarter.
  or
      The Chairman 01:19:06
      Can we close the vendor contract before month end?
  The speaker label doesn't have to be a person's name - "The respective
  team", "PMO lead" or "Facilitator" are all read as speakers.
- Speaker names are matched independent of case - "Sara" and "sara" are
  read as the same person, credited under the capitalized spelling. This
  only recognizes a lowercase label once the capitalized form already
  appears elsewhere in the same transcript, so ordinary text can never be
  mistaken for a speaker; a transcript that's lowercase throughout, with
  no capitalized occurrence anywhere, still needs real speaker labels to
  unlock participation, presenter and Q&A metrics.

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
- The Participation table only lists attendees who actually spoke; a silent
  attendee (present but never heard from) is dropped from the table with a
  disclosed count, not shown at a flat 0% - they still count in attendance
  rate, active contributors and speaking balance. Each row also shows a
  contribution breakdown - Q questions, A answers, P proposals, R risks,
  I info, D decisions stated, T actions owned - and a small "..." button
  opens a full page for them, where each of those seven counts has its own
  section showing exactly what it counted: every question they asked (with
  the answer it got, its status, and whether it matched the topic under
  discussion), every question they answered, their proposals and flagged
  risks, their other substantive remarks, every decision they stated
  (agenda item and full text), every action they own, what they said in
  chat, and every off-agenda contribution - each one explaining why it was
  judged off-agenda (too far from the agenda's own keywords) - plus a
  complete timeline. A "Back to report" button returns you to the
  dashboard. A decision, action or question that can't be tied to anyone on
  the Participation table (no owner named, or a transcript with no speaker
  labels) still isn't lost - it surfaces in a small "Unattributed items"
  card at the bottom of the report instead.
- Right under the Participation table, "Agenda drift by member" shows who
  drove the meeting off its agenda: how many questions came in off-topic
  (and how each was handled - deferred, answered, or left unanswered), how
  many minutes of each person's talk time drifted off-agenda, and a bar
  per attendee comparing on-agenda vs. off-agenda talk. A question the
  keyword engine genuinely can't classify is labeled "Unclear," never
  counted as off-topic - same honesty rule as everywhere else in this app.
- Hover (or tap, or Tab to it) the small "i" next to any metric or
  dimension name for a one-line explanation of what it measures.
- Click "العربية" at the top-left to switch the whole app - including the
  report and the Sample meeting - to Arabic with a right-to-left layout,
  and back to English any time. The choice isn't saved between sessions,
  same as everything else here. Arabic transcripts are captured with the
  same rigor as English ones (names, decisions, actions, questions,
  agenda matching); the flags panel and the any-AI extraction prompt stay
  in whichever language was active when you last pressed Extract & score.
- Nothing is saved between sessions and nothing ever leaves your device.
- Use "Print / save as PDF", or "Download report (.html)" for a
  standalone copy, at the bottom of a report to keep or share results.
  The downloaded file still has no script of any kind - opening it, the
  "..." button next to each attendee still opens that person's full detail
  page (and "Back to report" still returns), the same as in the app.
