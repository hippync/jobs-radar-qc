export type JobLanguage = "fr" | "en";

/**
 * Lightweight, deterministic FR/EN classifier for job titles (issue #143).
 *
 * Frontend-only by design: the `active_qc_jobs` view the homepage queries
 * doesn't expose job description text (only title, company, location,
 * department, tech_stack, etc.), so this works from the title alone rather
 * than requiring a Supabase migration. Accuracy is intentionally
 * conservative — ambiguous or generic titles ("Manager", "Analyst", which
 * appear untranslated in both French and English QC job postings) are left
 * unclassified rather than guessed.
 */

const FRENCH_ACCENT_RE = /[àâäçéèêëîïôöûüùœ]/i;

// Job-title words with no ambiguous French cognate risk (i.e. not commonly
// borrowed into French postings, and spelled distinctly enough from their
// French counterparts to avoid accidental matches — e.g. "technician" vs
// "technicien").
const EN_ONLY_WORDS = [
  "engineer", "engineering", "developer", "specialist", "architect",
  "consultant", "coordinator", "administrator", "representative",
  "assistant", "associate", "officer", "scientist", "designer", "owner",
  "technician", "recruiter", "accountant", "supervisor", "advisor", "clerk",
];
const EN_WORD_RE = new RegExp(`\\b(${EN_ONLY_WORDS.join("|")})\\b`, "i");

// French job-title words that commonly appear without accents, spelled
// distinctly enough from their English counterpart to avoid false matches
// (e.g. "analyste" vs "analyst", "programmeur" vs "programmer").
const FR_UNACCENTED_WORDS = [
  "stagiaire", "adjoint", "adjointe", "analyste", "programmeur",
  "programmeuse", "responsable", "gestionnaire",
];
const FR_WORD_RE = new RegExp(`\\b(${FR_UNACCENTED_WORDS.join("|")})\\b`, "i");

export function detectLanguage(title: string): JobLanguage | null {
  if (FRENCH_ACCENT_RE.test(title)) return "fr";
  if (EN_WORD_RE.test(title)) return "en";
  if (FR_WORD_RE.test(title)) return "fr";
  return null;
}
