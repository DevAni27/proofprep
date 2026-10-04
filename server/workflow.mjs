// Mastra workflow for one application. Each human decision point is a real suspend: the run persists
// in LibSQL (git-ignored file) and resumes from the same point after a restart. The model calls are
// the same functions the plain endpoints use; the workflow adds the explicit stages, resumability
// and an inspectable run history. ProofPrep's SQLite remains the source of truth for user data.
import { Mastra } from '@mastra/core';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';

const decision = z.object({ verdict: z.enum(['accepted', 'rejected', 'clarified']), note: z.string().optional(), answer: z.enum(['yes', 'no']).optional() });
const ctx = z.object({ appId: z.string() });

export function buildWorkflow({ db, analyze }) {
  const analyzeStep = createStep({
    id: 'analyze', description: 'Extract requirements and check evidence with the evidence model (Qwen).',
    inputSchema: ctx, outputSchema: ctx.extend({ requirements: z.number(), conditions: z.array(z.object({ id: z.string(), requirement: z.string() })) }),
    execute: async ({ inputData }) => {
      const app = db.getApplication(inputData.appId); if (!app) throw Error('Application not found.');
      const result = app.analysis ?? await analyze(app.resume, app.job_description);
      if (!app.analysis) db.updateApplication(app.id, { analysis: result, decisions: {}, stage: 'review' });
      const reqs = result.analysis.requirements;
      return { appId: app.id, requirements: reqs.length, conditions: reqs.filter(r => r.status === 'requires_confirmation').map(r => ({ id: r.id, requirement: r.requirement })) };
    },
  });

  // Human step 1: personal conditions (availability etc.) can only be answered by the candidate.
  const confirmConditions = createStep({
    id: 'confirm-conditions', description: 'Suspend until the candidate answers each personal condition.',
    inputSchema: analyzeStep.outputSchema, outputSchema: ctx,
    suspendSchema: z.object({ conditions: z.array(z.object({ id: z.string(), requirement: z.string() })) }),
    resumeSchema: z.object({ answers: z.record(z.enum(['yes', 'no'])) }),
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!inputData.conditions.length) return { appId: inputData.appId };
      if (!resumeData) return suspend({ conditions: inputData.conditions });
      const app = db.getApplication(inputData.appId);
      const decisions = { ...app.decisions };
      for (const [id, answer] of Object.entries(resumeData.answers)) decisions[id] = { verdict: answer === 'yes' ? 'accepted' : 'rejected', answer };
      db.updateApplication(app.id, { decisions });
      return { appId: app.id };
    },
  });

  // Human step 2: every evidence suggestion is accepted, rejected or clarified by the user.
  const reviewEvidence = createStep({
    id: 'review-evidence', description: 'Suspend until the user has decided on the evidence suggestions.',
    inputSchema: ctx, outputSchema: ctx.extend({ approvedFacts: z.number() }),
    suspendSchema: z.object({ undecided: z.number() }),
    resumeSchema: z.object({ decisions: z.record(decision) }),
    execute: async ({ inputData, resumeData, suspend }) => {
      const app = db.getApplication(inputData.appId);
      const skills = app.analysis.analysis.requirements.filter(r => r.status !== 'requires_confirmation');
      if (!resumeData) return suspend({ undecided: skills.filter(r => !app.decisions[r.id]).length });
      const decisions = { ...app.decisions, ...resumeData.decisions };
      db.updateApplication(app.id, { decisions, stage: 'tailor' });
      return { appId: app.id, approvedFacts: Object.values(decisions).filter(d => d.verdict === 'accepted' || d.verdict === 'clarified').length };
    },
  });

  // Human step 3: tailored edits are applied only when the user approves them.
  const approveEdits = createStep({
    id: 'approve-edits', description: 'Suspend until the user approves (or skips) resume edits.',
    inputSchema: reviewEvidence.outputSchema, outputSchema: ctx.extend({ versionId: z.string().nullable() }),
    suspendSchema: z.object({ approvedFacts: z.number() }),
    resumeSchema: z.object({ accepted: z.array(z.object({ lineId: z.string().nullable(), rewritten: z.string(), section: z.string().nullable().optional(), anchor: z.string().nullable().optional(), placement: z.object({ action: z.enum(['insert_after', 'replace']), lineId: z.string() }).nullable().optional() })), skip: z.boolean().optional() }),
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!resumeData) return suspend({ approvedFacts: inputData.approvedFacts });
      if (resumeData.skip || !resumeData.accepted.length) { db.updateApplication(inputData.appId, { stage: 'practice' }); return { appId: inputData.appId, versionId: null }; }
      const app = db.getApplication(inputData.appId);
      const { applyEdits } = await import('./tailor.mjs');
      const version = db.addResumeVersion(app.id, applyEdits(app.resume, resumeData.accepted), `Applied ${resumeData.accepted.length} approved edit(s)`);
      db.updateApplication(app.id, { stage: 'practice' });
      return { appId: app.id, versionId: version.id };
    },
  });

  const workflow = createWorkflow({ id: 'application', description: 'ProofPrep application: analyse → confirm conditions → review evidence → approve edits → ready to practice.', inputSchema: ctx, outputSchema: approveEdits.outputSchema })
    .then(analyzeStep).then(confirmConditions).then(reviewEvidence).then(approveEdits).commit();
  return workflow;
}

