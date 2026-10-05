# ProofPrep

**No claim without a quote.** ProofPrep is a resume coach built for a friend ([Hacktoberfest Weekend Challenge: Build for a Friend](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)). It links every requirement in a job post to the exact words on a resume, lets the candidate approve, reject or add context to each match, suggests edits grounded only in approved facts, exports a clean PDF, and runs mock interviews built from the same facts.

Everything runs on your own laptop through [Ollama](https://ollama.com). No API keys, no cloud, no cost.

It never produces a score, a match percentage or a hiring probability. A missing resume line is treated as "not shown", never as "can't do it".

- Demo video: https://youtu.be/fbDUUNaE0i0
- Write-up on DEV: https://dev.to/aniket_dhingra_2706/finally-an-ai-that-wont-oversell-my-friends-resume-it-shows-the-proof-instead-374g

## What it does

1. **Add details.** Upload a PDF or DOCX, or paste text, plus the job post.
2. **Check the evidence.** Each requirement is a card: the job quote, the resume line behind it with the matching words highlighted, and what is missing. The candidate presses "Yes, this proves it", "Not really", or "Add context" and writes what the resume leaves out.
3. **Improve the resume.** One suggested rewrite per approved line and one new bullet per added fact. Any number, tool or name that was not in the inputs is flagged "Check this detail" and unchecked by default. The model decides where a new bullet belongs (or which weaker line it replaces). Approved edits create a new resume version, and export is print-to-PDF of exactly that text.
4. **Practice the interview.** Three questions built from approved facts, feedback on each typed answer, and an adaptive follow-up. Or pick one bullet and be drilled on it from three different angles. Sessions are saved.

The app also has a start page, a light/dark theme toggle (top left), per-step guidance, and a help drawer.

## Run it

Requirements: Node 22+, Ollama, about 6 GB of disk for two small models.

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M   # evidence analysis and tailoring
ollama pull gemma3:4b                        # interview practice
npm install
npm run build
node server/index.mjs
```

Open http://127.0.0.1:3001. Data is stored in `proofprep.sqlite` and `proofprep-mastra.sqlite` next to the server. Both are git-ignored because they contain resume text. After the one-time model download, nothing needs the internet.

Configuration (environment variables): `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`), `OLLAMA_MODEL` (evidence model), `INTERVIEW_MODEL` (interview model), `PROOFPREP_DB`, `PROOFPREP_MASTRA_DB`, `PROOFPREP_DIAGNOSTICS_DIR` (opt-in: saves raw model responses locally for debugging).

## How it works

1. **Inputs.** Text extraction runs locally (pdf.js for PDF, mammoth for DOCX, with wrapped lines rejoined) and the text is shown for correction before any model sees it.
2. **Analyse.** The evidence model extracts requirements as exact quotes from the job post (long posts are read in chunks), searches the resume for each requirement in its own call (skills and tools lines count as evidence), then reviews each requirement again with only its candidate lines. A positive verdict must include a verbatim quote from the cited line, and the app verifies the quote exists. A partly invented quote is cut back to its verified part. A fabricated quote becomes "could not assess", never "supported".
3. **Review.** The candidate accepts, rejects, or writes what the resume leaves out. Personal conditions (availability and similar) are a plain Yes/No that only the candidate can answer.
4. **Tailor.** Rewrites are checked for terms that were not in the inputs, and rewrites that change nothing are dropped. New bullets are placed by the model (insert after a chosen bullet, or replace a weaker one), with a rule-based fallback if its choice is unusable.
5. **Practice.** The interview model asks questions from approved facts. In single-bullet mode, three separate calls each see only that bullet and the earlier questions, so the angles stay different.

The four human decision points are a [Mastra](https://mastra.ai) workflow with real `suspend` and `resume`: close the tab, restart the server, and the run picks up where it stopped.

## Why two models

The two models were measured on the same real resume and job post, on the same pipeline, with a private gold file of expected answers (`eval/run-eval.mjs`; inputs and results are git-ignored).

| Model | Graded rows wrong | Fabricated quotes blocked | Coverage | Availability condition |
| --- | ---: | ---: | ---: | --- |
| qwen3:4b-instruct-2507-q4_K_M | 2 of 9 (both borderline partials) | 0 | 100% | routed correctly |
| gemma3:4b | 8 of 11 | 4 | 80% | dropped |

Gemma 3 4B, on this pipeline, treated unrelated technical lines as proof of documentation, collaboration and adaptability, and invented quotes that the app then rejected. That makes it the wrong tool for making claims about someone's resume. It is a good tool for the job it has here: generating interview questions and feedback from facts the candidate has already approved, where its output is a draft the candidate reacts to rather than an assertion about them.

These are single runs on one input pair, not a benchmark. The pipeline was tuned on that pair, so expect somewhat worse behaviour on new inputs and review every suggestion.

## What the tests do and do not show

`npm test` runs 26 tests against mocked model responses. They prove the software's guarantees: schemas that cannot omit a requirement or cite a line that was not offered, quote verification, decision consistency, grounded-edit checks, new-bullet placement, wrapped-line extraction, persistence, and the workflow's suspend/resume across a restart. They say nothing about model accuracy. For that, run `node eval/run-eval.mjs --models <a>,<b>` with your own `private-inputs/application.json` and `gold.json`.

## Limits

- Resume up to 12,000 characters and job post up to 12,000 characters. Long job posts are read in chunks of about 3,000 characters so nothing is truncated; analysis of a long post takes a few minutes on a laptop.
- The evidence model can still accept a real quote that only loosely supports a requirement. The review step exists because of this.
- Separate calls to the same model are not independent verification.
- Tailoring runs one model call per approved line, with a cap of 10 lines.
- No telemetry is included.

## Project layout

```
server/analysis.mjs    evidence pipeline (evidence-review-v6)
server/tailor.mjs      grounded edits, new-bullet placement, ungrounded-term check
server/interview.mjs   questions, feedback, follow-ups, single-bullet drills
server/workflow.mjs    Mastra workflow and run storage
server/db.mjs          node:sqlite persistence
server/extract.mjs     PDF (pdf.js) and DOCX (mammoth) text extraction
server/index.mjs       HTTP API and static UI
src/App.tsx            routing, theme toggle, status
src/screens/           Landing, Applications, Inputs, Review, Tailor, Practice
src/lib/resumeHtml.ts  print-ready resume layout for PDF export
src/styles.css         design tokens, light and dark themes
eval/run-eval.mjs      live same-input model comparison
```
