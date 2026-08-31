# MPEF Analyzer Agent — Deployment Specification v2.4

A self-contained specification for deploying the Meeting Performance Evaluation Framework (MPEF v1.0) as an agent on any agentic AI platform. Paste §1 as the system prompt, wire §2 as the extraction contract, implement §3 as a code tool (never model output), operate per §4, and render §5.

**v2.4 alignment.** This revision matches analyzer engine v2.4: a new **Agenda drift by member** report section (§5) renders directly under the Participation table, naming who drove the meeting off its agenda — off-topic question counts and how each was handled, off-agenda talk minutes per attendee, and a comparison bar per member — built entirely from data the engine was already extracting (`interaction.questions[].topic_match`, `participants[].timeline[].off_agenda`). The one addition is `participants[].off_agenda_minutes` (§2), the per-person total of that same off-agenda tagging, `null` under the identical honesty gate `meeting.off_agenda_minutes` already sits behind. No scoring weight or band changed; the Sample acceptance value is unchanged from v1.6 (**MPI 70.92 · Productive**). Defaults here are identical to the workbook Config sheet and the app `CONFIG` — change one, change all three.

---

## 1. System prompt (paste verbatim)

```
You are the MPEF Analyzer, an objective meeting-productivity auditor implementing
the Meeting Performance Evaluation Framework v1.0.

ROLE
You accept meeting artifacts — agenda, transcript and/or recording, minutes (MoM),
chat log, attendance log, presentation deck — and produce a fixed-format
productivity report with a Meeting Productivity Index (MPI, 0–100).

DIVISION OF LABOR (never violate)
1. You EXTRACT and CLASSIFY only: speakers, agenda mapping, questions, answers,
   decisions, action items, feedback instances. Every extracted event carries a
   timestamp or line reference from the source artifact.
2. All arithmetic — every metric, score, and the MPI — is computed by the
   scoring tool (deterministic code), never estimated or produced by you.
3. If an artifact needed for a metric is absent, that metric and its dimension
   are reported "Not Assessable". You never estimate missing evidence.
4. Sentiment, tone, and inferred intent are excluded from all scoring.
5. Identical artifacts + identical configuration must yield an identical report.

INPUT NORMALIZATION (stage S1)
- Recognize platform exports and normalize them before parsing: WebVTT and SRT
  (strip WEBVTT/NOTE/STYLE headers, numeric cue ids, and "t1 --> t2" timing
  lines; unwrap <v Name> voice tags), block exports that put the speaker on
  its own header line above the speech -- in either order, "Name 0:04" or
  "02:32:23  Name" -- and plain "[10:04] Name: text" / "Name: text" lines.
- A block header's speaker label is not required to be a title-case person
  name: "The respective team", "PMO lead" and "Facilitator" are speakers.
  Bound it (a few words, no terminal sentence punctuation, not a label word
  like Decision:/Action:) so a line of speech is never read as a speaker,
  and apply the looser rule ONLY to a line holding nothing but a timestamp
  and the label -- an inline "[10:04] ..." caption line is speech.
- Caption files with no speaker labels are still processed: set
  quality.has_speaker_labels=false and mark participation, presenter and Q&A
  pairing Not Assessable.
- Never treat label words as speakers: Decision:, Action:, Note:, Risk:,
  Agenda:, Update:, Summary:, Question:, Answer:, Topic:, Item:, FYI: and
  similar prefixes are content, not names (Arabic equivalents apply too:
  قرار:, إجراء:, ملاحظة:, مخاطر:, and so on).
- Arabic and code-switched transcripts get the same treatment as English,
  not a degraded one: recognize Arabic speaker names (no case to key off,
  so "starts with an Arabic letter" is the name-shape signal), Arabic
  question marks (؟) alongside ASCII (?), and Arabic-Indic digits (٠-٩)
  in timestamps and durations. Decision/action/risk/feedback/deferral
  detection should run in whichever language (or mix) the utterance is
  actually in — a meeting is not "English-only" or "Arabic-only" just
  because most of it is one language. Filler-word/pace signals are the
  one exception: without a dependable Arabic filler lexicon, mark them
  Not Assessable on majority-Arabic speech rather than silently
  under-counting them as if a low score had been measured.

EVIDENCE-HONESTY GATES (apply before any metric is scored)
- Condensed transcripts: if transcribed words cover < 50% of the floor time,
  speaking pace, filler density, monologue ratio and turn density are Not
  Assessable — a summary cannot reveal them. State the coverage % in the
  data-quality note.
- Timestamp resolution: response latency requires second-level timestamps
  (HH:MM:SS). Minute-level stamps make it Not Assessable.
- Attendance grounding: attendance rate, retention and active-contributor
  ratio require attendance data (a log, or per-person presence minutes).
  Transcript speakers alone cannot define the attendee denominator — silent
  attendees are invisible.
- Audio-only signals: dead time / silence and interruption overlaps are never
  derived from text; they require the recording pipeline.
- Off-agenda ratio ideally requires semantic topic mapping (stage S3). A
  keyword-only pipeline (Mode 3) MAY score it as a disclosed approximation
  instead of leaving it permanently Not Assessable — classify each substantive
  utterance (a minimum-length floor, so backchannel isn't judged) as off-agenda
  when it matches none of the agenda's keywords — but only ever presented with
  an explicit data-quality note stating it is keyword proximity, never semantic
  understanding. A manually-supplied off-agenda figure always overrides the
  approximation.
- Zero-count honesty: a detector finding nothing (e.g. no praise/agreement
  phrases) is absence of evidence, not evidence of zero. Emit `null`, not `0`,
  for any count-type field where the detector may simply not have fired —
  scoring a false zero on a 0→best band silently drags a whole dimension down
  on no real evidence. The same applies to an agenda item a matcher could not
  locate in the transcript: it still counts as not-covered for coverage
  purposes, but its own actual-vs-planned timing is Not Assessable, not a
  measured 0.
- Sample size: every ratio you extract must keep its raw counts so the report
  can print them (e.g. "100% · 1/1"); tiny denominators legitimately score 0
  or 100 and must be visibly thin.
- Decision verification: never count an utterance as a decision merely
  because it contains decision-adjacent language. Exclude a question
  ("should we approve this?"), a negation ("we haven't agreed"), a
  hypothetical ("if we approved..."), an unadopted proposal ("we should
  approve", "I suggest we ship it"), a deferral ("let's decide next week"),
  or bare assent with no stated outcome ("Agreed." alone). Only an utterance
  that states an outcome actually taken counts.

PIPELINE (execute in order)
S1 Ingest    — normalize formats (above); parse every artifact into the
               canonical JSON schema.
S2 Speech    — if only audio is supplied: transcribe, diarize speakers, mark
               silences > 30 s and overlapping speech > 2 s.
S3 Align     — map each transcript segment to the agenda item it serves
               (semantic similarity ≥ 0.75 → mapped; else off-agenda).
S4 Events    — label questions, answers, deferrals, decisions, action items
               (owner, due date), feedback instances. Schema-constrained output.
S5 Compute   — CALL THE SCORING TOOL with the canonical JSON. Do not compute
               numbers yourself.
S6 Validate  — cross-check decisions/actions against the MoM (if supplied);
               attach data-quality flags (audio quality, missing diarization,
               timestamp resolution, transcript coverage %).
S7 Report    — render the fixed report template, citing a timestamp or line
               reference for every figure and flag. Print the full scoring
               configuration at the end.

OUTPUT RULES
- Fixed section order (see report template). No adjectives without numbers.
- Ratio metrics are reported with their counts beside the percentage.
- Anonymize participants as P1, P2… when the "anonymize" option is set —
  covers the Participation table and the participant detail view's own
  asker/responder names (same map); decision speakers and action owners are
  never anonymized.
- State every proxy, gate or degraded-mode measurement in the data-quality
  note (up to 6 concise notes), e.g. "condensed transcript (~12% of floor
  time transcribed) — pace, filler, monologue & turn density not assessable".
```

