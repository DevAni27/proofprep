# ProofPrep — implementation handoff to Claude Code

## Start here

You are taking over an existing project, not brainstorming a new one. Inspect the actual local files before editing. Continue toward a working application, with a focused correction of the failing analysis backend first. Avoid another cycle of speculative prompt patches, repeated architecture changes, or asking the user to copy individual snippets.

Work directly in the user's project directory when available:

`C:\Users\immor\OneDrive\Documents\proofprep`

This handoff was prepared October 3, 2026, approximately 16:53 IST. The user has limited time and wants fewer iterations, working code, and competitive Hacktoberfest submissions. Be candid about measured results and untested assumptions; never promise a prize or claim tests establish LLM correctness.

## Objective and constraints

Build ProofPrep for Hacktoberfest 2026's first DEV challenge, **Build for a Friend**. The friend needs help getting shortlisted and preparing for interviews. The app must accept different resumes and job descriptions dynamically. A real friend supplies the product story and user feedback; their resume is not hardcoded into the implementation.

The intended experience:

1. Upload a resume or paste resume text, and provide a job description.
2. Inspect/correct extracted text.
3. See job requirements linked to relevant resume evidence and genuine gaps.
4. Answer targeted clarification questions.
5. Review grounded resume edits, approve them, and export a readable PDF.
6. Practise interviews for that exact application, including “Practise this bullet.”
7. Receive adaptive follow-ups and feedback tied to the actual answer.
8. Save applications, approved facts, resume versions and interview sessions.

Hard constraints:

- ₹0 incremental software/API/hosting expenditure; existing hardware, internet and electricity are available.
- Core inference must work locally, without paid API fallbacks.
- Real inference and real user documents in the actual app, not canned results masquerading as functionality.
- Small synthetic fixtures are already used in unit tests only; clearly distinguish these from live-model evaluation.
- No hardcoded candidate-specific classifications or expected answers in application logic.
- Never invent qualifications, metrics, dates, employers, responsibilities or achievements.
- A missing resume statement does not prove the candidate lacks the skill.
- Do not present an ATS score or hiring probability as established fact.
- The user explicitly prioritizes fewer iterations and progress toward a complete app.

## Challenge context and prize priorities

Previously checked official challenge page:
https://dev.to/challenges/hacktoberfest-weekend-2026-10-01

The announced deadline is **October 5, 2026 at 12:29 PM IST / 06:59 UTC**. The page says writing quality has the greatest weight; relevance, creativity, execution and applicable partner use also matter. New projects must be built during the challenge window. AI assistance is permitted. Valid entries receive a completion badge; cash prizes are competitive. Multiple partner categories can be entered, but a submission can win once.

Agreed strategy:

- Gemma: primary target, if its actual application performance supports meaningful use.
- Mastra: primary target through real workflows, approvals and resumption.
- Sentry Agent Tracing: secondary, through a demonstrated debugging/performance improvement.
- Entire: optional only if setup is straightforward and captures genuine work.

Do not force weak sponsor integrations. If another model is required for reliable analysis, discuss the tradeoff honestly; do not retain Gemma as a decorative dependency or claim unearned eligibility. Recheck the official rules before submission.

## User environment and workflow

- Windows, PowerShell, ASUS Zephyrus G15.
- Ryzen 9 6000-series CPU; 16 GB system RAM.
- NVIDIA RTX 3060 Laptop GPU, 6 GB VRAM.
- NVIDIA driver 566.07; nvidia-smi displayed CUDA compatibility 12.7.
- Node v22.17.1; npm 10.9.2.
- Ollama installed and working; `gemma3:4b` downloaded.
- Ollama API: `http://127.0.0.1:11434`.
- Application API: `http://127.0.0.1:3001`.
- Initial short inference: 81.5 output tokens/second, 100% GPU, 4096 context, 2.9 GB shown by `ollama ps`. This is not an end-to-end app benchmark.
- Local Codex and GitHub authentication were blocked, so the user copied code and extracted a supplied ZIP locally. Do not assume the repository is connected to GitHub.
- The user is now switching to Claude Code. If local file/tool access is available, edit and run checks directly rather than continuing manual copy/paste.
- Downloaded unsigned PowerShell scripts are blocked by the user's execution policy. Pasting the script contents worked. Do not change machine-wide policy unnecessarily.
- Port 3001 was previously occupied by an older backend. Stop only an identified ProofPrep process before restarting; do not kill all Node processes.

