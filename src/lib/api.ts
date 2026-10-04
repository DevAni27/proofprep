export type Status = 'supported' | 'partially_supported' | 'not_evidenced' | 'requires_confirmation' | 'unverified';

export interface Source { id: string; text: string }
export interface Requirement {
  id: string; requirement: string; jobQuote: string; kind: 'skill' | 'personal_condition';
  status: Status; modelProposedStatus: Status | null; explanation: string; missingEvidence: string;
  confirmationPrompt?: string; evidenceIds: string[]; evidence: Source[]; reviewState: string; needsReview: boolean; reviewWarnings: string[];
}
export interface Analysis {
  analysis: { requirements: Requirement[]; requirementCoverage: string };
  warnings: string[];
  metrics: { version: string; model: string; elapsedMs: number; modelCalls: number; unverifiedAssessments: number; calls: { step: string; elapsedMs: number; failed?: boolean }[] };
}
export type Verdict = 'accepted' | 'rejected' | 'clarified';
export interface Decision { verdict: Verdict; note?: string; answer?: 'yes' | 'no' }
export interface Application {
  id: string; title: string; created_at: string; updated_at: string; resume: string; job_description: string;
  analysis: Analysis | null; decisions: Record<string, Decision>; stage: 'inputs' | 'review' | 'tailor' | 'practice';
  resumeVersions?: { id: string; created_at: string; text: string; note: string }[];
  sessions?: { id: string; created_at: string; updated_at: string; focus: { text: string; requirement: string } | null; turns: number }[];
}
export interface AppSummary { id: string; title: string; created_at: string; updated_at: string; stage: Application['stage']; analyzed: boolean; decided: number }
export interface Health { backend: string; ollama: 'connected' | 'unavailable'; analyzing?: boolean; message?: string; roles: { role: string; label: string; model: string; available: boolean }[] }

export class ApiError extends Error { constructor(message: string, public status: number, public detail?: string) { super(message); } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.detail);
  return data as T;
}

export const api = {
  health: () => call<Health>('/api/health'),
  list: () => call<{ applications: AppSummary[] }>('/api/applications').then(r => r.applications),
  get: (id: string) => call<Application>(`/api/applications/${id}`),
  create: (body: { title: string; resume: string; jobDescription: string }) => call<Application>('/api/applications', { method: 'POST', body: JSON.stringify(body) }),
  patch: (id: string, body: Partial<{ title: string; resume: string; jobDescription: string; decisions: Record<string, Decision>; stage: Application['stage'] }>) => call<Application>(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => call<{ ok: true }>(`/api/applications/${id}`, { method: 'DELETE' }),
  analyze: (id: string) => call<Application>(`/api/applications/${id}/analyze`, { method: 'POST' }),
  extract: (file: File) => new Promise<{ text: string; kind: string; pages?: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      call<{ text: string; kind: string; pages?: number }>('/api/extract', { method: 'POST', body: JSON.stringify({ name: file.name, mime: file.type, base64 }) }).then(resolve, reject);
    };
    reader.readAsDataURL(file);
  }),
};

export const LIMITS = { resume: 12000, jobDescription: 12000 };
export const STATUS_LABEL: Record<Status, string> = {
  supported: 'Evidence found', partially_supported: 'Partly shown', not_evidenced: 'Not on resume yet', requires_confirmation: 'Needs your answer', unverified: 'Needs your eyes',
};
export const STATUS_HELP: Record<Status, string> = {
  supported: 'A resume line states this. Read the highlighted words and confirm they prove it.',
  partially_supported: 'Part of this is on your resume; the card says what the line does not show.',
  not_evidenced: 'Your resume does not say this in words. That does not mean you lack the skill: add context if you have it.',
  requires_confirmation: 'A personal condition such as availability. Only you can answer it.',
  unverified: 'This one could not be matched automatically. Look at your resume and decide yourself.',
};

// Mastra workflow: one run per application, suspended at each human decision.
export interface WorkflowStatus { status: 'not_started' | 'running' | 'suspended' | 'success' | 'failed' | string; steps: Record<string, string>; suspended: { step: string; payload: Record<string, unknown> }[]; result?: unknown; error?: string | null }
export const workflow = {
  status: (id: string) => call<WorkflowStatus>(`/api/applications/${id}/workflow`),
  start: (id: string) => call<WorkflowStatus>(`/api/applications/${id}/workflow/start`, { method: 'POST' }),
  resume: (id: string, step: 'confirm-conditions' | 'review-evidence' | 'approve-edits', resumeData: unknown) => call<WorkflowStatus>(`/api/applications/${id}/workflow/resume`, { method: 'POST', body: JSON.stringify({ step, resumeData }) }),
};
export const WORKFLOW_STEPS: { id: string; label: string }[] = [{ id: 'analyze', label: 'Find evidence' }, { id: 'confirm-conditions', label: 'Confirm conditions' }, { id: 'review-evidence', label: 'Review evidence' }, { id: 'approve-edits', label: 'Approve edits' }];
