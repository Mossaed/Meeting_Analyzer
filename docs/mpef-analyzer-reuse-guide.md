# MPEF Analyzer — Reuse & Redeployment Guide

**Applies to:** engine v1.5 · offline edition (`mpef-analyzer-offline.html`) and connected edition (`mpef-analyzer.html`)
**Audience:** anyone who wants to run, distribute, customize, or redeploy the app in a new environment.

---

## 1. What this app is

The MPEF Analyzer turns meeting artifacts — agenda, transcript, minutes (MoM), chat log, attendance log — into an objective productivity report: a 0–100 Meeting Productivity Index (MPI), six weighted dimension scores, an agenda coverage map, presenter and participation tables, an outcomes register, and evidence-cited flags. It implements the Meeting Performance Evaluation Framework (MPEF) v1.0.

Its core design rule: **extraction finds evidence; deterministic code computes every number.** Anything the supplied artifacts cannot truly support is reported *Not Assessable* — never estimated. Same inputs + same configuration ⇒ same report, always.

Everything is one self-contained HTML file per edition. There is no build step, no dependency, no install, and no data storage: nothing is saved between sessions and (in the offline edition) nothing ever leaves the device.

## 2. The two editions

| | Offline edition | Connected edition |
|---|---|---|
| File | `mpef-analyzer-offline.html` | `mpef-analyzer.html` |
| Network calls | **None — physically removed** | One optional endpoint: `api.anthropic.com` |
| Extraction routes | Local rule engine · any-AI copy-prompt | Local rule engine · any-AI copy-prompt · **Analyze with Claude** button |
| Where the Claude button works | n/a | Only while the file runs as an artifact inside Claude, online |
| Best for | Distribution to any laptop, restricted networks, air-gapped machines | Use inside Claude itself |

Scoring code and configuration are identical in both, so the same evidence produces the same scores in either edition.

## 3. The three extraction routes

**Route A — Extract & score locally (works everywhere, fully offline).** A deterministic rule engine parses the pasted artifacts and the scoring code renders the dashboard. Accepted transcript shapes, auto-detected and normalized: `[10:04] Name: text`, `Name [10:04]: text`, `Name: text`, `10:04 Name: text`, WebVTT (including Teams/Zoom `<v Name>` voice tags), SRT (numbered cues, `-->` timing lines), Teams "Name 0:04" block exports, and caption files with no speaker names at all (people-dependent metrics then report n/a). Any size — 300k+ characters parse in well under a second.

**Route B — Any-AI route (extraction anywhere, scoring stays local).** "1 · Copy extraction prompt" (or "Save as .txt" for very large transcripts) produces a ready prompt embedding the pasted artifacts and the canonical JSON schema. Run it in any capable AI chat, paste the returned JSON into step 2, press "3 · Score pasted JSON". Best extraction quality for messy or summarized transcripts.

**Route C — Analyze with Claude (connected edition only).** Two parallel schema-constrained extraction calls with automatic retry/backoff for rate limits, plus automatic fallback to Route A when input exceeds ~60k characters or the API rejects it as too large.

The local engine also writes its extraction JSON into the editable step-2 box, so users can inspect, correct any count, and re-score instantly — regardless of route.

## 4. Honest-measurement rules built into v1.5

These exist so scores are never artifacts of note-taking; they are the answer to "why is this metric n/a?":

