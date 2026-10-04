import { DEFAULT_MODEL } from './analysis.mjs';
export const OLLAMA_URL = () => process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
export const EVIDENCE_MODEL = () => process.env.OLLAMA_MODEL || DEFAULT_MODEL;
export const INTERVIEW_MODEL = () => process.env.INTERVIEW_MODEL || 'gemma3:4b';