## 2. Canonical extraction schema (S1–S4 output)

The extraction stages must emit exactly this JSON. `null` means "not derivable from the supplied artifacts" — downstream code treats it as Not Assessable, **never** as zero. User-supplied metadata (title, date, scheduled start, scheduled length, invitee count) overrides inference.

```json
{
  "meeting": {
    "title": "", "date": "",
    "scheduled_minutes": 0, "actual_minutes": 0, "start_delay_minutes": 0,
    "dead_time_minutes": null, "off_agenda_minutes": null,
    "total_talk_minutes": null, "avg_decision_latency_minutes": null,
    "invitees": null
  },
  "agenda_items": [{
    "title": "", "planned_minutes": null, "planned_order": 1,
    "actual_minutes": null, "actual_order": null,
    "substantive": true, "decision_expected": false,
    "decision_made": false, "closed": false, "evidence": "t=00:00",
    "owners": null, "located": true
  }],
  "participants": [{
    "name": "", "present": true, "minutes_present": null, "talk_minutes": null,
    "questions": 0, "answers": 0, "proposals": 0, "risks": 0, "info": 0,
    "off_agenda_minutes": null, "chat": null, "timeline": null
  }],
  "presenters": [{
    "name": "", "planned_minutes": null, "actual_minutes": null,
    "words": null, "filler_words": null,
    "questions_received": 0, "questions_answered": 0,
    "median_response_latency_seconds": null, "longest_turn_minutes": null
  }],
  "interaction": {
    "questions_raised": 0, "questions_answered": 0, "questions_deferred": 0,
    "questions": null,
    "feedback_instances": null, "chat_substantive_messages": null,
    "interruptions_per_10min": null, "turns_per_10min": null
  },
  "outcomes": {
    "actions_total": 0, "actions_with_owner_and_due": 0,
    "transcript_items": 0, "mom_items": null, "matched_items": null,
    "decisions": [{ "text": "", "speaker": null, "time": null, "evidence": "t=00:00",
                    "agenda_item": null, "context": null, "basis": null }],
    "actions":   [{ "text": "", "owner": null, "due": null, "evidence": "t=00:00" }]
  },
  "quality": { "has_timestamps": false, "has_speaker_labels": false, "agenda_keywords": null, "notes": [] }
}
```

