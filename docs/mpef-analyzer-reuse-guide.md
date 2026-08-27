# MPEF Analyzer — Reuse & Redeployment Guide

**Applies to:** engine v1.3 · offline edition (`mpef-analyzer-offline.html`) and connected edition (`mpef-analyzer.html`)
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

## 4. Honest-measurement rules built into v1.3

These exist so scores are never artifacts of note-taking; they are the answer to "why is this metric n/a?":

1. **Condensed-transcript detection.** If transcribed words cover under 50% of the floor time, pace, filler density, monologue ratio, and turn density are Not Assessable (a summary can't reveal them).
2. **Timestamp resolution.** Response latency requires second-level timestamps (`HH:MM:SS`); minute-level stamps mark it n/a.
3. **Attendance grounding.** Attendance rate, retention, and active-contributor ratio require attendance data (log pasted, or `minutes_present` in pasted JSON) — silent attendees are invisible in a transcript, so speaker-only data would fake these.
4. **Audio-only signals.** Dead time / silence and interruption overlaps are never scored from text.
5. **Semantic limits.** Off-agenda ratio is n/a under local rules (needs semantic topic mapping — Route B/C provide it).
6. **Sample-size transparency.** Ratio metrics display their counts (e.g. `100% · 1/1`); tiny denominators can legitimately score 0 or 100 and are visibly thin.
7. **Not-a-name guard.** Lines like `Decision: …` or `Action: …` are never mistaken for speakers.

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

Open the file and confirm the dark header reads **engine v1.3** — the filename never changes between versions, so this stamp is the only reliable build check. Then press **Sample → Extract & score locally**: on an unmodified v1.3 build this deterministically renders **MPI 75 · Productive**, six scored dimensions, and a flags panel that includes the condensed-transcript disclosure. Full acceptance steps live in the companion checklist.

For the offline edition you can additionally prove network silence: search the file for `fetch(` — the only permitted match is none at all. (A bare search for `http` is not the right test: the file legitimately contains a URL-detection regex, `/^https?/i`, used to keep a pasted link from being mistaken for a speaker name.) Or open it with the browser's network tab recording and confirm zero requests beyond the file itself.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Header doesn't say engine v1.3 | Stale copy (identical filename) | Replace the file; re-share the zip |
| "Couldn't parse any utterances" | Unrecognized transcript layout | Use `[10:04] Name: text` lines, or paste the raw platform export (VTT/SRT/Teams are auto-detected) |
| Many metrics show n/a | Honest-measurement rules (§4) fired | Read the flags panel; supply richer artifacts (verbatim transcript, second-level timestamps, attendance log) or use Route B |
| Scores look extreme (0/100) with counts like 1/1 | Genuine tiny-sample ratios | Judge by the printed counts; more countable events → finer scores |
| "rate-limited" after several Claude runs | API throttling (connected edition) | The app retries automatically; wait ~1 min if it persists |
| "can't reach the Claude API from here" | File running outside Claude / offline | Expected — use Route A or B, or the offline edition |
| Giant prompt won't paste into an AI chat | Chat input limit | Use "Save as .txt" and attach the file to the AI instead |
| Nothing saved between sessions | By design (privacy) | Keep source artifacts; use "Print / save as PDF" to keep reports |

## 9. Version history

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
- **A regression suite** (`test/run.js`, no dependencies) pins two golden fixtures — the app's own Sample meeting (MPI 75.13) and the workbook's example meeting (MPI 77.167458, all 27 metrics matched to the workbook's cached formula results to 1e-6) — plus the six evidence-honesty gates, seven transcript formats, and the fixes above.

Two items were investigated and deliberately **not** changed: the workbook's Gini coefficient uses a rank-based tie-handling approximation that can overstate speaking balance by 15–17 points when talk times tie (the app computes it exactly); and the sequence-adherence / pace-deviation metrics are position-match and average-WPM proxies in both the app and the workbook, standing in for the framework's LCS and per-minute in-band-share measures respectively (`meeting-performance-evaluation-framework.md` was not available to confirm whether either implementation already matches it). Both are documented in the app's own method footer.

---
*Provided for internal reuse and redistribution by your organization. Keep this guide and the checklist alongside the app file so every recipient can self-serve.*