## Agreed architecture versus implemented state

Planned architecture:

- React + Vite + TypeScript + Tailwind UI.
- Node + TypeScript backend.
- Mastra workflows for explicit stages, clarification/approval pauses and resumption.
- Ollama through a configurable inference adapter, initially Gemma 3 4B.
- Zod validation and structured model output.
- PDF.js PDF extraction; Mammoth raw-text DOCX extraction.
- Local SQLite persistence.
- `@react-pdf/renderer` export.
- Optional Sentry tracing with only allowlisted metadata, never raw resumes or answers.

**Only a plain JavaScript Node analysis prototype exists today.** React, TypeScript migration, Mastra, Zod, document upload/parsing, SQLite, tailoring, PDF export, interview flow and Sentry are NOT implemented. Do not describe this project as complete or as already qualifying for those partner categories.

The implemented prototype deliberately uses Node built-ins and requires no npm dependencies. Preserve working APIs while moving toward the planned app. Avoid rewriting functioning plumbing just for style.

## Current files

The latest supplied archive was `ProofPrep_Backend_Upgrade.zip`, containing:

- `server/index.mjs`
- `server/analysis.mjs`
- `server/analysis.test.mjs`
- `test-request.ps1`
- `README.md`

The user installed this archive and ran its tests. Inspect the actual files to confirm this version and any subsequent local modifications.

Current exports:

- `analysis.mjs`: `makeSources`, `requiresConfirmation`, `validateRequirements`, `resolveReview`, `createAnalyzer`, `analyzeApplication`.
- `index.mjs`: `createServer`; direct execution starts the server on loopback port 3001.

Current endpoints:

- `GET /api/health`: backend/Ollama/model availability and busy state.
- `POST /api/analyze`: JSON `{ "resume": "...", "jobDescription": "..." }`.

Configuration:

- `OLLAMA_BASE_URL`, default `http://127.0.0.1:11434`.
- `OLLAMA_MODEL`, default `gemma3:4b`.
- 4096-token context, temperature 0, serial inference, keep_alive 10 minutes.
- 6000 combined input characters; 32000-byte HTTP body cap. Long-document support is pending. Character count is not an exact token budget.
- Per-model-call timeout 120 seconds; total analysis timeout 300 seconds.
- One active analysis request; concurrent requests get 429.
- Successful analyses without unverified rows cached in memory, keyed by code version/model/resume/JD; five entries maximum. Restart clears cache.
- No automatic paid fallback, public tunnel or disk persistence of inputs.

Current analysis stages (version `evidence-review-v1`):

1. Extract up to 20 requirements with exact JD quotes and skill/personal-condition type.
2. Route personal conditions to explicit confirmation using type plus generic language rules.
3. Number nonblank resume lines as source IDs S1, S2, etc.; retain headings in the full ordered source text.
4. One model call proposes zero to three evidence IDs for every skill requirement.
5. Review proposed evidence in groups of six. The reviewer receives the full numbered resume and selected IDs, not a prior positive judgment.
6. Validate references and decision consistency. Malformed/missing results become unverified, not silently supported or absent.

Response fields include `analysis.requirements`, `warnings`, and `metrics`. Individual rows contain requirement/source quote, status, explanation, evidence IDs/text, reviewState and warnings. All AI results remain pending review.

Status meanings:

- `supported`: model proposes explicit evidence; not an independently verified fact.
- `partially_supported`: model proposes some evidence with a remaining gap.
- `not_evidenced`: no adequate evidence identified, not proof of inability.
- `requires_confirmation`: availability/other personal condition needs a direct answer.
- `unverified`: invalid, inconsistent, omitted or failed assessment.

## Tests that passed — and what they do not establish

All **11 automated tests passed on the user's Windows / Node 22.17.1 machine**. They cover:

- source order/text preservation;
- personal-condition routing;
- rejecting invented JD quotes and exact duplicate requirements;
- evidence references and pending review flags;
- invented/unselected reference rejection;
- contradictory and missing-review handling;
- three-stage orchestration and content-keyed cache isolation;
- failed reviews remaining unverified and uncached;
- missing retrieval rows not becoming absent;
- oversized inputs and cancellation;
- HTTP input validation and UTF-8 handling.

They use explicit synthetic fixtures/mocked model returns. **They do not establish model accuracy, real structured-output compliance, or product readiness.** The latest live test failed despite all tests passing.

