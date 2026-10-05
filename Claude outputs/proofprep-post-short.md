TITLE: Every AI resume tool lies a little. I built one for my friend that can't.

TAGS: #devchallenge #weekendchallenge #hf26challenge

---

*This is a submission for the [Hacktoberfest Weekend Challenge: Build for a Friend](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)*

## What I Built

My friend Pranshu is job hunting. Like everyone, he's staring at a job post with twenty requirements and a two-page resume, wondering which line actually proves what. The AI tools he could use either rewrite everything with confident claims that aren't his, or hand back a "92% match" that explains nothing.

So I built **ProofPrep**, a resume coach with one rule: **no claim without a quote.**

1. **Add details.** Upload a resume, paste the job post.
2. **Check the evidence.** Each requirement becomes a card with the exact resume line behind it, highlighted. No line? The card says "no evidence found" (not "you can't do this", because a missing line is not a missing skill). He accepts, rejects, or adds context in his own words.
3. **Improve the resume.** Rewrites use only facts he approved, new numbers or tools get flagged "Check this detail", and new bullets go where they fit, not into the Volunteering section. Export a clean PDF.
4. **Practice the interview.** Questions come only from approved facts. Pick one bullet and get grilled on it from three angles, like an interviewer who actually read your resume.

No score. No hiring odds. Nobody gets a number to be scared of.

**What Pranshu said:**

> "Being in control of every edit to my resume, and getting interview prep built around my specific bullet points, gives me the confidence to stand behind my own work."

His feedback also reshaped the app: longer job posts, a Full Stack posting that exposed a bad evidence match (now fixed with per-requirement search), step-by-step guidance, and a spelling slip I'd rather not discuss ("practise").

## Demo

[PASTE YOUTUBE LINK]

## Code

{% embed https://github.com/DevAni27/proofprep %}

## How I Built It

Two small open models through **Ollama**, each doing the job it's actually good at:

- **Qwen3 4B** finds evidence and writes grounded rewrites.
- **Gemma 3 4B** writes interview questions, feedback and follow-ups.

I didn't plan two models. I started with Gemma for everything, then measured both on the same real resume and job post:

| Model | Graded rows wrong | Invented quotes caught | Coverage |
| --- | ---: | ---: | ---: |
| Qwen3 4B | 2 of 9 | 0 | 100% |
| Gemma 3 4B | 8 of 11 | 4 | 80% |

Gemma happily treated unrelated tech lines as proof of "collaboration" and made up four quotes. My app rejected all four. So Gemma got the job where a draft is fine (interview practice), and Qwen got the job where accuracy matters. *(One resume, one run, pipeline tuned on it. A measurement, not a benchmark.)*

The guardrails don't rely on the model behaving:

- **JSON schemas** stop the model skipping a requirement or citing a line it wasn't shown.
- **Every "supported" verdict needs a verbatim quote, and the app checks it exists.** A fake quote becomes "could not assess". A half-fake one is cut back to the real part.
- **Rewrites can't add facts** without a flag.
- **A [Mastra](https://mastra.ai) workflow** runs the four human decision points with real `suspend`/`resume`. Close the tab, restart the server, and it picks up where it stopped.

Plus React + Vite + TypeScript, `node:sqlite`, pdf.js, and browser print-to-PDF. 26 mocked tests cover the software's guarantees; they say nothing about model accuracy, which is what the eval script is for.

## Why Does Open Innovation Matter?

- **A resume is personal, and it never leaves the laptop.** Extraction, both models, storage and export all run locally, no external fonts or CDNs. After the one-time model download, it works with the Wi-Fi off. A closed API can't give me "nothing is sent anywhere".
- **Free inference meant I could measure.** I re-ran the pipeline over and over and compared two models on identical input. A metered API would have made me ration that.
- **I could swap models per task.** The best result came from *not* picking one model. Both are one `ollama pull` away, and env variables swap either.
- **Where closed would win:** raw judgment. A 4B model on a laptop is slower and less sharp than a frontier API, and a long job post takes a few minutes. So I built around it with schemas, quote checks and a human in the loop. (No fine-tuning here. The gains came from model choice and pipeline design.)

## My Agent Session

[PASTE AGENT SESSION EMBED OR LINK]

## Prize Categories

- **Best Use of Gemma:** Gemma 3 4B runs interview practice, and I measured where it is and isn't reliable and designed around it.
- **Best Use of Mastra:** the human decision points are a Mastra workflow with suspend/resume that survives a restart.