export function createMastra({ db, analyze, url = process.env.PROOFPREP_MASTRA_DB || 'file:proofprep-mastra.sqlite' }) {
  const workflow = buildWorkflow({ db, analyze });
  const mastra = new Mastra({ workflows: { application: workflow }, storage: new LibSQLStore({ id: 'proofprep', url }) });
  const wf = () => mastra.getWorkflow('application');
  const runId = (appId) => `app-${appId}`;
  const summarize = (r) => ({ status: r.status, suspended: r.status === 'suspended' ? Object.values(r.steps).filter(s => s.status === 'suspended').map(s => ({ step: Object.keys(r.steps).find(k => r.steps[k] === s), payload: s.suspendPayload })) : [], steps: Object.fromEntries(Object.entries(r.steps).map(([k, s]) => [k, s.status])), result: r.result ?? null, error: r.error?.message ?? null });
  return {
    mastra,
    async start(appId) { const run = await wf().createRun({ runId: runId(appId), resourceId: appId }); return summarize(await run.start({ inputData: { appId } })); },
    async resume(appId, step, resumeData) { const run = await wf().createRun({ runId: runId(appId) }); return summarize(await run.resume({ step, resumeData })); },
    async status(appId) {
      const info = await wf().getWorkflowRunById(runId(appId)); if (!info) return null;
      const steps = info.steps ?? {};
      return { status: info.status, steps: Object.fromEntries(Object.entries(steps).map(([k, s]) => [k, s.status])), suspended: Object.entries(steps).filter(([, s]) => s?.status === 'suspended').map(([k, s]) => ({ step: k, payload: s.suspendPayload })), updatedAt: info.updatedAt };
    },
  };
}

export function registerWorkflow({ route, db, readJson, analyze }) {
  const engine = createMastra({ db, analyze });
  route('GET', /^\/api\/applications\/([\w-]+)\/workflow$/, async (_req, [id]) => [200, (await engine.status(id)) ?? { status: 'not_started', steps: {}, suspended: [] }]);
  route('POST', /^\/api\/applications\/([\w-]+)\/workflow\/start$/, async (_req, [id]) => { if (!db.getApplication(id)) return [404, { error: 'Application not found.' }]; return [200, await engine.start(id)]; });
  route('POST', /^\/api\/applications\/([\w-]+)\/workflow\/resume$/, async (req, [id]) => {
    const { step, resumeData } = await readJson(req, 64000);
    if (!['confirm-conditions', 'review-evidence', 'approve-edits'].includes(step)) return [400, { error: 'Unknown step.' }];
    return [200, await engine.resume(id, step, resumeData)];
  });
  return engine;
}