Field semantics worth enforcing: `questions_answered` / `questions_deferred` are `null` (not 0) when speaker pairing is impossible; `words` and `filler_words` are `null` on condensed transcripts; `feedback_instances` is `null` (not 0) whenever the detector found no instances at all — a zero count that reflects a real, positively-identified absence is the rare exception, not the default (see the zero-count honesty gate above); `agenda_items[].owners` is every presenter named for that item (an item may list more than one), `null` if none named; `agenda_items[].located` is `false` only when the topic could not be found discussed anywhere in the transcript — distinct from `substantive: false`, which means it *was* found but wasn't real discussion (see the anchoring note below); `outcomes.decisions[].speaker` is whoever stated the decision, `null` if unclear, and must pass decision verification (see the gate above) before it's included at all; `outcomes.decisions[].time` is a clock time or timestamp label if available, else `null`; `outcomes.decisions[].agenda_item` is the title of the agenda item it was made under, `null` if it falls outside every item's discussion; `outcomes.decisions[].context` is the 1-3 preceding lines plus the decision line, each `"Speaker: text"`, so the decision reads in its surrounding exchange; `outcomes.decisions[].basis` is one sentence on what qualified it as a real decision (the signal phrase, and anything corroborating it — a related action item, a matching minutes line), `null` if none can be articulated; `interaction.questions` is an array of `{text, asker, status: "answered"|"deferred"|"unanswered", responder, evidence, agenda_item, context, topic_match}` — one entry per question raised — or `null` when speaker pairing is impossible, mirroring `questions_answered`/`questions_deferred`. `questions[].agenda_item` is the item being discussed when the question was asked; `questions[].context` is the question plus the answering line if any, each `"Speaker: text"`; `questions[].topic_match` is `"on topic"` if the question's subject matches its own discussion, `"other item (TITLE)"` if it instead clearly belongs to a different agenda item (name it), or `"no keyword match"` if you can't tell either way — never assert a stronger claim like "off topic" than a text-only read supports. `participants[].chat` is that person's substantive chat messages as `{time, text}`, `null` if no chat log was supplied; `participants[].timeline` is every utterance they spoke as `{time, text, agenda_item, off_agenda, kind, answer}`, capped at 40 entries, `null` when speaker labels can't be resolved. `timeline[].kind` is `"question"` if the utterance contains `?`/`؟`, else `"proposal"`/`"risk"` if it matches that language, else `"info"` if it's a substantive statement (≥10 words), else `null` — the same classification, in the same priority order, that produces the participant's own `questions`/`proposals`/`risks`/`info` counts above, so exactly one timeline entry maps to each unit of those counts (v2.2). `timeline[].answer` is `true` on the utterance that answered someone else's question, independent of `kind` — an utterance can be both `kind:"info"` and `answer:true`. Both `chat` and `timeline` feed the participant detail view only and never affect scoring. `participants[].off_agenda_minutes` (v2.4) is the minutes this person spent on utterances tagged `off_agenda: true` in their own `timeline`, `null` under the exact same condition `meeting.off_agenda_minutes` is `null` (no agenda, or no matchable keywords) — a false zero here would be the same honesty violation the global figure already guards against. Feeds the Agenda drift by member section (§5) only, never scoring. `quality.agenda_keywords` (v2.1) is the keyword list off-agenda classification actually checked each utterance against, `null` when off-agenda wasn't assessable at all (no agenda items, or none carrying keywords) — it lets the participant detail view name what was checked instead of asserting a bare verdict; absent entirely on pre-v2.1 Route B JSON, which the render layer falls back for with a generic sentence. Evidence strings stay ≤ 14 chars (`t=10:31` or `L14`); caps of ≤12 agenda items, ≤12 participants, ≤6 presenters, ≤20 decisions, ≤8 actions, ≤24 questions, ≤6 notes, ≤40 timeline entries per participant keep constrained outputs safe.

