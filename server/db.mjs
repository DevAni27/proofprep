// Local persistence with Node's built-in SQLite (no dependency). The database holds private resume
// text, so it lives in a git-ignored file (see .gitignore: *.sqlite).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function openDb(path = process.env.PROOFPREP_DB || 'proofprep.sqlite') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      resume TEXT NOT NULL, job_description TEXT NOT NULL, analysis TEXT, decisions TEXT NOT NULL DEFAULT '{}', stage TEXT NOT NULL DEFAULT 'inputs'
    );
    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL, created_at TEXT NOT NULL, text TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, focus TEXT, turns TEXT NOT NULL DEFAULT '[]'
    );
  `);
  db.exec("UPDATE applications SET stage='practice' WHERE stage='practise'"); // spelling migration
  const now = () => new Date().toISOString();
  const parse = (row) => row && { ...row, analysis: row.analysis ? JSON.parse(row.analysis) : null, decisions: JSON.parse(row.decisions) };
  return {
    db,
    createApplication({ title, resume, jobDescription }) {
      const id = randomUUID(); const t = now();
      db.prepare('INSERT INTO applications (id, title, created_at, updated_at, resume, job_description) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, t, t, resume, jobDescription);
      return this.getApplication(id);
    },
    listApplications() {
      return db.prepare('SELECT id, title, created_at, updated_at, stage, decisions, analysis IS NOT NULL AS analyzed FROM applications ORDER BY updated_at DESC').all()
        .map(r => ({ ...r, analyzed: Boolean(r.analyzed), decided: Object.keys(JSON.parse(r.decisions)).length, decisions: undefined }));
    },
    getApplication(id) { return parse(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)); },
    updateApplication(id, patch) {
      const cur = this.getApplication(id); if (!cur) return null;
      const next = { ...cur, ...patch, updated_at: now() };
      db.prepare('UPDATE applications SET title=?, updated_at=?, resume=?, job_description=?, analysis=?, decisions=?, stage=? WHERE id=?')
        .run(next.title, next.updated_at, next.resume, next.job_description, next.analysis ? JSON.stringify(next.analysis) : null, JSON.stringify(next.decisions ?? {}), next.stage, id);
      return this.getApplication(id);
    },
    deleteApplication(id) {
      db.prepare('DELETE FROM resume_versions WHERE application_id = ?').run(id);
      db.prepare('DELETE FROM interview_sessions WHERE application_id = ?').run(id);
      return db.prepare('DELETE FROM applications WHERE id = ?').run(id).changes > 0;
    },
    addResumeVersion(applicationId, text, note = '') {
      const id = randomUUID();
      db.prepare('INSERT INTO resume_versions (id, application_id, created_at, text, note) VALUES (?, ?, ?, ?, ?)').run(id, applicationId, now(), text, note);
      return { id, application_id: applicationId, text, note };
    },
    listResumeVersions(applicationId) { return db.prepare('SELECT * FROM resume_versions WHERE application_id = ? ORDER BY created_at DESC').all(applicationId); },
    createSession(applicationId, focus) {
      const id = randomUUID(); const t = now();
      db.prepare('INSERT INTO interview_sessions (id, application_id, created_at, updated_at, focus, turns) VALUES (?, ?, ?, ?, ?, ?)').run(id, applicationId, t, t, focus ? JSON.stringify(focus) : null, '[]');
      return this.getSession(id);
    },
    getSession(id) { const r = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id); return r && { ...r, focus: r.focus ? JSON.parse(r.focus) : null, turns: JSON.parse(r.turns) }; },
    listSessions(applicationId) { return db.prepare('SELECT id, created_at, updated_at, focus, turns FROM interview_sessions WHERE application_id = ? ORDER BY updated_at DESC').all(applicationId).map(r => ({ ...r, focus: r.focus ? JSON.parse(r.focus) : null, turns: JSON.parse(r.turns).length })); },
    saveSessionTurns(id, turns) { db.prepare('UPDATE interview_sessions SET turns = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(turns), now(), id); return this.getSession(id); },
    close() { db.close(); },
  };
}