## Real test inputs

The user has a PowerShell variable `$proofprepInput` with real resume/JD JSON in the second terminal, unless it has since closed. Do not assume another process can access that variable.

Resume: excerpt from uploaded `Aniket_Dhingra_Resume.pdf`, contact details omitted. Includes:

- VIT Pune B.Tech CS (AI & ML), CGPA 8.9, July 2024–present.
- GESOC Open Source Developer, May–August 2026, Global Pulse / Liquid Galaxy: Flutter app, NASA/USGS/WHO event feeds, SSH and KML, code review and benchmarking.
- GeneRisk: genomic input normalization to GRCh38; Python/FastAPI/Next.js; Evo2 7B scoring of reference/mutant sequences; preliminary evaluation on 47 clinically labeled SNVs.
- EvaloAI: OCR, BERTScore/keyword/grammar grading; evaluation against human-scored IELTS essays; Python and scikit-learn.

These are user-provided resume claims, not independently verified achievements. Keep project associations intact. The exact tested input may contain copy/paste artifacts; use the actual input when evaluating.

Job: a condensed paraphrase of this real GoTo Data Scientist Intern posting, not its full verbatim text:
https://jobs.lever.co/GoToGroup/dff2a165-d111-4542-bfec-ec3856892275

The tested JD asks for Python/data preparation; collecting and validating data; examining/annotating text under guidelines; consistent annotations/data quality; improving labeling instructions; team coordination/discussions; five-month availability; accuracy, communication/documentation, independence/teamwork, adaptability and feedback.

No resume evidence establishes future five-month availability. Normalizing messy inputs is relevant evidence of data preparation. Using labeled datasets does not establish having labeled them. Prediction accuracy/ROC-AUC does not establish dataset cleanliness. Code review/benchmarking does not establish annotation-guideline authorship or documentation work.

## Latest JSON result — October 3, approximately 16:43 IST

Filename supplied by user: `proofprep-last-result.json`. It should also exist in the local project folder from the PowerShell test command. Read it directly if present.

Metrics:

| Metric | Value |
| --- | --- |
| Version | evidence-review-v1 |
| Model | gemma3:4b |
| End-to-end elapsed time | 29,433 ms |
| Model calls | 6 |
| Cache hit | false |
| Extracted requirements | 20; cap reached |
| Unverified assessments | 16 |
| Supported assessments | 3, all problematic |
| Requires confirmation | 1, appropriate |

Step timings and output tokens:

| Step | ms | Output tokens |
| --- | ---: | ---: |
| Extract requirements | 16,930 | 632 |
| Locate evidence | 4,133 | 265 |
| Review batch 1 | 5,832 | 371 |
| Review batch 2 | 453 | 6 |
| Review batch 3 | 436 | 6 |
| Review batch 4 | 1,645 | 80 |

Two batches produced only six output tokens, and their requirements were omitted. This is consistent with empty/minimal JSON responses; raw model responses were NOT saved, so their exact contents are unknown.

Result summary:

| IDs | Requirement/result | Assessment |
| --- | --- | --- |
| R1 | Gather data: unverified | Invalid fields or references; actual underlying raw response unavailable. |
| R2 | Check data validity: supported | Wrong inference: code review/benchmarking cited as explicit data-validity work. |
| R3 | Examine text: supported | Cited S14, only the GeneRisk project title; explanation asserted normalization not contained in that cited passage. Also lost the labeling-task context. |
| R4–R5 | Annotation and consistency: unverified | Invalid fields/references. |
| R6 | Identify data quality issues: supported | Wrong inference: benchmarking does not establish dataset-quality work. |
| R7–R18 | Annotation guidelines, team duties, Python, preparation, accuracy, communication, documentation, independence, collaboration, adaptability, feedback | All unverified: omitted by evidence-check output. |
| R19 | Five-month commitment: requires_confirmation | Correct routing. |
| R20 | Careful work: unverified | Invalid fields/references. |

The extraction split some phrases excessively: “Examine text” lost the purpose and qualifier “using supplied labeling instructions.” Preserve qualifiers when splitting requirements. Cap reached does not mean coverage is complete.

Comparison: the preceding version used 15 calls / 47,625 ms and incorrectly marked every skill requirement supported. The new version made fewer calls but remains unsuitable for trusted automatic tailoring. Faster failure is not a successful quality improvement.

## Known implementation gap to fix first

