# ProofPrep

Help a friend get shortlisted and interview-ready for one specific job, using only what their resume can actually prove. Everything runs on your own laptop through Ollama; no API keys, no cloud, no cost.

ProofPrep reads a resume and a job description, links each job requirement to a verbatim quote from the resume (or says plainly that it found none), lets the candidate accept, reject or add context to every suggestion, proposes resume edits grounded only in approved facts, exports the approved version as a PDF, and runs adaptive mock interviews built from the same approved facts.

It never produces a score, a match percentage or a hiring probability. A missing resume line is treated as "not shown", never as "can't do it".

## Run it

Requirements: Node 22+, [Ollama](https://ollama.com), ~6 GB of disk for two small models.

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M   # evidence analysis and tailoring
ollama pull gemma3:4b                        # interview practice
npm install
npm run build
node server/index.mjs
```

Open http://127.0.0.1:3001. Data is stored in `proofprep.sqlite` and `proofprep-mastra.sqlite` next to the server; both are git-ignored because they contain resume text.

Configuration (environment variables): `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`), `OLLAMA_MODEL` (evidence model), `INTERVIEW_MODEL` (interview model), `PROOFPREP_DB`, `PROOFPREP_MASTRA_DB`, `PROOFPREP_DIAGNOSTICS_DIR` (opt-in: saves raw model responses locally for debugging).

## How it works

1. **Inputs.** Upload a PDF/DOCX or paste text. Extraction runs locally and the text is shown for correction before any model sees it.
2. **Analyse.** The evidence model extracts requirements as exact quotes from the JD, searches the resume for each requirement in its own call (skills and tools lines count as evidence), then checks each requirement again with only its candidate lines. A positive verdict must include a verbatim quote from the cited line (two words or more, or a distinctive tool name from a skills line; a partly invented quote is cut back to its verified part), and the app verifies the quote exists. A fabricated quote becomes "could not assess", never "supported".
3. **Review.** Each requirement is a card: JD quote, status, cited line with the quote highlighted, what is missing. The candidate accepts, rejects, or writes what the resume leaves out. Personal conditions (availability, etc.) are a plain Yes/No that only the candidate can answer.
4. **Tailor.** One suggested rewrite per approved line and one bullet per note. Any term not present in the inputs (a number, a tool, a name) is flagged and unchecked by default. Approved edits create a new resume version; export is print-to-PDF of exactly that text.
5. **Practice.** The interview model asks three questions built from approved facts (or probes one chosen bullet from several angles), gives feedback on the typed answer, and appends an adaptive follow-up. Sessions are saved.

The four human decision points are a [Mastra](https://mastra.ai) workflow with real `suspend`/`resume`: close the tab, restart the server, and the run picks up where it stopped. The workflow tracker under the step tabs shows its state.

## Why two models

The two models were measured on the same real resume and JD, on the same pipeline, with a private gold file of expected answers (`eval/run-eval.mjs`; inputs and results are git-ignored).

| Model | Graded rows wrong | Fabricated quotes blocked | Coverage | Availability condition |
| --- | ---: | ---: | ---: | --- |
| qwen3:4b-instruct-2507-q4_K_M | 2 of 9 (both borderline partials) | 0 | 100% | routed correctly |
| gemma3:4b | 8 of 11 | 4 | 80% | dropped |

Gemma 3 4B, on this pipeline, treated unrelated technical lines as proof of documentation, collaboration and adaptability, and invented quotes that the app then rejected. That makes it the wrong tool for making claims about someone's resume. It is a good tool for the job it has here: generating interview questions and feedback from facts the candidate has already approved, where its output is a draft the candidate reacts to rather than an assertion about them.

These are single runs on one input pair, not a benchmark. The pipeline was tuned on that pair, so expect somewhat worse behaviour on new inputs and review every suggestion.

## What the tests do and do not show

`npm test` runs 24 tests against mocked model responses. They prove the software's guarantees: schemas that cannot omit a requirement or cite a line that was not offered, quote verification, decision consistency, persistence, the workflow's suspend/resume across a restart. They say nothing about model accuracy. For that, run `node eval/run-eval.mjs --models <a>,<b>` with your own `private-inputs/application.json` and `gold.json`.

## Limits

- Resume up to 12,000 characters and job description up to 12,000 characters. Long job posts are read in chunks of about 3,000 characters so nothing is truncated; analysis of a long post takes a few minutes on a laptop.
- The evidence model can still accept a real quote that only loosely supports a requirement. The review step exists because of this.
- Separate calls to the same model are not independent verification.
- No Sentry/telemetry is included; nothing leaves the machine.

## Project layout

```
server/analysis.mjs    evidence pipeline (evidence-review-v6)
server/tailor.mjs      grounded resume edits + ungrounded-term check
server/interview.mjs   questions, feedback, follow-ups
server/workflow.mjs    Mastra workflow and run storage
server/db.mjs          node:sqlite persistence
server/extract.mjs     PDF (pdf.js) and DOCX (mammoth) text extraction
server/index.mjs       HTTP API and static UI
src/                   React + Vite UI
eval/run-eval.mjs      live same-input model comparison
```
