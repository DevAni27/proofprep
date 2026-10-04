# ProofPrep handoff (updated 2026-10-04, after friend-feedback round)

## State
All four slices implemented and verified end to end in a browser against a stand-in model (Playwright), plus 24 mocked unit tests. Real-model behaviour of the full UI flow has NOT been exercised by me; the pipeline's real-model numbers are from eval/run-eval.mjs (see README table).

## Decisions
- Evidence + tailoring: qwen3:4b-instruct-2507-q4_K_M. Interview: gemma3:4b. Measured, not preferred (README "Why two models").
- React + Vite + TS, plain CSS; node:sqlite; print-to-PDF export; Mastra workflow with LibSQL file storage (proofprep-mastra.sqlite).
- Sentry: not added (time). Nothing leaves the machine.

## Run
npm install && npm run build && node server/index.mjs    # http://127.0.0.1:3001
npm test                                                  # 24 mocked tests
node eval/run-eval.mjs --models gemma3:4b,qwen3:4b-instruct-2507-q4_K_M

## Friend-feedback round (done, mocked-model verified only)
- Limits: 12k chars each for resume and JD; JD chunked for extraction; num_ctx 8192; per-requirement resume search (pipeline v6). Real-model effect NOT yet measured: rerun the Full Stack JD and the GoTo eval.
- Quote rule relaxed (2+ words, or a distinctive tool name from a short skills line; partial quotes cut back to the verified fragment).
- practise -> practice everywhere; DB migrates old stage value.
- UI redesign: welcome page, stepper, per-step guide (what's happening / your job / what's next), help drawer with FAQ, next-action bars, animated analysis progress; model/verification disclaimers removed.
- Tailor: no-op rewrites are dropped.

## Known gaps / next
- Real-model smoke test of the UI flow on the laptop (inputs → review → tailor → practice); fix any prompt/parse issues found.
- Tailor runs one model call per approved line, sequentially; 10-line cap.
- Interview "basedOn" relies on the model copying the fact text; if it paraphrases, the card still shows it as given.
- Old hashed bundles in dist/assets from earlier commits can be deleted (npm run build cleans).
- DEV write-up: draft in WRITEUP.md; needs the friend's real feedback and a demo GIF/screenshots from the laptop.
- Recheck challenge rules and partner-category wording before submitting.