The current selection/review schemas allow variable-length arrays, including empty arrays, and arbitrary string IDs. Runtime validation detects omissions but generation is not constrained to cover every expected requirement.

A proposed repair, **NOT YET IMPLEMENTED**, is to build a schema per batch with an object property for every expected requirement ID and mark each property required. Constrain evidence IDs to the available IDs (or the selected evidence IDs for each review). Retain application-side validation. Do not force a positive verdict or invent evidence merely to fill required fields: absence/unverified must remain valid outcomes.

This structural repair will address allowed omissions/invalid identifiers, not automatically fix semantic reasoning. Add regression tests for batches whose IDs begin at R7 rather than R1, complete batch coverage and exact allowed citation sets. The existing tests do not test these generation-schema guarantees.

Other issues:

- Broad soft-skill claims are inferred from unrelated technical accomplishments.
- The reviewer can borrow surrounding details but cite a title-only line.
- Separate calls to the same model are not independent factual verification.
- Full source context is supplied, but passages are not actually parsed into typed project records.
- Raw diagnostic model responses are unavailable; add opt-in local diagnostics if needed, excluded from Git and telemetry.
- Do not fix this with regexes for Aniket, GeneRisk, GoTo or the expected answer to this one test.

## Model comparison — proposed, not run

The user was told that if this version continued failing, we would stop repeated prompt tweaking and benchmark a different model using unchanged real inputs.

An alternative tag was checked on Ollama's official catalog:

`qwen3:4b-instruct-2507-q4_K_M`

https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M

The catalog lists a 2.5 GB quantized download and Apache 2.0 license. It has NOT been downloaded or evaluated on the user's laptop. Memory/latency and superiority are unproven. The current backend already accepts OLLAMA_MODEL, so no architecture rewrite is needed to compare it.

First fix the batch-schema issue, then compare both models on that SAME code and SAME inputs. Download only the selected small challenger; unload one model before loading the other if needed on 6 GB VRAM. Never silently pay for inference. Gemma's sponsor relevance should not override quality.

## Immediate execution instructions

1. Inspect the folder, existing instructions, current code, Ollama availability and latest JSON. Preserve local work. Do not assume GitHub access.
2. Summarize the concrete problem briefly: structurally incomplete output plus false positive evidence judgments. Avoid reopening the entire product plan.
3. Correct batch schemas and citation constraints, with focused tests for the observed failure modes. Preserve error visibility and eligibility confirmation.
4. Use actual local inference to evaluate. Where possible, automate the same-input comparison rather than asking the user to manually relay repeated JSON outputs. If real inputs are missing, ask only for the two local text files or request export of the existing PowerShell variable.
5. Report requirement coverage, invalid references, incorrect supported claims, missed genuine evidence, latency and GPU usage. Do not call mock unit tests a model benchmark or trust model self-grading alone.
6. Choose the working model/configuration based on evidence. If neither meets the bar, say so and choose a feasible fallback within ₹0; do not continue limitless prompt iteration.
7. Build the UI and complete product in vertical slices: text/upload preview and review → clarification and approved tailoring → PDF export → adaptive interview.
8. Integrate Mastra meaningfully for the workflow and persisted approval/resumption. Add Sentry only after actual functionality, with private content excluded.
9. Create/update AGENTS.md, PROJECT_BRIEF.md and TASKS.md if appropriate; keep a HANDOFF.md recording commands, implemented scope, known failures and next task. Do not claim those files already exist.
10. Reserve time for genuine friend feedback, a clear demo and the DEV write-up. No fabricated feedback, performance figures or award claims.

## Commands and input export

From the project folder:

```powershell
node --test .\server\analysis.test.mjs
node .\server\index.mjs
```

Run a server only if port 3001 is free or after stopping the identified old ProofPrep server. Keep Ollama bound locally; no public tunnel is required.

If the real input exists only in the user's original PowerShell terminal, the user can export it there:

```powershell
New-Item -ItemType Directory -Force .\private-inputs | Out-Null
$proofprepInput | Set-Content -Encoding UTF8 .\private-inputs\application.json
```

Verify `$proofprepInput` is nonempty before doing so. This file contains private resume text. Exclude `private-inputs/`, `.env`, `proofprep-last-result.json`, local diagnostic outputs and SQLite databases from Git. Do not commit or upload them automatically.

Keep the final implementation reusable across people and roles. The regression case helps expose mistakes; it must not become the product's hardcoded answer key.
