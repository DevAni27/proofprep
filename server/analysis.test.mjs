import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer, makeSources, requiresConfirmation, resolveReview, validateRequirements, selectionSchemaFor, reviewSchemaFor } from './analysis.mjs';
import { createServer } from './index.mjs';

// These are synthetic software-test fixtures, not product demos or live-model evaluations.
const requirement = { id: 'R1', requirement: 'Prepare data', kind: 'skill' };
const sources = makeSources('PROJECT\nNormalized input records.');
const direct = { quote: 'Normalized input records', evidenceId: 'S2', missing: '', decision: 'direct' };

test('sources preserve original text and order', () => {
  assert.deepEqual(sources, [{ id: 'S1', text: 'PROJECT' }, { id: 'S2', text: 'Normalized input records.' }]);
});
test('personal conditions route to confirmation', () => {
  assert.equal(requiresConfirmation({ kind: 'skill', requirement: 'Commit to a six-month internship.' }), true);
  assert.equal(requiresConfirmation({ kind: 'skill', requirement: 'Use Python.' }), false);
});
test('drops invented JD quotes with a warning, removes duplicates, fails only if nothing survives', () => {
  const r = { requirement: 'Use Python.', jobQuote: 'Use Python.', kind: 'skill' };
  const fake = { requirement: 'Use SQL.', jobQuote: 'Use SQL daily.', kind: 'skill' };
  assert.equal(validateRequirements({ requirements: [r, r] }, 'Use Python.').length, 1);
  const warnings = [];
  const kept = validateRequirements({ requirements: [fake, r] }, 'Use Python.', warnings);
  assert.deepEqual(kept.map(x => x.id), ['R1']);
  assert.equal(warnings.length, 1);
  assert.throws(() => validateRequirements({ requirements: [fake] }, 'Use Python.'));
  // quote matching tolerates case, punctuation and whitespace, not different words
  assert.equal(validateRequirements({ requirements: [{ ...r, jobQuote: 'use   python' }] }, 'Must: Use Python!').length, 1);
});
test('valid decisions keep genuine source text and pending review', () => {
  const result = resolveReview(requirement, direct, ['S2'], sources);
  assert.equal(result.status, 'supported');
  assert.equal(result.evidence[0].text, 'Normalized input records.');
  assert.equal(result.needsReview, true);
});
function mockAnalyzer({ failReview = false, omitSelection = false } = {}) {
  let count = 0;
  const run = createAnalyzer({ log: () => {}, callModel: async ({ schema }) => {
    count++;
    if (schema.properties.requirements) return { data: { requirements: [{ requirement: 'Prepare data.', jobQuote: 'Prepare data.', kind: 'skill' }] } };
    if (schema.properties.selections) return { data: { selections: omitSelection ? {} : { R1: { evidenceIds: ['S2'] } } } };
    if (failReview) throw Error('Test timeout');
    return { data: direct };
  } });
  return { run, count: () => count };
}
test('three-stage orchestration and content-keyed cache', async () => {
  const m = mockAnalyzer();
  const first = await m.run('PROJECT\nNormalized input records.', 'Prepare data.');
  assert.equal(first.metrics.modelCalls, 3);
  first.analysis.requirements[0].status = 'tampered';
  const cached = await m.run('PROJECT\nNormalized input records.', 'Prepare data.');
  assert.equal(cached.metrics.cacheHit, true);
  assert.equal(cached.analysis.requirements[0].status, 'supported');
  assert.equal(m.count(), 3);
  await m.run('PROJECT\nNormalized different records.', 'Prepare data.');
  assert.equal(m.count(), 6);
});
test('failed verifier remains unverified and is not cached', async () => {
  const m = mockAnalyzer({ failReview: true });
  const r = await m.run('PROJECT\nNormalized input records.', 'Prepare data.');
  assert.equal(r.analysis.requirements[0].status, 'unverified');
  await m.run('PROJECT\nNormalized input records.', 'Prepare data.');
  assert.equal(m.count(), 6);
});
test('missing retrieval row is not classified as absent', async () => {
  const m = mockAnalyzer({ omitSelection: true });
  const r = await m.run('PROJECT\nNormalized input records.', 'Prepare data.');
  assert.equal(r.analysis.requirements[0].status, 'unverified');
});
test('oversized input and cancellation fail explicitly', async () => {
  const m = mockAnalyzer();
  await assert.rejects(() => m.run('x'.repeat(12001), 'Prepare data.'));
  await assert.rejects(() => m.run('Resume', 'x'.repeat(12001)));
  const c = new AbortController(); c.abort();
  await assert.rejects(() => m.run('Resume', 'Prepare data.', c.signal));
});
import { openDb } from './db.mjs';
test('HTTP API accepts UTF-8, rejects bad input and returns analysis', async (t) => {
  const server = createServer({ analyze: async (resume) => ({ received: resume }), db: openDb(':memory:') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/api/analyze`;
  const ok = await fetch(url, { method: 'POST', body: JSON.stringify({ resume: 'Résumé', jobDescription: 'Role' }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).received, 'Résumé');
  const bad = await fetch(url, { method: 'POST', body: '{}' });
  assert.equal(bad.status, 400);
});

// --- Generation-schema guarantees (structure only; says nothing about model accuracy) ---
const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `R${from + i}`);
test('selection schema requires every requirement ID, including batches that start above R1', () => {
  const schema = selectionSchemaFor(ids(3, 7), ['S1', 'S2']);
  const rows = schema.properties.selections;
  assert.deepEqual(rows.required, ['R7', 'R8', 'R9']);
  assert.equal(rows.additionalProperties, false);
  assert.deepEqual(Object.keys(rows.properties), ['R7', 'R8', 'R9']);
  assert.deepEqual(schema.required, ['selections']);
});
test('selection evidence IDs are an enum of real source IDs; empty list stays valid', () => {
  const item = selectionSchemaFor(['R1'], ['S1', 'S2', 'S3']).properties.selections.properties.R1.properties.evidenceIds;
  assert.deepEqual(item.items.enum, ['S1', 'S2', 'S3']);
  assert.equal(item.minItems, undefined);
  assert.equal(item.maxItems, 3);
});
test('app-side validation still catches omitted rows and unexpected keys', async () => {
  const mk = (selections) => createAnalyzer({ log: () => {}, callModel: async ({ schema }) => {
    if (schema.properties.requirements) return { data: { requirements: [{ requirement: 'A.', jobQuote: 'A.', kind: 'skill' }, { requirement: 'B.', jobQuote: 'B.', kind: 'skill' }] } };
    if (schema.properties.selections) return { data: { selections } };
    return { data: direct };
  } });
  const partial = await mk({ R1: { evidenceIds: ['S2'] } })('PROJECT\nNormalized input records.', 'A. B.');
  assert.equal(partial.analysis.requirements[1].status, 'unverified');
  const both = await mk({ R1: { evidenceIds: ['S2'] }, R2: { evidenceIds: [] } })('PROJECT\nNormalized input records.', 'A. B.');
  assert.deepEqual(both.analysis.requirements.map(x => x.status), ['supported', 'not_evidenced']);
});


// --- v4: one-requirement reviews with verifiable quotes (software behaviour, not model accuracy) ---
test('review schema allows only the offered line IDs plus none, with quote before decision', () => {
  const s = reviewSchemaFor(['S4', 'S5']);
  assert.deepEqual(s.properties.evidenceId.enum, ['S4', 'S5', 'none']);
  assert.deepEqual(Object.keys(s.properties), ['quote', 'evidenceId', 'missing', 'decision']);
  assert.deepEqual(s.required, ['quote', 'evidenceId', 'missing', 'decision']);
  assert.deepEqual(s.properties.decision.enum, ['absent', 'partial', 'direct']);
});
test('fabricated quotes, invented IDs and unselected lines never become supported', () => {
  assert.equal(resolveReview(requirement, { ...direct, quote: 'Wrote annotation guidelines' }, ['S2'], sources).status, 'unverified');
  assert.equal(resolveReview(requirement, { ...direct, quote: 'the' }, ['S2'], sources).status, 'unverified'); // too short to prove anything
  assert.equal(resolveReview(requirement, { ...direct, evidenceId: 'S99' }, ['S2'], sources).status, 'unverified');
  assert.equal(resolveReview(requirement, { ...direct, quote: 'PROJECT', evidenceId: 'S1' }, ['S2'], sources).status, 'unverified');
  assert.equal(resolveReview(requirement, undefined, ['S2'], sources).status, 'unverified');
});
test('quote check ignores case and punctuation but requires genuine contiguous text', () => {
  const ok = resolveReview(requirement, { ...direct, quote: 'normalized INPUT records.' }, ['S2'], sources);
  assert.equal(ok.status, 'supported');
  assert.equal(ok.evidence[0].text, 'Normalized input records.');
  assert.equal(resolveReview(requirement, { ...direct, quote: 'Normalized records input' }, ['S2'], sources).status, 'unverified');
});
test('absent is a valid outcome and keeps pending review; direct with missing text is downgraded', () => {
  const absent = resolveReview(requirement, { quote: '', evidenceId: 'none', missing: 'No labeling work.', decision: 'absent' }, ['S2'], sources);
  assert.equal(absent.status, 'not_evidenced');
  assert.equal(absent.needsReview, true);
  const mixed = resolveReview(requirement, { ...direct, missing: 'Documentation is not shown.' }, ['S2'], sources);
  assert.equal(mixed.status, 'partially_supported');
  assert.equal(mixed.modelProposedStatus, 'supported');
  assert.ok(mixed.reviewWarnings.length);
  const partialNoMissing = resolveReview(requirement, { ...direct, decision: 'partial' }, ['S2'], sources);
  assert.equal(partialNoMissing.status, 'partially_supported');
  assert.ok(partialNoMissing.missingEvidence);
});
test('analyzer makes one narrow review call per requirement, offering only its candidate lines', async () => {
  const resume = ['H', 'alpha beta gamma', 'delta epsilon zeta', 'eta theta iota'].join('\n');
  const reqs = Array.from({ length: 3 }, (_, i) => ({ requirement: `Skill ${i}.`, jobQuote: `Skill ${i}.`, kind: 'skill' }));
  const pick = { R1: ['S2'], R2: ['S3'], R3: ['S4'] };
  const reviews = [];
  const run = createAnalyzer({ log: () => {}, callModel: async ({ schema, input }) => {
    if (schema.properties.requirements) return { data: { requirements: reqs } };
    if (schema.properties.selections) return { data: { selections: Object.fromEntries(Object.keys(schema.properties.selections.properties).map(k => [k, { evidenceIds: pick[k] }])) } };
    reviews.push({ allowed: schema.properties.evidenceId.enum, lines: input.candidateLines.map(l => l.id), context: input.contextLines.map(l => l.id) });
    const line = input.candidateLines[0];
    return { data: { quote: line.text, evidenceId: line.id, missing: '', decision: 'direct' } };
  } });
  const r = await run(resume, 'Skill 0. Skill 1. Skill 2.');
  assert.deepEqual(reviews.map(x => x.allowed), [['S2', 'none'], ['S3', 'none'], ['S4', 'none']]);
  assert.deepEqual(reviews.map(x => x.lines), [['S2'], ['S3'], ['S4']]);
  assert.deepEqual(reviews[0].context, ['S1']);
  assert.ok(r.analysis.requirements.every(x => x.status === 'supported'));
  assert.equal(r.metrics.modelCalls, 7); // 1 extraction + 3 searches + 3 reviews
});

test('applications persist, analyze stores results, and changed inputs reset the analysis', async (t) => {
  const db = openDb(':memory:');
  const server = createServer({ analyze: async () => ({ analysis: { requirements: [{ id: 'R1', status: 'supported' }] }, warnings: [], metrics: {} }), db });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, init) => { const r = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init }); return [r.status, await r.json()]; };
  const [s1, created] = await j('/api/applications', { method: 'POST', body: JSON.stringify({ title: 'GoTo intern', resume: 'A\nB', jobDescription: 'Use Python' }) });
  assert.equal(s1, 201); assert.equal(created.stage, 'inputs');
  const [s2, analyzed] = await j(`/api/applications/${created.id}/analyze`, { method: 'POST' });
  assert.equal(s2, 200); assert.equal(analyzed.stage, 'review'); assert.equal(analyzed.analysis.analysis.requirements[0].id, 'R1');
  const [, decided] = await j(`/api/applications/${created.id}`, { method: 'PATCH', body: JSON.stringify({ decisions: { R1: { verdict: 'accepted' } } }) });
  assert.equal(decided.decisions.R1.verdict, 'accepted');
  const [, list] = await j('/api/applications');
  assert.equal(list.applications[0].decided, 1);
  const [, reset] = await j(`/api/applications/${created.id}`, { method: 'PATCH', body: JSON.stringify({ resume: 'Changed' }) });
  assert.equal(reset.analysis, null); assert.deepEqual(reset.decisions, {}); assert.equal(reset.stage, 'inputs');
  const [s404] = await j('/api/applications/nope');
  assert.equal(s404, 404);
});
test('text upload extraction returns tidy text and rejects unknown types', async () => {
  const { extractText } = await import('./extract.mjs');
  const r = await extractText({ name: 'cv.txt', base64: Buffer.from('Line one  \r\n\r\n\r\nLine   two').toString('base64') });
  assert.equal(r.text, 'Line one\n\nLine two');
  await assert.rejects(() => extractText({ name: 'x.exe', base64: 'AA==' }));
});

test('interview sessions use only approved facts, store answers, and add the follow-up as a new turn', async (t) => {
  const { registerInterview, approvedFacts } = await import('./interview.mjs');
  const db = openDb(':memory:');
  const seen = [];
  const server = createServer({ analyze: async () => ({}), db, interview: (ctx) => registerInterview({ ...ctx, callModel: async ({ schema, input }) => {
    seen.push(input);
    if (schema.properties.question) return { data: { question: `Regarding ${input.focusFact}: ${input.angle}`, probes: 'specifics' }, model: 'mock' };
    if (schema.properties.questions) return { data: { questions: [1, 2, 3].map(i => ({ question: `Question ${i} about ${input.approvedFacts[0].text}?`, probes: 'specifics', basedOn: input.approvedFacts[0].text })) }, model: 'mock' };
    return { data: { strengths: 'Clear.', gaps: 'Numbers.', suggestion: 'Lead with the result.', followUp: 'What would you change next time?' }, model: 'mock' };
  } }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, init) => { const r = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init }); return [r.status, await r.json()]; };
  const app = db.createApplication({ title: 't', resume: 'A\nB', jobDescription: 'J' });
  const reqs = [
    { id: 'R1', requirement: 'Use Python', kind: 'skill', status: 'supported', evidence: [{ id: 'S2', text: 'Wrote Python scripts' }] },
    { id: 'R2', requirement: 'Annotate text', kind: 'skill', status: 'not_evidenced', evidence: [] },
    { id: 'R3', requirement: 'Document work', kind: 'skill', status: 'supported', evidence: [{ id: 'S1', text: 'Documented nothing' }] },
    { id: 'R4', requirement: 'Five months', kind: 'personal_condition', status: 'requires_confirmation', evidence: [] },
  ];
  db.updateApplication(app.id, { analysis: { analysis: { requirements: reqs }, warnings: [], metrics: {} }, decisions: { R1: { verdict: 'accepted' }, R2: { verdict: 'clarified', note: 'Labelled 300 tickets' }, R3: { verdict: 'rejected' }, R4: { verdict: 'accepted', answer: 'yes' } } });
  const facts = approvedFacts(db.getApplication(app.id));
  assert.deepEqual(facts.map(f => f.text), ['Wrote Python scripts', 'Labelled 300 tickets', 'Confirmed by candidate: Five months']);
  const [s1, session] = await j(`/api/applications/${app.id}/sessions`, { method: 'POST', body: '{}' });
  assert.equal(s1, 201); assert.equal(session.turns.length, 3);
  assert.ok(!JSON.stringify(seen[0]).includes('Documented nothing')); // rejected evidence never reaches the model
  assert.deepEqual(seen[0].knownGaps, ['Document work']);
  const [s2, after] = await j(`/api/sessions/${session.id}/answer`, { method: 'POST', body: JSON.stringify({ n: 1, answer: 'I wrote scripts to clean the data.' }) });
  assert.equal(s2, 200); assert.equal(after.turns[0].feedback.gaps, 'Numbers.'); assert.equal(after.turns.length, 4); assert.equal(after.turns[3].followUpOf, 1);
  const [s3] = await j(`/api/sessions/${session.id}/answer`, { method: 'POST', body: JSON.stringify({ n: 1, answer: 'no' }) });
  assert.equal(s3, 400);
  const [, focused] = await j(`/api/applications/${app.id}/sessions`, { method: 'POST', body: JSON.stringify({ focus: 'Labelled 300 tickets' }) });
  assert.equal(focused.focus.text, 'Labelled 300 tickets'); assert.equal(focused.turns.length, 3);
  const focusCalls = seen.filter(x => x.focusFact); assert.equal(focusCalls.length, 3); assert.deepEqual(focusCalls.map(x => x.previousQuestions.length), [0, 1, 2]);
  assert.ok(focusCalls.every(x => !x.approvedFacts && !x.jobRequirements)); // a drilled bullet never sees other facts or JD text
  assert.ok(focused.turns.every(t => t.basedOn === 'Labelled 300 tickets'));
});

test('tailoring flags ungrounded terms and applies accepted edits into a new resume version', async (t) => {
  const { registerTailor, ungroundedTerms } = await import('./tailor.mjs');
  assert.deepEqual(ungroundedTerms('Normalized 500 genomic inputs to GRCh38 with Spark', ['Normalized messy genomic inputs to GRCh38 using Python']), ['500', 'spark']);
  assert.deepEqual(ungroundedTerms('Normalized messy genomic inputs to GRCh38 using Python', ['Normalized messy genomic inputs to GRCh38 using Python']), []);
  const db = openDb(':memory:');
  const server = createServer({ analyze: async () => ({}), db, interview: (ctx) => registerTailor({ ...ctx, callModel: async ({ input }) => ({ model: 'mock', data: input.task === 'rewrite' ? { rewritten: `${input.originalLine} with Spark`, reason: 'r' } : { rewritten: `Labelled 300 tickets by intent`, reason: 'n' } }) }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, init) => { const r = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...init }); return [r.status, await r.json()]; };
  const app = db.createApplication({ title: 't', resume: 'PROJECTS\n\nWrote Python scripts\nOther line', jobDescription: 'J' });
  db.updateApplication(app.id, { analysis: { analysis: { requirements: [
    { id: 'R1', requirement: 'Use Python', jobQuote: 'Python', kind: 'skill', status: 'supported', evidence: [{ id: 'S2', text: 'Wrote Python scripts' }] },
    { id: 'R2', requirement: 'Annotate', jobQuote: 'annotate', kind: 'skill', status: 'not_evidenced', evidence: [] } ] }, warnings: [], metrics: {} },
    decisions: { R1: { verdict: 'accepted' }, R2: { verdict: 'clarified', note: 'Labelled 300 tickets by intent' } } });
  const [s1, tailored] = await j(`/api/applications/${app.id}/tailor`, { method: 'POST' });
  assert.equal(s1, 200); assert.equal(tailored.proposals.length, 2);
  assert.deepEqual(tailored.proposals[0].ungrounded, ['spark']);
  assert.deepEqual(tailored.proposals[1].ungrounded, []);
  const [s2, v] = await j(`/api/applications/${app.id}/versions`, { method: 'POST', body: JSON.stringify({ accepted: [{ lineId: 'S2', rewritten: 'Wrote Python scripts daily' }, { lineId: null, rewritten: 'Labelled 300 tickets by intent' }] }) });
  assert.equal(s2, 201);
  assert.equal(v.version.text, 'PROJECTS\n\nWrote Python scripts daily\nOther line\n\u2022 Labelled 300 tickets by intent');
  assert.equal(db.getApplication(app.id).stage, 'practice');
});

test('Mastra workflow suspends at each human decision and resumes across a fresh engine instance', async () => {
  const { createMastra } = await import('./workflow.mjs');
  const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'pp-mastra-'));
  const db = openDb(join(dir, 'app.sqlite'));
  const analysis = { analysis: { requirements: [
    { id: 'R1', requirement: 'Use Python', jobQuote: 'Python', kind: 'skill', status: 'supported', evidence: [{ id: 'S2', text: 'Wrote Python scripts' }] },
    { id: 'R2', requirement: 'Five months', jobQuote: 'five months', kind: 'personal_condition', status: 'requires_confirmation', evidence: [] } ] }, warnings: [], metrics: {} };
  let calls = 0;
  const mk = () => createMastra({ db, analyze: async () => { calls++; return analysis; }, url: `file:${join(dir, 'mastra.sqlite')}` });
  const app = db.createApplication({ title: 't', resume: 'PROJECTS\nWrote Python scripts', jobDescription: 'Python five months' });
  let engine = mk();
  const s1 = await engine.start(app.id);
  assert.equal(s1.status, 'suspended'); assert.equal(s1.suspended[0].step, 'confirm-conditions'); assert.deepEqual(s1.suspended[0].payload.conditions, [{ id: 'R2', requirement: 'Five months' }]);
  assert.equal(calls, 1); assert.equal(db.getApplication(app.id).stage, 'review');
  engine = mk(); // simulate a server restart: fresh Mastra instance, same storage
  const s2 = await engine.resume(app.id, 'confirm-conditions', { answers: { R2: 'yes' } });
  assert.equal(s2.status, 'suspended'); assert.equal(s2.suspended[0].step, 'review-evidence'); assert.equal(s2.suspended[0].payload.undecided, 1);
  assert.equal(db.getApplication(app.id).decisions.R2.answer, 'yes');
  const s3 = await engine.resume(app.id, 'review-evidence', { decisions: { R1: { verdict: 'accepted' } } });
  assert.equal(s3.status, 'suspended'); assert.equal(s3.suspended[0].step, 'approve-edits'); assert.equal(s3.suspended[0].payload.approvedFacts, 2);
  const status = await engine.status(app.id);
  assert.equal(status.status, 'suspended'); assert.equal(status.steps['analyze'], 'success');
  const s4 = await engine.resume(app.id, 'approve-edits', { accepted: [{ lineId: 'S2', rewritten: 'Wrote Python scripts for data preparation' }] });
  assert.equal(s4.status, 'success'); assert.ok(s4.result.versionId);
  assert.equal(db.listResumeVersions(app.id)[0].text, 'PROJECTS\nWrote Python scripts for data preparation');
  assert.equal(db.getApplication(app.id).stage, 'practice');
  assert.equal(calls, 1); // the model was never re-run across suspensions or restarts
});

// --- v6: long inputs, looser-but-verified quotes ---
test('a long job description is extracted in chunks and merged without duplicates', async () => {
  const jd = Array.from({ length: 12 }, (_, i) => `Responsibility number ${i} requires careful work. `.repeat(8)).join('\n');
  const calls = [];
  const run = createAnalyzer({ log: () => {}, callModel: async ({ schema, input, step }) => {
    if (schema.properties.requirements) { calls.push(step); return { data: { requirements: [{ requirement: 'Careful work.', jobQuote: 'requires careful work.', kind: 'skill' }] } }; }
    if (schema.properties.selections) return { data: { selections: { R1: { evidenceIds: [] } } } };
    return { data: direct };
  } });
  const r = await run('PROJECT\nNormalized input records.', jd);
  assert.ok(jd.length > 3200 && calls.length > 1);
  assert.equal(r.analysis.requirements.length, 1);
});
test('a partly fabricated quote keeps only its verified fragment; short tool names verify from skills lines', () => {
  const skillLine = [{ id: 'S1', text: 'SKILLS' }, { id: 'S2', text: 'Full-Stack: React, Flutter, Node.js, Flask / FastAPI' }];
  const req = { id: 'R1', requirement: 'Build back-end systems', jobQuote: 'back-end', kind: 'skill' };
  const salvage = resolveReview(req, { quote: 'Node.js, Flask and Kubernetes', evidenceId: 'S2', missing: '', decision: 'partial' }, ['S2'], skillLine);
  assert.equal(salvage.status, 'partially_supported');
  assert.match(salvage.explanation, /nodejs flask/);
  assert.equal(resolveReview(req, { quote: 'Kubernetes and Terraform', evidenceId: 'S2', missing: '', decision: 'direct' }, ['S2'], skillLine).status, 'unverified');
  assert.equal(resolveReview(req, { quote: 'Flutter', evidenceId: 'S2', missing: '', decision: 'direct' }, ['S2'], skillLine).status, 'supported');
});

test('new bullets land inside Projects next to related evidence, never under the last section', async () => {
  const { insertIntoSection, resumeSections, defaultSection, sectionAt } = await import('./tailor.mjs');
  const resume = ['JANE DOE', 'PROJECTS', 'Alpha App', '\u2022 Built the alpha API', '\u2022 Built using: Node', 'Beta App', '\u2022 Built the beta UI', '\u2022 Built using: React', 'SKILLS', '\u2022 Full-Stack: React', 'VOLUNTEERING', 'Football team member'];
  const sections = resumeSections(resume.join('\n'));
  assert.deepEqual(sections.map(s => s.title), ['PROJECTS', 'SKILLS', 'VOLUNTEERING']);
  assert.equal(defaultSection(sections), 'PROJECTS');
  assert.equal(sectionAt(resume.join('\n'), 3), 'PROJECTS');
  const anchored = insertIntoSection(resume, 'PROJECTS', ['Managed the database layer'], 3);
  assert.deepEqual(anchored.slice(3, 7), ['\u2022 Built the alpha API', '\u2022 Managed the database layer', '\u2022 Built using: Node', 'Beta App']);
  const sectionEnd = insertIntoSection(resume, 'PROJECTS', ['Managed the database layer']);
  assert.equal(sectionEnd.indexOf('\u2022 Managed the database layer'), 8);
  assert.ok(sectionEnd.indexOf('\u2022 Managed the database layer') < sectionEnd.indexOf('VOLUNTEERING'));
});

test('placement: model chooses where a new bullet goes, replace is guarded, rules fallback works, edits apply in place', async (t) => {
  const { registerTailor, bulletOptions, fallbackPlacement, applyEdits } = await import('./tailor.mjs');
  const resume = ['JANE DOE', 'PROJECTS', 'Alpha App', '• Built the alpha payments API in Node', '• Built using: Node', 'Genome Tool', '• Designed the genome variant triage pipeline', '• Calibrated the scoring on 47 labelled variants', '• Built using: Python', 'SKILLS', '• Full-Stack: React', 'VOLUNTEERING', 'Football team member'].join('\n');
  const opts = bulletOptions(resume);
  assert.deepEqual(opts.map(o => o.id), ['S4', 'S7', 'S8', 'S11']); // tech lines are not options
  assert.equal(opts[1].entry, 'Genome Tool'); assert.equal(opts[1].section, 'PROJECTS');
  assert.equal(fallbackPlacement('Managed the genome variant tool lifecycle', opts).lineId, 'S7'); // best word overlap with bullet + project name
  assert.equal(applyEdits(resume, [{ lineId: null, rewritten: 'Owned the genome variant tool end to end', placement: { action: 'insert_after', lineId: 'S7' } }]).split('\n').slice(5, 9).join('|'),
    'Genome Tool|• Designed the genome variant triage pipeline|• Owned the genome variant tool end to end|• Calibrated the scoring on 47 labelled variants');
  const replaced = applyEdits(resume, [{ lineId: null, rewritten: 'Built the genome variant triage pipeline end to end', placement: { action: 'replace', lineId: 'S7' } }]).split('\n');
  assert.equal(replaced[6], '• Built the genome variant triage pipeline end to end'); assert.equal(replaced.length, resume.split('\n').length);
  const db = openDb(':memory:');
  let verdict = { action: 'insert_after', lineId: 'S7', reason: 'It belongs with the Genome Tool project.' };
  const server = createServer({ analyze: async () => ({}), db, interview: (ctx) => registerTailor({ ...ctx, callModel: async ({ input }) => ({ model: 'mock', data: input.task === 'place' ? verdict : { rewritten: 'Owned the genome variant tool end to end', reason: 'r' } }) }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path) => (await fetch(base + path, { method: 'POST' })).json();
  const app = db.createApplication({ title: 't', resume, jobDescription: 'J' });
  db.updateApplication(app.id, { analysis: { analysis: { requirements: [{ id: 'R1', requirement: 'Own a product lifecycle', jobQuote: 'lifecycle', kind: 'skill', status: 'not_evidenced', evidence: [] }] }, warnings: [], metrics: {} }, decisions: { R1: { verdict: 'clarified', note: 'Owned the genome variant tool end to end' } } });
  let p = (await post(`/api/applications/${app.id}/tailor`)).proposals[0];
  assert.deepEqual([p.placement.action, p.placement.lineId, p.placement.by], ['insert_after', 'S7', 'model']); assert.equal(p.placements.length, 4);
  verdict = { action: 'replace', lineId: 'S4', reason: 'x' }; // unrelated line: replace must be downgraded, never delete it
  p = (await post(`/api/applications/${app.id}/tailor`)).proposals[0];
  assert.equal(p.placement.action, 'insert_after');
  verdict = { action: 'insert_after', lineId: 'S999', reason: 'x' }; // invalid ID: rules fallback
  p = (await post(`/api/applications/${app.id}/tailor`)).proposals[0];
  assert.equal(p.placement.by, 'rules');
});