**Anchoring an agenda item to its transcript span** (v1.5): match each item to the transcript passage that best represents it — highest shared vocabulary with the item's title, not merely the first sentence containing any one of its words — so a strong topic-opening passage wins over an earlier throwaway mention of the same words. `substantive` is a content judgment over that whole span (real, sustained discussion, or a recorded decision/action — never a passing one-line reference), independent of how many conversational turns it took or what the clock says; a topic thoroughly covered in a single long turn is substantive, and a brief but decisive go/no-go call is substantive by virtue of the decision alone. If no passage of the transcript plausibly corresponds to an item at all, set `located: false` — do not report `substantive: false` and stop there, since that reads as "the meeting skipped this" when the honest statement is "this could not be found," which may equally mean the wording differed from the agenda.

**Verifying a decision, not just detecting one** (v1.6): decision-adjacent language is not the same evidence as a decision actually taken. A pattern-only pipeline (Mode 3) will fire on a question, a negation, a hypothetical, an unadopted proposal, a deferral, and bare assent just as readily as on a real decision, so each candidate must be checked against the decision-verification gate in §1 before being counted at all — this changes what counts as `outcomes.decisions[]`, and therefore reaches MoM fidelity (D6) and decision-driven `closed`/coverage (D1, D6), unlike the presentation-only additions below. A surviving decision is then enriched with `time`, `agenda_item`, `context`, and `basis` so it can be verified against the transcript without a second read-through.

## 3. Scoring tool (implement as code)

Normalization: `score = clamp( 100 · (value − worst) / (best − worst), 0, 100 )`. Fractions in [0,1] where higher is better score as `value × 100`; "1 − x" metrics invert first. A `null` input drops the metric; a dimension averages over its remaining metrics; the MPI re-weights over assessable dimensions:

`MPI = Σ(weightᵢ · scoreᵢ · assessableᵢ) / Σ(weightᵢ · assessableᵢ)`

Default configuration (identical to the workbook and both app editions — calibrate, then freeze):

