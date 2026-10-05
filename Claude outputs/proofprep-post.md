*This is a submission for the [Hacktoberfest Weekend Challenge: Build for a Friend](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)*

## What I Built

ProofPrep is a job-application helper with one rule: it may only say what a resume can prove.

I built it for my friend **Pranshu**, who is job hunting across different kinds of roles. His problem was the one most applicants have. The job post lists twenty things, the resume is two pages, and nobody can tell which lines back up which requirements. Most AI resume tools either rewrite everything with confident claims that aren't yours, or hand back a "match score" that explains nothing.

So ProofPrep works like this:

1. **Add details.** Upload a resume (PDF or DOCX) and paste the job post.
2. **Check the evidence.** Every requirement in the job post becomes a card showing the exact resume line behind it, with the quoted words highlighted. If the words aren't on the resume, the card says "no evidence found". It never says "you can't do this", because a missing line only means the resume doesn't mention it. Pranshu can accept a match, reject it, or write what the resume leaves out in his own words.
3. **Improve the resume.** For each line they approved, it suggests a sharper rewrite. Any new number, tool or name that wasn't in the inputs gets flagged "Check this detail" and starts unchecked. New bullets are placed where they belong (or replace a weaker line), not dumped at the bottom. Then export a clean PDF.
4. **Practice the interview.** Questions are built only from facts they approved. Pick a single bullet and you get three different angles on it, like an interviewer digging in. Each typed answer gets feedback and a follow-up.

There is no score, no match percentage and no hiring probability anywhere in the app. That was deliberate.

### What my friend said

I put it in front of Pranshu while building it, and the feedback changed the app:

> "Being in control of every edit to my resume, and getting interview prep built around my specific bullet points, gives me the confidence to stand behind my own work."
>
> Pranshu

His first round of notes, and what I changed:

- **The job post limit was too short** for real postings. I raised it and now read long posts in chunks so nothing gets cut off.
- **A Full Stack posting came back with wrong evidence.** That sent me back into the pipeline (more on that below). Each requirement now gets its own focused search of the resume.
- **They didn't know what to do at each step.** I added a per-step guide ("what's happening / your job / what's next"), a help drawer and a progress stepper.
- **The model and verification disclaimers were noise.** I removed them.
- **It needed to look like something you'd trust.** Hence the redesign, animations and dark mode.
- They also caught a spelling slip ("practise"), now fixed everywhere.

## Demo

[PASTE VIDEO OR GIF LINK. Suggested 60 to 90 second flow: start page → upload resume + paste job post → review one card (highlighted quote) → reject one match → tailor one line and export the PDF → one bullet-drill question.]

## Code

{% embed https://github.com/DevAni27/proofprep %}

To run it you need Node 22+, Ollama and about 6 GB of disk:

```
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull gemma3:4b
npm install && npm run build && node server/index.mjs
```

## How I Built It

**Open models, running through Ollama.** Two small models, each given the job it is actually good at:

- **Qwen3 4B (Instruct 2507, Q4)** extracts requirements, finds evidence in the resume and writes grounded rewrites.
- **Gemma 3 4B** writes the interview questions, feedback and follow-ups.

I didn't start with two models. I started with Gemma for everything and measured. On the same real resume and job post, with the same pipeline and a private gold file of expected answers (`eval/run-eval.mjs`):

| Model | Graded rows wrong | Fabricated quotes blocked | Coverage |
| --- | ---: | ---: | ---: |
| Qwen3 4B Instruct | 2 of 9 (both borderline partials) | 0 | 100% |
| Gemma 3 4B | 8 of 11 | 4 | 80% |

On this task, Gemma treated unrelated technical lines as proof of documentation, collaboration and adaptability, and invented four quotes that my app then rejected. That makes it a poor judge of someone's resume. It is a good fit for interview practice, where its output is a draft the candidate reacts to and not a claim about them. So I designed around that: Gemma does the conversation, Qwen does the evidence.

These are single runs on one input pair, and I tuned the pipeline on that pair. Treat it as a measurement, not a benchmark, and expect new inputs to behave a bit worse. That's why every suggestion goes through human review.

**The guardrails don't depend on the model behaving.**

- Model output is constrained with JSON schemas, so a response can't skip a requirement or cite a line that wasn't offered.
- Every "supported" verdict must include a verbatim quote, and the app checks that the quote really exists in the resume. A fabricated quote becomes "could not assess", never "supported". A partly invented quote is cut back to the part that is real.
- Rewrites can't add facts. Any new number, tool or name is flagged for the candidate to confirm.

**A Mastra workflow for the human decision points.** The four steps where the candidate decides are a [Mastra](https://mastra.ai) workflow with real `suspend` and `resume`. Close the tab, restart the server, and the run picks up where it stopped. The tracker under the step tabs shows the workflow state.

**Everything else.** React 19, Vite and TypeScript for the UI, plain CSS, `node:sqlite` for storage, pdf.js and mammoth for text extraction, and browser print-to-PDF for export.

**What the tests do and don't show.** 26 automated tests run against mocked model responses. They prove the software's guarantees (schemas, quote checks, persistence, resume after restart). They say nothing about model accuracy. That's what the eval script is for.

## Why Does Open Innovation Matter?

**A resume is about as personal as a document gets, and it never leaves the laptop.** Everything runs on the machine: text extraction, both models, the database and the PDF export. The UI uses no external fonts or CDNs. After the one-time model download, ProofPrep works with the Wi-Fi off. For a tool that reads someone's work history, contact details and job search, I wanted "nothing is sent anywhere" to be a fact I can state, and a closed API can't give me that.

**It cost nothing to run, so I could measure.** I ran the evidence pipeline over and over while tuning prompts and quote rules. A paid API would have made me ration those runs. Free local inference let me build a same-input comparison between two models and make a decision from numbers instead of vibes.

**I could swap models per task.** The best result in the project came from not picking one model. I used Gemma where it is strong and Qwen where it isn't, and both are one `ollama pull` away. Environment variables change either one, so someone with a stronger machine can drop in a bigger model without touching code.

**Where open worked better than a closed model:** privacy, cost, repeatable measurement, and per-job model choice.

**Where it didn't:** raw judgment. A 4B model on a laptop is slower and less sharp than a frontier API, and analysing a long job post takes a few minutes. I built the app around that weakness instead of hiding it, with schema-constrained output, quote verification and a human in the loop. The result is slower than a hosted service, but the person whose resume it is stays in control of what gets claimed.

I did not fine-tune anything for this project. The gains came from model choice, constrained output and pipeline design.

## My Agent Session

I built ProofPrep with an AI coding agent and saved part of the session to DEV so you can see how it was done, including the detours.

[PASTE THE AGENT SESSION EMBED OR LINK HERE]

This covers the later stretch of the build (the landing page, dark mode and writing this post). Earlier work is not in the saved slice.

## Prize Categories

- **Best Use of Gemma.** Gemma 3 4B runs the interview practice (questions, feedback, follow-ups, single-bullet drills). I also measured where it is and isn't reliable and designed the architecture around that.
- **Best Use of Mastra.** The four human decision points are a Mastra workflow with real suspend and resume that survives a server restart.