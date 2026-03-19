/**
 * PowerReader - Knowledge Schema Constants
 *
 * Centralized constants for knowledge entry types, source types,
 * and validation limits. Used across UI, validation, and data processing.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/** Knowledge entry categories — new names with backward compat aliases */
export const KNOWLEDGE_CATEGORIES = {
  FIGURE: 'figure',        // 政治人物（原 politician）
  ISSUE: 'issue',          // 國家議題（原 topic）
  INCIDENT: 'incident',    // 社會事件（原 event）
  MEDIA: 'media',          // 媒體（保留，未使用）
  TERM: 'term',            // 名詞（保留，未使用）
} as const;

/** Legacy type names mapped to new names */
export const LEGACY_TYPE_MAP: Record<string, string> = {
  politician: 'figure',
  topic: 'issue',
  event: 'incident',
};

/** Reverse map: new type → legacy type (for ID prefix lookup) */
export const NEW_TO_LEGACY_MAP: Record<string, string> = {
  figure: 'politician',
  issue: 'topic',
  incident: 'event',
};

/** Source type for knowledge entries */
export const SOURCE_TYPES = {
  AI: 'ai',
  HUMAN: 'human',
  COMMUNITY: 'community',
} as const;

/** Character limit per structured sub-field */
export const FIELD_CHAR_LIMIT = 120;

/** Valid source type values */
export const VALID_SOURCE_TYPES = ['ai', 'human', 'community'] as const;

/** Valid party values */
export const VALID_PARTIES = ['KMT', 'DPP', 'TPP', 'NPP', 'TSP'] as const;

/**
 * Check if a type string is a "figure" type (new or legacy name).
 */
export function isFigureType(type: string): boolean {
  return type === 'figure' || type === 'politician';
}

/**
 * Check if a type string is an "issue" type (new or legacy name).
 */
export function isIssueType(type: string): boolean {
  return type === 'issue' || type === 'topic';
}

/**
 * Check if a type string is an "incident" type (new or legacy name).
 */
export function isIncidentType(type: string): boolean {
  return type === 'incident' || type === 'event';
}

/**
 * Normalize legacy type names to new type names.
 * Returns the input unchanged if already a new name or unknown.
 */
export function normalizeType(type: string): string {
  return LEGACY_TYPE_MAP[type] || type;
}