| Dimension (weight) | Metric | Formula | Worst → Best |
|---|---|---|---|
| D1 Agenda Discipline (20) | Coverage rate | substantive ÷ planned | ×100 |
| | Time adherence | avg of 1 − \|act−plan\|÷plan | ×100 |
| | Sequence adherence | items in planned position ÷ planned | ×100 |
| | Off-agenda ratio | off-agenda ÷ total talk | 0.40 → 0.05 |
| D2 Time Efficiency (15) | Start delay (min) | actual − scheduled start | 15 → 0 |
| | Duration overrun | (actual − sched) ÷ sched | 0.50 → 0 |
| | Dead time ratio | dead min ÷ duration | 0.30 → 0 |
| | Decision latency (min) | topic open → decision | 30 → 5 |
| D3 Presenter Effectiveness (20) | Allocation adherence | 1 − \|act−plan\|÷plan | ×100 |
| | Pace deviation (WPM) | distance outside 130–170 | 40 → 0 |
| | Filler per 100 words | fillers ÷ words × 100 | 8 → 1 |
| | Q&A responsiveness | answered ÷ received | ×100 |
| | Response latency (s) | median question→answer | 60 → 5 |
| | Monologue ratio | longest turn ÷ talk time | 0.80 → 0.30 |
| D4 Participation (20) | Attendance rate | present ÷ invited | ×100 |
| | Avg retention | time present ÷ duration | ×100 |
| | Active contributors | ≥1 substantive ÷ attendees | ×100 |
| | Speaking balance | 1 − Gini(talk time) | ×100 |
| | Interaction density | turns per 10 min | 2 → 12 |
| D5 Interaction Quality (10) | Question resolution | answered ÷ raised | ×100 |
| | Feedback instances | count | 0 → 8 |
| | Chat engagement | substantive msgs ÷ attendee | 0 → 1 |
| | Interruption rate | overlaps >2 s per 10 min | 6 → 0.5 |
| D6 Outcomes (15) | Decision yield | made ÷ expected | ×100 |
| | Action completeness | owner AND due ÷ total | ×100 |
| | Topic resolution | 1 − unresolved ratio | ×100 |
| | MoM fidelity | mean(precision, recall) | ×100 |
| D7 Follow-Through (0, info) | Prior-action closure | closed ÷ due | ×100 |
| | Topic recurrence | recurring ÷ prior unresolved | 1 − x, ×100 |

MPI bands: ≥ 85 Highly Productive · 70–84 Productive · 50–69 Needs Improvement · < 50 Ineffective.

**Assessability gates the tool must enforce** (mirror of §1): question resolution needs a numeric `questions_answered`; attendance/retention/active need attendance data; pace/filler need `words`; latency needs `median_response_latency_seconds`; density, dead time, interruptions, off-agenda score only when their fields are non-null. Every gate that fires becomes an info flag in the report.

## 4. Robust operation (constrained platforms)

Learned in production and required for reliability:

1. **Output-budget splitting.** If the platform caps response length, run extraction as two schema-constrained streams — (A) meeting + agenda + interaction + outcomes + quality, (B) participants + presenters — and merge. Demand minified JSON and enforce the §2 caps.
2. **Tolerant JSON repair.** On parse failure, close unterminated strings/brackets and backtrack to the last complete value before retrying; salvage partial extractions rather than failing the run.
3. **Transient-failure retries.** Retry 429/5xx/network errors with increasing backoff (≈2 s, 5 s, 10 s + jitter); stagger parallel streams; treat 4xx "input too long" as non-retryable.
4. **Oversize fallback.** When input exceeds the model call's practical limit, fall back to the deterministic rule-based extractor (mode 3 below) and say so in the data-quality note, instead of erroring.
5. **Partial-stream degradation.** If only the people stream fails, still render the report with participation/presenter dimensions limited and a note — never discard the successful evidence.

## 5. Report template (fixed order)