1. **Condensed-transcript detection.** If transcribed words cover under 50% of the floor time, pace, filler density, monologue ratio, and turn density are Not Assessable (a summary can't reveal them).
2. **Timestamp resolution.** Response latency requires second-level timestamps (`HH:MM:SS`); minute-level stamps mark it n/a.
3. **Attendance grounding.** Attendance rate, retention, and active-contributor ratio require attendance data (log pasted, or `minutes_present` in pasted JSON) — silent attendees are invisible in a transcript, so speaker-only data would fake these.
4. **Audio-only signals.** Dead time / silence and interruption overlaps are never scored from text.
5. **Off-agenda by keyword proximity.** Local extraction scores off-agenda ratio by classifying each substantive utterance (≥8 words, so backchannel is never judged) as off-agenda when it matches none of the agenda's keywords — always with a disclosure note that this is proximity matching, not semantic understanding. A manually-entered value (Advanced evidence card) always overrides it. Route B/C still provide true semantic mapping.
6. **Zero-count honesty.** A detector finding nothing is absence of evidence, not evidence of zero: `feedback_instances` is Not Assessable (not a scored 0) when no praise/agreement phrases are detected.
7. **Found vs. discussed (v1.5).** An agenda item's status distinguishes two different failures the old single "skipped" label conflated: an item the matcher couldn't locate anywhere in the transcript (**not found** — likely different wording than the agenda, flagged by name so you can check and correct it) from one that *was* located but wasn't real discussion (**skipped**). Coverage rate counts both as not-covered — a genuinely skipped item is equally unlocatable, so excluding either would gut the metric — but only "skipped" is a claim about what happened in the meeting.
8. **Sample-size transparency.** Ratio metrics display their counts (e.g. `100% · 1/1`); tiny denominators can legitimately score 0 or 100 and are visibly thin.
9. **Not-a-name guard.** Lines like `Decision: …` or `Action: …` are never mistaken for speakers.

The flags panel states which of these rules fired and why, prioritizing meeting-specific findings over generic ones when more than the agent spec's 6-note budget fire in one run (§2 of the agent spec: "notes <=6").

## 5. Deploying to other environments

**Single laptop (offline).** Copy `mpef-analyzer-offline.html` (or the zip) to the machine; double-click. Requirements: any evergreen browser (Chrome, Edge, Firefox, Safari) from recent years. No admin rights needed.

**Email / chat distribution.** Send `MPEF-Analyzer-Offline.zip` (contains the app + README + these docs). Zipping avoids mail filters that block bare `.html`.

**Shared drive / SharePoint / USB.** Drop the file anywhere users can open it. It runs from `file://` with full functionality.

**Intranet static hosting.** It is a static asset: place the file on any web server (nginx, Apache, IIS, S3/静态 bucket, GitHub Pages, SharePoint page). No backend, no database, no cookies. Suggested headers: standard static caching plus `Content-Security-Policy` if your org requires one — the offline edition needs no external origins at all.

**Inside Claude.** Paste or attach `mpef-analyzer.html` in a Claude chat so it renders as an artifact; the "Analyze with Claude" button works there with no key handling.

**Re-enabling the AI route on your own infrastructure.** The connected edition's keyless call works only inside Claude. To offer model extraction elsewhere, stand up a tiny proxy that holds your API key server-side and forwards the request, then point the app at it:

```js
// in mpef-analyzer.html, inside callClaude():
const res = await fetch("https://YOUR-PROXY.example.com/v1/messages", { ... });
```

The proxy must inject the provider's auth headers, pass through `{model, max_tokens, messages}`, and return the JSON body unchanged; allow CORS from your hosting origin. Never embed an API key in the HTML — anyone can read it. Alternatively, skip the proxy entirely: Routes A and B already cover every environment.

## 6. Configuration & customization

All scoring behavior lives in one `CONFIG` object near the top of the `<script>` block — edit, save, reload:

| Key | Default | Meaning |
|---|---|---|
| `weights` | D1 20 · D2 15 · D3 20 · D4 20 · D5 10 · D6 15 | Dimension weights for the MPI |
| `bands.startDelay` | 15 → 0 | Minutes late: worst (=0 pts) → best (=100 pts) |
| `bands.overrun` | 0.50 → 0 | Fraction of scheduled length |
| `bands.dead` | 0.30 → 0 | Dead-time fraction (audio pipelines only) |
| `bands.latency` | 30 → 5 | Topic open → decision, minutes |
| `bands.offAgenda` | 0.40 → 0.05 | Off-agenda talk fraction |
| `bands.pace` | 40 → 0 | Avg WPM outside the 130–170 band |
| `bands.filler` | 8 → 1 | Filler words per 100 words |
| `bands.respLat` | 60 → 5 | Median answer latency, seconds |
| `bands.monologue` | 0.80 → 0.30 | Longest turn ÷ presenter talk time |
| `bands.density` | 2 → 12 | Speaker turns per 10 min |
| `bands.feedback` | 0 → 8 | Feedback instances per meeting |
| `bands.chat` | 0 → 1 | Substantive chat messages per attendee |
| `bands.interrupt` | 6 → 0.5 | Overlaps > 2 s per 10 min |
| `mpiBands` | ≥85 Highly Productive · ≥70 Productive · ≥50 Needs Improvement · else Ineffective | MPI labels |

Normalization is always `clamp(100 · (value − worst)/(best − worst))`; ratios in \[0,1] where higher is better score as `value × 100`. **Calibrate once, then freeze** — comparability across meetings depends on a stable config, and the method footer prints it in every report for audit.

Other tuning points, each clearly labeled in the source: `RX` (regex lexicons for decisions, actions, deferrals, proposals, risks, feedback, fillers), `NOTNAME` (words never treated as speaker names), `STOPW` (agenda-keyword stopwords), the condensed-transcript threshold (`density < 0.5`), extraction caps (12 agenda items, 12 participants, 6 presenters, 6 decisions, 8 actions), visual theme (CSS variables in `:root`), and header branding text. The connected edition additionally exposes `CONFIG.model` and `CLAUDE_CHAR_LIMIT` (60,000 chars).

**Keeping the ecosystem in sync.** The companion Excel workbook (`mpef-meeting-scorecard.xlsx`, Config sheet) and agent spec (`mpef-agent-spec.md`, §3) carry the same defaults. If you change bands or weights, change them in all three so every implementation of the framework produces matching scores.

## 7. Verifying a deployment

Open the file and confirm the dark header reads **engine v1.5** — the filename never changes between versions, so this stamp is the only reliable build check. Then press **Sample → Extract & score locally**: on an unmodified v1.5 build this deterministically renders **MPI 70.92 · Productive** (unchanged from v1.4), six scored dimensions, and a flags panel that includes the condensed-transcript and off-agenda-keyword-matching disclosures. Full acceptance steps live in the companion checklist.

For the offline edition you can additionally prove network silence: search the file for `fetch(` — the only permitted match is none at all. (A bare search for `http` is not the right test: the file legitimately contains a URL-detection regex, `/^https?/i`, used to keep a pasted link from being mistaken for a speaker name.) Or open it with the browser's network tab recording and confirm zero requests beyond the file itself.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Header doesn't say engine v1.5 | Stale copy (identical filename) | Replace the file; re-share the zip |
| Agenda item shows "not found" | Wording differs from the agenda (paraphrase), or genuinely wasn't discussed | Check the flags panel entry naming it; if it *was* discussed, correct `located`/`substantive`/`evidence` in the editable step-2 JSON and re-score, or rephrase the agenda line closer to the transcript's wording |
| "Couldn't parse any utterances" | Unrecognized transcript layout | Use `[10:04] Name: text` lines, or paste the raw platform export (VTT/SRT/Teams are auto-detected) |
| Many metrics show n/a | Honest-measurement rules (§4) fired | Read the flags panel; supply richer artifacts (verbatim transcript, second-level timestamps, attendance log) or use Route B |
| Scores look extreme (0/100) with counts like 1/1 | Genuine tiny-sample ratios | Judge by the printed counts; more countable events → finer scores |
| "rate-limited" after several Claude runs | API throttling (connected edition) | The app retries automatically; wait ~1 min if it persists |
| "can't reach the Claude API from here" | File running outside Claude / offline | Expected — use Route A or B, or the offline edition |
| Giant prompt won't paste into an AI chat | Chat input limit | Use "Save as .txt" and attach the file to the AI instead |
| Nothing saved between sessions | By design (privacy) | Keep source artifacts; use "Print / save as PDF" to keep reports |

## 9. Version history

**v1.5** — agenda-to-transcript anchoring rewritten as stemmed, scored, best-overlap assignment instead of first-substring-hit, fixing several ways a genuinely-discussed item could render **skipped**; `substantive` redefined by span word count instead of turn count or clock minutes; items the matcher truly can't locate now render **not found**, a distinct status from **skipped**, with a named flag; last-item zero-minute clock artifact guarded with a word-count fallback. No weight, band, or formula changed; the Sample acceptance value is unchanged from v1.4 at **MPI 70.92**.
**v1.4** — multi-presenter agenda items, credited and disclosed rather than silently dropped; off-agenda ratio scored locally by disclosed keyword-proximity approximation instead of permanently n/a; zero-count honesty gate (a detector finding nothing is Not Assessable, never a scored 0) applied to feedback instances and to agenda items a matcher couldn't locate; full untruncated decision text with speaker attribution; unanswered/deferred questions named individually in the flags panel. Moves the Sample acceptance value from MPI 75.13 to **MPI 70.92**.
**v1.3** — WebVTT/SRT/Teams normalization; caption-only (no-speaker) fallback; not-a-name guard; Save-as-.txt for huge prompts; 3-token speaker names.
**v1.2** — attendance/active gating on real attendance data; counts shown beside ratio metrics; version stamp.
**v1.1** — condensed-transcript and timestamp-resolution gates; off-agenda/dead-time honesty; large-input hardening (337k chars ≈ 0.05–0.2 s); size-limit auto-fallback and unhandled-rejection fix (connected).
**v1.0** — initial release: local engine, any-AI route, Claude route with retry/backoff, offline edition split, system fonts.

## 10. Data handling

All parsing, scoring, and rendering happen in the browser tab. The offline edition performs zero network activity by construction. The connected edition transmits pasted artifacts to the model **only** when the user presses "Analyze with Claude". No cookies, no localStorage, no analytics; closing the tab erases everything. Reports can be anonymized upstream by replacing names in the artifacts, or with the **Anonymize participants** checkbox on the Meeting card, which renders the Participation table as P1, P2… (agent spec §1/§5) — presenter names and decision/action owners are intentionally left as-is, since the spec names only the participation table as anonymizable.

## 11. Companion assets (optional full-stack kit)

`meeting-performance-evaluation-framework.md` (the framework, source of truth — not yet included in this repository) · `mpef-agent-spec.md` (system prompt + schema + scoring spec for any agentic platform) · `mpef-meeting-scorecard.xlsx` (auto-calculating workbook, same defaults) · `mpef-framework-deck.pptx` (10-slide executive deck — not yet included). Redeploying the whole methodology in a new org means shipping these four plus one app edition, then calibrating the shared config once.

## 12. Fixes and additions in this repository (since the uploaded v1.3 build)

Cross-checking the app against `mpef-agent-spec.md` and `mpef-meeting-scorecard.xlsx` (§3 of both) surfaced a handful of gaps, closed without changing any scoring formula, weight, or band:

- **D7 Follow-Through** (spec §3: prior-action closure, topic recurrence) is now scored from an optional "Advanced evidence" card — weight 0, deliberately excluded from the per-dimension average and the MPI, verified against the workbook's own D7 numbers.
- **Flag evidence citations** (spec §1/§5: "citing a timestamp or line reference for every figure and flag") — the `agenda_items` schema gained an `evidence` field, and unresolved-item / missing-owner / decision-not-made flags now cite it.
- **Anonymize toggle** — see §10 above.
- **Manual dead time / off-agenda / interruption-rate inputs** — these three metrics are honesty-gated (§4 above) and the local route could never populate them; a user who has the real numbers from an audio pipeline can now enter them directly, same override precedence as scheduled minutes and invitee count (extraction JSON wins if it already has the field, the manual input is the fallback).
- **File import** for all five artifacts and the step-2 JSON box, plus **download extraction JSON** and **download report (.html)** — the downloaded report is a self-contained snapshot (embeds the page's own stylesheet) that renders identically opened standalone, with no dependency on the app itself.
- **Two Route-B correctness bugs**, found by scoring pasted JSON against a leftover browser tab: `compute()` was reading the attendance textarea's raw text as a fallback signal, letting attendance/active-contributor metrics score off speaker-only evidence in violation of the attendance-grounding gate; and the "Minutes/Chat/Attendance not provided" flags read the intake textareas instead of the JSON actually being scored, so they could contradict data the JSON supplied. Both now derive strictly from the extraction payload.
- **Honesty-note prioritization** — the local engine can fire more disclosures than the spec's 6-note budget allows; they are now dropped by priority (a meeting-specific honesty-gate finding always survives ahead of generic boilerplate) instead of arbitrary push order.
- **A regression suite** (`test/run.js`, no dependencies) pinned two golden fixtures at the time — the app's own Sample meeting (MPI 75.13, since moved to 70.92 by §13 below) and the workbook's example meeting (MPI 77.167458, all 27 metrics matched to the workbook's cached formula results to 1e-6) — plus the six evidence-honesty gates, seven transcript formats, and the fixes above.

Two items were investigated and deliberately **not** changed: the workbook's Gini coefficient uses a rank-based tie-handling approximation that can overstate speaking balance by 15–17 points when talk times tie (the app computes it exactly); and the sequence-adherence / pace-deviation metrics are position-match and average-WPM proxies in both the app and the workbook, standing in for the framework's LCS and per-minute in-band-share measures respectively (`meeting-performance-evaluation-framework.md` was not available to confirm whether either implementation already matches it). Both are documented in the app's own method footer.

## 13. Engine v1.4 changes (multi-presenter, honesty gates, decisions, questions, off-agenda)

A second pass, driven by real usage, closed five more gaps — again without touching any weight or band:

- **Multi-presenter agenda items.** `lxParseAgenda()` used to keep a single owner string; `"Sara & Amir"` was stored verbatim and then failed the speaker-match entirely, silently dropping both presenters. Owner segments are now split into an `owners` array (`&`, `,`, `and`), each name validated individually, so **every** matched speaker is credited — each against the item's full planned minutes, with a disclosure note whenever an item has 2+ presenters (splitting evenly instead is a one-line change if you'd rather divide the planned time). `owners` is now part of the extraction schema and shown as a Presenter column in the Agenda coverage map.
- **Zero-count honesty gate.** `feedback_instances` used to always be a number — `0` when the detector found nothing — which scored a hard 0/100 on band `[0,8]` and could drag D5 down at weight 10 on no real evidence. It's now `null` when nothing is detected, dropping the metric out of D5 with a disclosure note, the same pattern already used for question-resolution. The same fix applies to agenda items the keyword matcher couldn't locate: they now count as **not covered** for Coverage rate (a real finding) but their own time adherence is Not Assessable rather than a false 0.
- **Decisions: full text + speaker.** The 80-character clip on decision text is gone — decisions render as complete sentences, wrapping in the Decisions card — and each now carries the speaker who stated it (`outcomes.decisions[].speaker`), shown as a bold prefix, matching how actions already show their owner. Decision speakers are never anonymized, consistent with action owners.
- **Questions named in Flags.** Unanswered and deferred questions used to render as a bare count ("3 questions left unanswered"). A new `interaction.questions[]` array (text, asker, status, responder, evidence) lets the flags panel list each one individually with its evidence citation. Answered questions remain a count. This also fixed an honesty-gate bug: on transcripts with no speaker labels, `questions_answered`/`questions_deferred` are correctly `null`, but the unanswered-count flag coerced that to 0 and flagged **every** question high-severity — directly contradicting the "not assessable" note fired in the same run. It now correctly reports Not Assessable.
- **Off-agenda by keyword matching.** Local extraction scored this permanently Not Assessable, reasoning that true off-agenda detection needs semantic understanding the keyword engine doesn't have. Per user request it's now scored anyway: each substantive utterance (≥8 words) that matches none of the agenda's keywords counts as off-agenda time, always accompanied by a disclosure note that this is proximity matching, not semantic analysis. A manually-entered value (Advanced evidence card) still takes precedence. This activates a fourth D1 metric that was previously always excluded, which is why the Sample acceptance MPI moved from 75.13 to **70.92**.
- **Two bugs found and fixed along the way**, both in code this pass already touched: two agenda items whose keywords matched the *same* utterance used to produce an empty span and crash on `evi(undefined)` — utterance anchors are now guaranteed unique; and the unanswered-question flag's `||0` coercion (above) that defeated the no-speaker-labels honesty gate.
- The regression suite grew to 127 checks (`test/run.js`) covering every item above, including both incidental-bug regressions.

## 14. Engine v1.5 changes (agenda-anchoring rewrite, honest "not found")

A report that a discussed item showed **skipped** led to an audit that found seven distinct paths to that one wrong label, all traced to the same design flaw: `substantive` was a single boolean carrying three incompatible meanings — *genuinely not discussed*, *couldn't be located*, and *located but the span looked thin* — and all three rendered as the identical grey dot. Because `substantive` also drove the Coverage rate score, the unresolved-items ratio, and the high-severity "Unresolved" flag, every false skip quietly deflated D1 and the MPI too.

- **Anchoring rewritten as scored best-overlap, not first-hit.** The old anchor for each agenda item was whichever utterance happened to contain the *first* raw substring match of a keyword, in agenda order. That made a passing early mention ("we'll come back to the budget later") steal the anchor from the item's real 12-minute discussion later on, and made two items competing for the same utterance orphan whichever lost. Anchoring is now a global assignment: every item is scored against every utterance by shared *stemmed* keywords (light suffix stripping, so *forecast/forecasting/forecasts* unify), candidates are sorted by score, and assignment proceeds best-score-first with each utterance claimed once. A title like "Q3 review" that used to yield zero usable keywords (both words are stopwords under the old ≥3-char/non-stopword filter) now falls back to raw tokens so it can still match.
- **`substantive` redefined by span word count.** Turn-count (`span.length >= 2`) and a 1-minute clock floor used to gate this, both of which fail for reasons that have nothing to do with whether real discussion happened: a topic covered thoroughly in one long turn, two anchors landing in the same displayed minute under minute-granularity timestamps, or a no-timestamp transcript where the same floor becomes an undisclosed ~140-word requirement via the word-count time estimate. The gate is now purely spoken-word count in the matched span (with a recorded decision or action always counting as substantive in its own right, regardless of length) — the same test with or without timestamps, immune to where a neighboring item happens to anchor.
- **"Not found" is now a distinct, honest status.** An item the matcher genuinely cannot locate anywhere in the transcript still counts against Coverage rate (excluding it would let a truly-skipped item hide the same way), but no longer renders as **skipped** — it renders as **not found**, in its own color, with a flag naming every such item so a paraphrase mismatch (different wording than the agenda) is visible and correctable in the editable step-2 JSON, rather than silently misreported as a factual finding about the meeting.
- **Zero-minute last-item guard.** The final agenda item's actual-minutes used to be computed against the meeting's end timestamp, which can legitimately compute to 0 under minute-granularity stamps even though real content was spoken; it now falls back to the same word-count time estimate used on the no-timestamp path when that happens.
- The regression suite grew to 141 checks (`test/run.js`), including one test per failure mode identified in the audit and a canary confirming a genuinely-skipped item (the Sample's "AOB", explicitly deferred in the transcript) still reads as skipped after the rewrite.

---
*Provided for internal reuse and redistribution by your organization. Keep this guide and the checklist alongside the app file so every recipient can self-serve.*
