import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeApplication, LIMITS } from './analysis.mjs';
import { EVIDENCE_MODEL, INTERVIEW_MODEL, OLLAMA_URL } from './config.mjs';
import { openDb } from './db.mjs';
import { extractText } from './extract.mjs';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function send(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(Error(`Request exceeds ${limit} bytes.`), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(Error('Body must be valid JSON.'), { status: 400 }); }
}

const bad = (message) => Object.assign(Error(message), { status: 400 });
const validInputs = (resume, jobDescription) => {
  if (typeof resume !== 'string' || typeof jobDescription !== 'string' || !resume.trim() || !jobDescription.trim()) throw bad('Provide resume and jobDescription text.');
  if (resume.length > LIMITS.resume) throw bad(`The resume is over ${LIMITS.resume.toLocaleString()} characters. Trim it to the relevant sections.`);
  if (jobDescription.length > LIMITS.jobDescription) throw bad(`The job description is over ${LIMITS.jobDescription.toLocaleString()} characters. Trim it to the responsibilities and requirements.`);
};

export function createServer({ analyze = analyzeApplication, db = openDb(), interview = null } = {}) {
  let busy = false;
  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

  route('GET', /^\/api\/health$/, async () => {
    try {
      const response = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error('Ollama unavailable');
      const names = ((await response.json()).models ?? []).map(m => m.name);
      const has = (m) => names.includes(m) || names.includes(`${m}:latest`);
      const model = EVIDENCE_MODEL();
      return [200, { backend: 'ready', ollama: 'connected', analyzing: busy, roles: [
        { role: 'evidence', label: 'Evidence analysis', model, available: has(model) },
        { role: 'interview', label: 'Interview practice', model: INTERVIEW_MODEL(), available: has(INTERVIEW_MODEL()) },
      ] }];
    } catch { return [503, { backend: 'ready', ollama: 'unavailable', message: 'Start Ollama and retry.', roles: [] }]; }
  });

  route('POST', /^\/api\/extract$/, async (req) => {
    const body = await readJson(req, 12 * 1024 * 1024);
    return [200, await extractText(body)];
  });

  route('GET', /^\/api\/applications$/, async () => [200, { applications: db.listApplications() }]);
  route('POST', /^\/api\/applications$/, async (req) => {
    const { title, resume, jobDescription } = await readJson(req, 160000);
    validInputs(resume, jobDescription);
    return [201, db.createApplication({ title: (typeof title === 'string' && title.trim()) || 'Untitled application', resume, jobDescription })];
  });
  route('GET', /^\/api\/applications\/([\w-]+)$/, async (_req, [id]) => {
    const app = db.getApplication(id); if (!app) return [404, { error: 'Application not found.' }];
    return [200, { ...app, resumeVersions: db.listResumeVersions(id), sessions: db.listSessions(id) }];
  });
  route('PATCH', /^\/api\/applications\/([\w-]+)$/, async (req, [id]) => {
    const patch = await readJson(req, 160000);
    const allowed = {};
    if (typeof patch.title === 'string') allowed.title = patch.title.trim() || 'Untitled application';
    if (typeof patch.resume === 'string') allowed.resume = patch.resume;
    if (typeof patch.jobDescription === 'string') allowed.job_description = patch.jobDescription;
    if (patch.decisions && typeof patch.decisions === 'object') allowed.decisions = patch.decisions;
    if (typeof patch.stage === 'string') allowed.stage = patch.stage;
    if (allowed.resume !== undefined || allowed.job_description !== undefined) {
      const cur = db.getApplication(id); if (!cur) return [404, { error: 'Application not found.' }];
      validInputs(allowed.resume ?? cur.resume, allowed.job_description ?? cur.job_description);
      allowed.analysis = null; allowed.decisions = {}; allowed.stage = 'inputs'; // inputs changed: previous analysis no longer applies
    }
    const app = db.updateApplication(id, allowed);
    return app ? [200, app] : [404, { error: 'Application not found.' }];
  });
  route('DELETE', /^\/api\/applications\/([\w-]+)$/, async (_req, [id]) => [db.deleteApplication(id) ? 200 : 404, { ok: true }]);

  // Runs the evidence analysis for a saved application and stores the result. One at a time.
  route('POST', /^\/api\/applications\/([\w-]+)\/analyze$/, async (req, [id], res) => {
    const app = db.getApplication(id); if (!app) return [404, { error: 'Application not found.' }];
    if (busy) return [429, { error: 'An analysis is already running.' }];
    busy = true;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const result = await analyze(app.resume, app.job_description, controller.signal);
      return [200, db.updateApplication(id, { analysis: result, decisions: {}, stage: 'review' })];
    } finally { busy = false; }
  });

  // Stateless analysis kept for scripts and the eval harness.
  route('POST', /^\/api\/analyze$/, async (req, _m, res) => {
    const input = await readJson(req, 160000);
    validInputs(input?.resume, input?.jobDescription);
    if (busy) return [429, { error: 'An analysis is already running.' }];
    busy = true;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try { return [200, await analyze(input.resume, input.jobDescription, controller.signal)]; } finally { busy = false; }
  });

  if (interview) interview({ route, db, readJson });

  async function serveStatic(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.includes('..')) return send(res, 400, { error: 'Bad path.' });
    let file = join(DIST, path === '/' ? 'index.html' : path);
    try { if (!(await stat(file)).isFile()) throw Error(); } catch { file = join(DIST, 'index.html'); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable' });
      res.end(body);
    } catch { send(res, 404, { error: 'UI not built. Run: npm run build' }); }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return req.method === 'GET' ? serveStatic(req, res) : send(res, 404, { error: 'Route not found.' });
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.pattern);
      if (!m) continue;
      try {
        const [status, data] = await r.handler(req, m.slice(1), res);
        return send(res, status, data);
      } catch (e) {
        if (!e.status) console.error(`[ProofPrep] ${e.message}`);
        return send(res, e.status || 502, e.status ? { error: e.message } : { error: 'Analysis could not complete.', detail: e.message });
      }
    }
    return send(res, 404, { error: 'Route not found.' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { registerInterview } = await import('./interview.mjs');
  const { registerTailor } = await import('./tailor.mjs');
  const { registerWorkflow } = await import('./workflow.mjs');
  createServer({ interview: (ctx) => { registerInterview(ctx); registerTailor(ctx); registerWorkflow({ ...ctx, analyze: analyzeApplication }); } }).listen(3001, '127.0.0.1', () => console.log('ProofPrep: http://127.0.0.1:3001'));
}