1. **Header** — meeting, date, duration vs scheduled, attendance, **MPI + band**
2. **Dimension scorecard** — six scores with weights; Not Assessable rows flagged
3. **Agenda coverage map** — per item: presenter(s) (an item may list more than one — credit and disclose accordingly, per §1 DIVISION OF LABOR and the D3 scoring notes in §3), planned vs actual minutes, order, status. Status is one of closed / open / skipped / **not found** — the last is a distinct, honest label for `located: false` (a measurement failure), never collapsed into "skipped" (a finding that it genuinely wasn't discussed). Every not-found item is also named individually in Flags.
4. **Presenter table** — one row per presenter, all D3 metrics; a co-presented item contributes to every named presenter's row
5. **Participation table** — anonymizable; talk share, and a Contributions cell reading `Q·A·P·R·I·D·T` (questions asked, answers given, proposals, risks, info, decisions stated, actions owned per attendee — v2.2), plus a detail control opening a full per-participant view. That view is where every one of those seven counts has a matching section rendering its own items with evidence: questions asked show the answer received, resolution status, and `topic_match` (see §2); answers given show the question that was being answered (a footnote discloses that an answer is also counted under its own contribution type, so the same utterance legitimately appears twice); proposals/risks/info render the bare utterance with its agenda tag; decisions stated show the agenda item and the decision text (the underlying `context` and `basis` stay in the extraction JSON for anyone auditing a decision, but aren't rendered on the page); off-agenda contributions state the rule that fired — long enough to judge (≥8 words) and matching none of the agenda's keywords, naming the keywords checked (`quality.agenda_keywords`, see §2) and the agenda item whose span the utterance fell inside — plus presenter role, chat messages, and a full timeline. Render only attendees with a positively-measured nonzero talk share; an attendee whose share is unmeasurable (`null`) is still listed, but one measured at exactly zero is omitted with a disclosed count ("N attendees present with no recorded speech are not listed") rather than shown at a flat 0% — they still count toward attendance rate, active contributors and speaking balance.
6. **Agenda drift by member** (v2.4) — rendered directly under the Participation table when either half below is assessable (skipped only if both are gated). Three stat tiles: the count and share of questions verdicted `other item (...)` (proven off-topic — `no keyword match`/Unclear is never folded into this, since the keyword engine couldn't evidence drift either way); total off-agenda talk minutes and its share of talk time, with the scheduled-vs-actual overrun named alongside when both are known; and the deferred/answered/unanswered breakdown of just the off-topic questions. A per-member table (questions/on-topic/other item/unclear/off-agenda minutes/share of drift) and a stacked bar per attendee (on-agenda vs. off-agenda talk, scaled to the busiest talker) back the tiles with the same numbers. A closing line states how each off-topic question was handled — asker, the item under discussion when it was asked, `topic_match`, and resolution status. The question half needs `interaction.questions` (speaker labels); the talk half needs `off_agenda_minutes` (agenda + matchable keywords) both globally and per person (§2) — either can render alone.
7. **Unattributed items** (v2.1) — a compact card, rendered only when non-empty, listing any decision, action, or question whose person can't be reached from the Participation table (a `null` speaker/owner/asker, a no-speaker-label transcript, or a Route B name absent from `participants[]`) — so nothing silently disappears now that full detail lives on the per-participant view rather than on the dashboard.
8. **Flags** — unanswered and deferred questions listed individually by full text (not just a count), overruns, unresolved items, MoM gaps, and every fired assessability gate; each with evidence
9. **Data-quality note + configuration** — artifacts received, format detected, transcript coverage %, timestamp resolution, proxies used, full config

Ratio metrics print their counts (e.g. `Decision yield 100% · 1/1`) so thin evidence is visible.

## 6. Deployment modes

**Mode 1 — Single agent.** One agent runs S1–S7 with the scoring tool attached; suits meetings whose artifacts fit one context window.

**Mode 2 — Multi-agent.** Extractor (S1–S4) → Scoring tool (S5, pure code) → Validator (S6) → Reporter (S7); suits long recordings and batch scoring.

**Mode 3 — Deterministic extractor (no LLM).** A rule-based S1–S4 substitute for offline, air-gapped, or fully reproducible contexts: regex lexicons for decisions/actions/deferrals/feedback, keyword agenda mapping, floor-time talk attribution, exact Gini. It honors every gate in §1, so weaker extraction yields *fewer scored metrics*, never fabricated ones. The offline app edition is the reference implementation.

**Reference implementations.** `mpef-analyzer.html` (modes 1+3 in-browser, Claude-connected) · `mpef-analyzer-offline.html` (mode 3, zero network) · `mpef-meeting-scorecard.xlsx` (§3 in spreadsheet form) · `meeting-performance-evaluation-framework.md` (source of truth) · reuse guide + deployment checklist for handoff. Keep §3 defaults synchronized across all of them.

## 7. Changelog

**v2.4** — new report section, no scoring change. **Agenda drift by member** (§5) renders directly under the Participation table: off-topic question counts with how each was handled, off-agenda talk minutes per attendee, and a comparison bar per member. Almost entirely built from data already extracted -- `interaction.questions[].topic_match` and `participants[].timeline[].off_agenda` -- except one addition, `participants[].off_agenda_minutes` (§2), the per-person total of that same tagging, `null` under the identical honesty gate the global `meeting.off_agenda_minutes` already sits behind (no agenda, or no matchable keywords), so a false zero never appears where the split simply isn't assessable. Only the "other item" verdict counts as proven off-topic; `"no keyword match"` renders as a separate Unclear count rather than being folded in, since the keyword engine couldn't evidence drift either way -- the same posture the framework already holds for `topic_match` itself. The section's two halves gate independently (questions need speaker labels, talk needs off-agenda to be assessable) and the whole section is omitted, not shown empty, only when both are gated. Sample acceptance value unchanged (MPI 70.92).
**v2.3** — input-normalization only, no scoring change. Block-format transcripts are now recognized in both orderings (`Name 0:04` and `02:32:23  Name`), and a block header's speaker label no longer has to match a title-case person-name pattern, so labels like "The respective team" are captured as speakers rather than being absorbed into the utterance text -- a speaker-first block with such a label previously produced no utterances at all. Arabic-Indic digits are folded before block detection. The looser label is scoped to transcripts already proven to be block/export format, so caption-only input keeps `has_speaker_labels: false` and every people-dependent metric stays Not Assessable. Sample acceptance value unchanged (MPI 70.92).
**v2.2** — presentation-consistency fix, no scoring change. The Contributions cell's Q/A counters (`participants[].questions`/`.answers`) were always the uncapped, scoring-relevant numbers feeding D4 Active contributors; the participant detail page instead filtered the *capped* (≤24) `interaction.questions[]` array, so a busy transcript could show the cell one number and the drill-down page a smaller one, and Proposals/Risks/Info had no detail-page representation at all despite being counted in the cell. Fixed by tagging every `participants[].timeline[]` entry with `kind` and `answer` (§2) at extraction time — the same classification that produces the counts — and rebuilding Questions asked, Answers given, Proposals, Risks and Info entirely from those tags, joined to the enriched `interaction.questions[]` record when one exists (for status/`topic_match`/the answer received) and falling back to the bare utterance when it doesn't (past the cap, or absent on legacy JSON). The Participation table's standalone Q/D/A columns are dropped — D and T (actions owned) join the cell instead, so every count lives in one place. Sample acceptance value unchanged (MPI 70.92).
**v2.1** — presentation only, no scoring change. The per-participant detail view (§5) now renders the evidence that was already being extracted but never shown: a question's answer, status and `topic_match`; and, for off-agenda contributions, the reasoning itself — the ≥8-word/no-keyword-match rule that actually ran, naming the keywords checked via the new `quality.agenda_keywords` field (§2, `null` when not assessable, absent on pre-v2.1 Route B JSON). Decisions stated render the agenda item and the decision text only — `context` and `basis` stay in the extraction JSON, not on the page; an earlier draft of this release rendered them too, but that buried the decision itself under a preceding exchange already visible in the same page's Timeline. The dashboard's Attendee questions, Decisions and Action items cards are retired — that detail now lives on the participant view they duplicated — replaced by a compact **Unattributed items** card (§5) that surfaces only what can't be reached from any Participation row, so an owner-less action or a no-speaker-label transcript's decisions don't silently disappear. Sample acceptance value unchanged from v1.5 (MPI 70.92).
**v2.0** — Mode 3's deterministic extractor gained a full Arabic pattern set (names, decisions, actions, deferrals, risk, feedback, agenda-anchoring stemmer) running per-token alongside the English one, so a code-switched utterance is caught by whichever language it's in — closing a prior gap where an Arabic transcript captured nothing at all (zero speakers, zero decisions, every item unlocatable). Filler-word detection stays English-only and now reports Not Assessable, not a false low count, on majority-Arabic transcripts. `participants[]` gained `chat` and `timeline` (§2), feeding a new per-participant detail view alongside three new Participation-table count columns (§5) — all purely additive, no scoring impact. The report gained hover/focus tooltips on every metric and dimension, and — display layer only — a language toggle; `band`, agenda `status`, and `topic_match` stay canonical English in the underlying data regardless of display language, so Route B round-tripping and the golden fixtures are unaffected. No scoring weight or band changed; the Sample acceptance value is unchanged from v1.6 (MPI 70.92).
**v1.6** — decisions are now verified, not just pattern-matched: a candidate must survive an explicit disqualifier check (question, negation, hypothetical, unadopted proposal, deferral, bare assent) before being counted at all, which reaches MoM fidelity (D6) and decision-driven `closed`/coverage (D1, D6) — unlike the rest of this revision, this changes what gets scored, though the Sample's own three decisions all survive unchanged. Surviving decisions gained `time`, `agenda_item`, `context`, and `basis` (§2), rendered as their own full-width report section instead of split with actions. `interaction.questions[]` gained `agenda_item` and a three-state `topic_match` (on topic / other item / no keyword match), surfaced in a new **Attendee questions** report section (§5) grouped by asker. The Participation table now omits attendees with a positively-measured zero talk share, disclosing the count instead of listing them at a flat 0% — a `null` (unmeasurable) share is never omitted. Caps raised: decisions ≤6→≤20, questions ≤12→≤24. No scoring weight or band changed; the Sample acceptance value is unchanged from v1.5 (MPI 70.92).
**v1.5** — agenda anchoring now scores every item against every transcript passage by stemmed keyword overlap and assigns globally best-first, instead of "first utterance containing any keyword" — fixes an item's real discussion losing its anchor to an earlier passing mention of the same words, and two items sharing an ambiguous keyword no longer orphans whichever was listed second. `substantive` is redefined as a content judgment (a word-count floor over the mapped span, or a recorded decision/action) instead of a turn-count-and-1-minute-floor test, so it means the same thing with or without timestamps and can no longer be defeated by clock-resolution artifacts (two anchors landing in the same displayed minute) or by a topic covered thoroughly in a single long turn. Added `agenda_items[].located` to distinguish "the matcher never found this topic" from "it was found but wasn't real discussion" — both in the schema and in the report template's status (§5), plus an individual Flags entry naming every not-found item. No scoring weight, band, or MPI band threshold changed.
**v1.4** — multi-presenter agenda items (`agenda_items[].owners`, credited and disclosed rather than silently dropped); off-agenda ratio scored by disclosed keyword-proximity approximation in Mode 3 instead of permanently Not Assessable; zero-count honesty gate (a detector finding nothing emits `null`, never a scored `0`) applied to `feedback_instances` and to agenda items a matcher couldn't locate; full decision text with `speaker` attribution, never clipped; `interaction.questions[]` so unanswered/deferred questions are named individually in flags, not just counted.
**v1.3** — input normalization for WebVTT/SRT/Teams exports; caption-only fallback; not-a-name guard; evidence-honesty gates (condensed transcripts, timestamp resolution, attendance grounding, audio-only signals, semantic off-agenda); counts beside ratios; robust-operation section (splitting, JSON repair, retries, oversize fallback); deterministic-extractor deployment mode.
**v1.0** — initial specification: role, pipeline, schema, scoring config, report template, single/multi-agent modes.
