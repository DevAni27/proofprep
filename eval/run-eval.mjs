// Live-model evaluation harness. Run on a machine where Ollama is running. This measures the REAL model,
// unlike analysis.test.mjs (mocked, structure only).
//
//   node eval/run-eval.mjs --models gemma3:4b,qwen3:4b-instruct-2507-q4_K_M
//   optional: --input private-inputs/application.json  --gold private-inputs/gold.json  --out private-inputs/eval
//
// gold.json (private, you write it; never read by app logic):
//   [{ "match": "substring of requirement text (case-insensitive)", "acceptable": ["not_evidenced","partially_supported"] }]
// Rows with no gold entry are reported as "ungraded". Nothing here uses a model to grade a model.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createAnalyzer } from '../server/analysis.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const models = (arg('models', process.env.OLLAMA_MODEL || 'gemma3:4b')).split(',');
const input = JSON.parse(readFileSync(arg('input', 'private-inputs/application.json'), 'utf8').replace(/^﻿/, ''));
const goldPath = arg('gold', 'private-inputs/gold.json');
const gold = existsSync(goldPath) ? JSON.parse(readFileSync(goldPath, 'utf8').replace(/^﻿/, '')) : [];
const out = arg('out', 'private-inputs/eval');
mkdirSync(out, { recursive: true });
process.env.PROOFPREP_DIAGNOSTICS_DIR = out;

const ps = async () => { try { return (await (await fetch(`${base}/api/ps`)).json()).models ?? []; } catch { return []; } };
const unload = (model) => fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => {});

const summaries = [];
for (const model of models) {
  for (const m of await ps()) await unload(m.name);          // one model resident at a time (6 GB VRAM)
  console.log(`\n=== ${model} ===`);
  const tags = await (await fetch(`${base}/api/tags`)).json().catch(() => ({ models: [] }));
  if (!tags.models?.some(m => m.name === model || m.name === `${model}:latest`)) { console.log(`Not pulled. Run: ollama pull ${model}`); summaries.push({ model, error: 'not pulled' }); continue; }
  // Warm-up so timings exclude one-off model loading.
  await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model, prompt: 'ok', stream: false, options: { num_predict: 1, num_ctx: 4096 }, keep_alive: '10m' }) }).catch(() => {});
  let result, error;
  try { result = await createAnalyzer({ model, log: () => {} })(input.resume, input.jobDescription); }
  catch (e) { error = e.message; }
  const loaded = (await ps()).find(m => m.name === model);
  const gpuPct = loaded?.size ? Math.round(100 * (loaded.size_vram ?? 0) / loaded.size) : null;
  if (!result) { console.log('Analysis failed:', error); summaries.push({ model, error }); continue; }
  const rows = result.analysis.requirements;
  const count = (s) => rows.filter(r => r.status === s).length;
  const graded = rows.map(r => { const g = gold.find(x => r.requirement.toLowerCase().includes(x.match.toLowerCase())); return { r, g }; });
  const withGold = graded.filter(x => x.g);
  const wrong = withGold.filter(x => !x.g.acceptable.includes(x.r.status));
  const falseSupported = wrong.filter(x => x.r.status === 'supported' || x.r.status === 'partially_supported');
  const missedEvidence = wrong.filter(x => x.r.status === 'not_evidenced');
  const s = {
    model, elapsedMs: result.metrics.elapsedMs, modelCalls: result.metrics.modelCalls, gpuResidentPct: gpuPct,
    requirements: rows.length, coveragePct: Math.round(100 * (rows.length - count('unverified')) / rows.length),
    unverified: count('unverified'), supported: count('supported'), partial: count('partially_supported'), notEvidenced: count('not_evidenced'), requiresConfirmation: count('requires_confirmation'),
    graded: withGold.length, ungraded: rows.length - withGold.length, gradedWrong: wrong.length,
    falseSupportedOrPartial: falseSupported.map(x => x.r.id), missedOrAbsent: missedEvidence.map(x => x.r.id),
    unverifiedReasons: [...new Set(rows.filter(r => r.status === 'unverified').flatMap(r => r.reviewWarnings))],
    stepTimings: result.metrics.calls,
    rows: rows.map(r => ({ id: r.id, status: r.status, requirement: r.requirement, evidence: r.evidenceIds.join(','), note: r.status === 'unverified' ? r.reviewWarnings[0] : r.explanation.slice(0, 140), graded: graded.find(x => x.r === r)?.g ? (graded.find(x => x.r === r).g.acceptable.includes(r.status) ? 'OK' : 'WRONG') : '' })),
  };
  summaries.push(s);
  console.log(JSON.stringify({ ...s, stepTimings: undefined, rows: undefined }, null, 2));
  for (const x of s.rows) console.log(`${x.id} [${x.status}] ${x.graded} ${x.requirement} -> ${x.evidence} | ${x.note}`);
  writeFileSync(`${out}/${model.replace(/[^\w.-]/g, '_')}.result.json`, JSON.stringify(result, null, 2));
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summaries, null, 2));
console.log('\n=== COMPARISON (paste this) ===');
console.table(summaries.map(x => x.error ? { model: x.model, error: x.error } : { model: x.model, sec: Math.round(x.elapsedMs / 1000), calls: x.modelCalls, gpu: x.gpuResidentPct, reqs: x.requirements, covered: x.coveragePct + '%', unverified: x.unverified, supp: x.supported, part: x.partial, none: x.notEvidenced, confirm: x.requiresConfirmation, graded: x.graded, wrong: x.gradedWrong, falsePos: x.falseSupportedOrPartial.join(' ') }));
console.log(`\nWrote ${out}/ (contains resume text; keep out of Git). Raw model output: ${out}/raw-model-responses.jsonl`);
