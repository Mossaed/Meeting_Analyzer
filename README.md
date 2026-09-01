# Meeting_Analyzer — MPEF Analyzer

Implements the **Meeting Performance Evaluation Framework (MPEF) v1.0** as a
single-file, offline, zero-dependency web app: paste meeting artifacts, get
a deterministic 0–100 Meeting Productivity Index with six weighted
dimension scores, evidence-cited flags, and full audit trail.

## Files

| File | What it is |
|---|---|
| `mpef-analyzer-offline.html` | **The app.** Engine v2.5. Open it in any browser — no build, no install, no network. |
| `README.txt` | Quick-start card shipped alongside the app in distribution zips. |
| `docs/mpef-agent-spec.md` | **Normative behavior contract** — system prompt, canonical extraction schema, scoring formulas, evidence-honesty gates, report template. The app implements this spec's "Mode 3: deterministic extractor". |
| `docs/mpef-analyzer-reuse-guide.md` | Deployment, customization, and verification guide for redeployers. |
| `docs/mpef-meeting-scorecard.xlsx` | The same scoring spec (`docs/mpef-agent-spec.md` §3) in an auto-calculating Excel workbook, with one worked example meeting. Independently verified to reproduce the app's scores metric-for-metric. |
| `test/` | Node-based regression harness — runs the app's scoring engine headlessly against two golden fixtures (the app's own sample meeting and the workbook's example meeting) plus the evidence-honesty gates. |

## Authority chain

```
meeting-performance-evaluation-framework.md   (framework source of truth — not yet in this repo)
                    │
                    ▼
        docs/mpef-agent-spec.md   (§3 scoring config: weights, bands, MPI formula)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
mpef-analyzer-offline.html   docs/mpef-meeting-scorecard.xlsx
   (CONFIG object)              (Config sheet)
```

All three keep identical weights, normalization bands, and MPI band
thresholds. **Calibrate once, then freeze** — comparability across
meetings depends on it. If you ever change one, change all three (see
spec §3 and reuse guide §6).

## Quick start

Open `mpef-analyzer-offline.html` in a browser, press **Sample**, then
**Extract & score locally**. On an unmodified build this deterministically
renders **MPI 70.92 · Productive**. See `README.txt` for end-user
instructions and `docs/mpef-analyzer-reuse-guide.md` for deployment,
configuration, and troubleshooting.

## Running the tests

```
node test/run.js
```

No dependencies required — the harness loads the app's own `<script>`
block into a minimal DOM stub and checks its output against values
independently computed in the Excel workbook.
