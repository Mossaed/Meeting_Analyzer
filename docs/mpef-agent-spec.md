# MPEF Analyzer Agent — Deployment Specification v1.3

A self-contained specification for deploying the Meeting Performance Evaluation Framework (MPEF v1.0) as an agent on any agentic AI platform. Paste §1 as the system prompt, wire §2 as the extraction contract, implement §3 as a code tool (never model output), operate per §4, and render §5.

**v1.3 alignment.** This revision matches analyzer engine v1.3 and folds in the field-hardening learned from real transcripts: platform-export normalization, evidence-honesty gates that stop unmeasurable metrics from scoring 0/100, sample-size disclosure, constrained-output resilience, and a third (no-LLM) deployment mode. Defaults here are identical to the workbook Config sheet and the app `CONFIG` — change one, change all three.

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
  lines; unwrap <v Name> voice tags), Teams "Name 0:04" block exports, and
  plain "[10:04] Name: text" / "Name: text" lines.
- Caption files with no speaker labels are still processed: set
  quality.has_speaker_labels=false and mark participation, presenter and Q&A
  pairing Not Assessable.
- Never treat label words as speakers: Decision:, Action:, Note:, Risk:,
  Agenda:, Update:, Summary:, Question:, Answer:, Topic:, Item:, FYI: and
  similar prefixes are content, not names.

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
- Off-agenda ratio requires semantic topic mapping (stage S3). Keyword-only
  pipelines must mark it Not Assessable rather than approximate it.
- Sample size: every ratio you extract must keep its raw counts so the report
  can print them (e.g. "100% · 1/1"); tiny denominators legitimately score 0
  or 100 and must be visibly thin.

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
- Anonymize participants as P1, P2… when the "anonymize" option is set.
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
    "decision_made": false, "closed": false, "evidence": "t=00:00"
  }],
  "participants": [{
    "name": "", "present": true, "minutes_present": null, "talk_minutes": null,
    "questions": 0, "answers": 0, "proposals": 0, "risks": 0, "info": 0
  }],
  "presenters": [{
    "name": "", "planned_minutes": null, "actual_minutes": null,
    "words": null, "filler_words": null,
    "questions_received": 0, "questions_answered": 0,
    "median_response_latency_seconds": null, "longest_turn_minutes": null
  }],
  "interaction": {
    "questions_raised": 0, "questions_answered": 0, "questions_deferred": 0,
    "feedback_instances": 0, "chat_substantive_messages": null,
    "interruptions_per_10min": null, "turns_per_10min": null
  },
  "outcomes": {
    "actions_total": 0, "actions_with_owner_and_due": 0,
    "transcript_items": 0, "mom_items": null, "matched_items": null,
    "decisions": [{ "text": "", "evidence": "t=00:00" }],
    "actions":   [{ "text": "", "owner": null, "due": null, "evidence": "t=00:00" }]
  },
  "quality": { "has_timestamps": false, "has_speaker_labels": false, "notes": [] }
}
```

Field semantics worth enforcing: `questions_answered` / `questions_deferred` are `null` (not 0) when speaker pairing is impossible; `words` and `filler_words` are `null` on condensed transcripts; evidence strings stay ≤ 14 chars (`t=10:31` or `L14`); caps of ≤12 agenda items, ≤12 participants, ≤6 presenters, ≤6 decisions, ≤8 actions, ≤6 notes keep constrained outputs safe.

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
3. **Agenda coverage map** — per item: planned vs actual minutes, order, status
4. **Presenter table** — one row per presenter, all D3 metrics
5. **Participation table** — anonymizable; talk share, contribution mix
6. **Decisions & actions register** — text, owner, due date, evidence reference
7. **Flags** — unanswered questions, overruns, unresolved items, MoM gaps, and every fired assessability gate; each with evidence
8. **Data-quality note + configuration** — artifacts received, format detected, transcript coverage %, timestamp resolution, proxies used, full config

Ratio metrics print their counts (e.g. `Decision yield 100% · 1/1`) so thin evidence is visible.

## 6. Deployment modes

**Mode 1 — Single agent.** One agent runs S1–S7 with the scoring tool attached; suits meetings whose artifacts fit one context window.

**Mode 2 — Multi-agent.** Extractor (S1–S4) → Scoring tool (S5, pure code) → Validator (S6) → Reporter (S7); suits long recordings and batch scoring.

**Mode 3 — Deterministic extractor (no LLM).** A rule-based S1–S4 substitute for offline, air-gapped, or fully reproducible contexts: regex lexicons for decisions/actions/deferrals/feedback, keyword agenda mapping, floor-time talk attribution, exact Gini. It honors every gate in §1, so weaker extraction yields *fewer scored metrics*, never fabricated ones. The offline app edition is the reference implementation.

**Reference implementations.** `mpef-analyzer.html` (modes 1+3 in-browser, Claude-connected) · `mpef-analyzer-offline.html` (mode 3, zero network) · `mpef-meeting-scorecard.xlsx` (§3 in spreadsheet form) · `meeting-performance-evaluation-framework.md` (source of truth) · reuse guide + deployment checklist for handoff. Keep §3 defaults synchronized across all of them.

## 7. Changelog

**v1.3** — input normalization for WebVTT/SRT/Teams exports; caption-only fallback; not-a-name guard; evidence-honesty gates (condensed transcripts, timestamp resolution, attendance grounding, audio-only signals, semantic off-agenda); counts beside ratios; robust-operation section (splitting, JSON repair, retries, oversize fallback); deterministic-extractor deployment mode.
**v1.0** — initial specification: role, pipeline, schema, scoring config, report template, single/multi-agent modes.
