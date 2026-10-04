import { useRef, useState } from 'react';
import { api, LIMITS, type Application, type Health } from '../lib/api';

function Dropzone({ onText, disabled }: { onText: (t: string, label: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [over, setOver] = useState(false); const [err, setErr] = useState<string | null>(null);
  const handle = async (file?: File | null) => {
    if (!file) return; setBusy(true); setErr(null);
    try { const r = await api.extract(file); onText(r.text, `${file.name}${r.pages ? ` · ${r.pages} page${r.pages > 1 ? 's' : ''}` : ''}`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className={`dropzone ${over ? 'over' : ''}`} role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={e => e.key === 'Enter' && ref.current?.click()} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}>
        <input ref={ref} type="file" accept=".pdf,.docx,.txt,.md,application/pdf" disabled={disabled || busy} onChange={e => handle(e.target.files?.[0])} />
        {busy ? <span><span className="spinner" /> Reading your file…</span> : <span><strong>Upload a PDF or Word file</strong> or drop it here. The text appears below so you can fix anything that came out wrong.</span>}
      </div>
      {err && <div className="banner error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

export function InputsForm({ app, health, onSaved }: { app?: Application; health: Health | null; onSaved: (app: Application) => void }) {
  const [title, setTitle] = useState(app?.title ?? '');
  const [resume, setResume] = useState(app?.resume ?? '');
  const [jd, setJd] = useState(app?.job_description ?? '');
  const [source, setSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const overR = resume.length > LIMITS.resume, overJ = jd.length > LIMITS.jobDescription; const over = overR || overJ;
  const changed = !app || resume !== app.resume || jd !== app.job_description;
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const body = { title: title.trim() || guessTitle(jd), resume, jobDescription: jd };
      onSaved(app ? await api.patch(app.id, changed ? body : { title: body.title }) : await api.create(body));
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <>
      {app?.analysis && changed && <div className="banner warn" style={{ marginBottom: 14 }}><strong>Changing these details starts the evidence check over.</strong> Your earlier approvals for this application will be cleared when you save.</div>}
      <div className="card">
        <div className="field"><label htmlFor="title">Name this application <span className="faint small" style={{ fontWeight: 500 }}>(optional)</span></label><input id="title" type="text" placeholder={guessTitle(jd) || 'e.g. Full Stack Developer at Acme'} value={title} onChange={e => setTitle(e.target.value)} /></div>
      </div>
      <div className="card">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="resume"><span className="badge-n">1</span> Your resume</label>
            <Dropzone onText={(t, label) => { setResume(t); setSource(label); }} />
            <textarea id="resume" value={resume} onChange={e => setResume(e.target.value)} placeholder="Or paste your resume text here. Keep one bullet per line." spellCheck={false} />
            <div className="row between"><span className="small faint">{source ? `Read from ${source}. Fix any garbled lines before continuing.` : 'Tip: one bullet per line works best.'}</span><span className={`counter ${overR ? 'over' : ''}`}>{resume.length.toLocaleString()} / {LIMITS.resume.toLocaleString()}</span></div>
            <div className={`meter ${overR ? 'over' : ''}`}><div style={{ width: `${Math.min(100, 100 * resume.length / LIMITS.resume)}%` }} /></div>
          </div>
          <div className="field">
            <label htmlFor="jd"><span className="badge-n">2</span> The job description</label>
            <textarea id="jd" value={jd} onChange={e => setJd(e.target.value)} placeholder="Paste the full job post here, with the responsibilities and requirements." spellCheck={false} />
            <div className="row between"><span className="small faint">Paste the real wording, not a summary. Longer posts are fine.</span><span className={`counter ${overJ ? 'over' : ''}`}>{jd.length.toLocaleString()} / {LIMITS.jobDescription.toLocaleString()}</span></div>
            <div className={`meter ${overJ ? 'over' : ''}`}><div style={{ width: `${Math.min(100, 100 * jd.length / LIMITS.jobDescription)}%` }} /></div>
          </div>
        </div>
        {over && <div className="banner warn" style={{ marginTop: 12 }}>One of the texts is over its limit. Trim the resume to the relevant sections, or the job post to its responsibilities and requirements.</div>}
        {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="actions">
          {health?.ollama !== 'connected' && <span className="small muted">The AI engine isn’t running yet; you can save now and continue later.</span>}
          <button className="btn primary" disabled={saving || over || !resume.trim() || !jd.trim()} onClick={save}>{saving ? <span className="spinner" /> : null}{app ? (changed ? 'Save and start over' : 'Save') : 'Save and continue'}</button>
        </div>
      </div>
    </>
  );
}

function guessTitle(jd: string) {
  const first = jd.split('\n').map(s => s.trim()).find(Boolean) ?? '';
  return first.length > 4 && first.length <= 80 ? first : '';
}
