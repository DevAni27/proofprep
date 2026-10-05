# ProofPrep demo kit (target: 2:30 to 3:00 video, real models)

## Before you hit record (10 minutes)
1. `ollama serve` is running, both models pulled. Run `node server\index.mjs`, open http://127.0.0.1:3001.
2. Use the sample resume and job post below (fictional, so no personal details on screen), or your own with contact lines blanked.
3. **Do one full dry run first and keep the application.** Analysis takes a few minutes on a laptop. In the video, start the analysis, show the progress screen for about 5 seconds, then cut to the finished application (or speed it up 8x). Say "sped up" in the voiceover.
4. Window ~1280x800, browser zoom 100%, close other tabs, turn on Do Not Disturb. Record with Win+G (Xbox Game Bar), OBS, or Clipchamp screen recorder.
5. Start in light mode, flip to dark at the end.

## Shot list
| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Start page, then click **Get started** | "This is ProofPrep, a resume coach I built for my friend Pranshu. One rule: no claim without a quote." |
| 0:15 | Paste resume and job post, press **Find my evidence** | "Everything runs on this laptop with open models through Ollama." (only say this if true when you record) |
| 0:30 | Progress screen (cut or sped up) | "Qwen reads the job post and searches the resume for each requirement." |
| 0:45 | Review: open a card with a highlighted quote, press **Yes, this proves it** | "Each requirement shows the exact resume line behind it. Nothing counts until he approves it." |
| 1:05 | A "No evidence found" card, press **I do have this**, type one sentence, **Save this fact** | "No line doesn't mean no skill. He can add what the resume leaves out, in his own words." |
| 1:30 | Press **Not really** on a weak match | "And he can reject a match the model got wrong." |
| 1:45 | **Improve resume**, **Suggest edits**, tick one rewrite and the new bullet, point at the green/red diff and a "Check this detail" flag | "Rewrites use only approved facts. Anything new, like a number or a tool, is flagged." |
| 2:05 | **Save these edits**, show the version, press **Export PDF** | "New bullets land where they belong, and the PDF is clean." |
| 2:20 | **Practice**, pick one bullet, show three different questions | "Interview practice, built from approved facts. Pick one bullet and Gemma drills it from three angles." |
| 2:40 | Toggle dark mode, back to start page | "No score, no hiring odds. Just what the resume can prove. Code is on GitHub." |

Tips: keep the mouse slow, pause one second on each highlighted quote, and do not narrate model names more than once. Add a title card or caption at the start: "Qwen3 4B + Gemma 3 4B, running locally via Ollama" (if true).

## Sample resume (fictional, paste as text)

```
JORDAN LEE
Computer Science Student (AI & ML)
Email: jordan.lee@example.com | Location: Austin, TX
SUMMARY
Final-year student building data and machine learning projects, with an interest in backend engineering.
SKILLS
Languages: Python, SQL, JavaScript
Tools: FastAPI, PostgreSQL, Docker, Git
EXPERIENCE
Data Intern, Northwind Analytics (Jun 2025 - Aug 2025)
• Cleaned and normalized messy customer records using Python and pandas
• Built a FastAPI service that served a churn model to the analytics team
• Wrote SQL queries to track weekly dashboard metrics for the sales team
PROJECTS
Campus Events Finder (Jan 2025 - Apr 2025)
• Built a web app with a React front end and a PostgreSQL database for student event listings
• Added email reminders and a simple admin page to manage events
Built using: React, FastAPI, PostgreSQL
EDUCATION
B.S. Computer Science, University of Texas (2022 - 2026)
```

## Sample job post (fictional)

```
Backend Engineering Intern
You will build reliable back-end services and maintain databases that power our product.
You will work with the team to design responsive front-end features.
Requirements: experience with Python and SQL, familiarity with REST APIs, ability to communicate clearly with teammates.
You should be able to commit to five months, starting in January.
```

## After recording
- Upload to YouTube as Unlisted or Public, paste the link in the post's **Demo** section.
- Add the cover image from the `cover` folder when you publish.
