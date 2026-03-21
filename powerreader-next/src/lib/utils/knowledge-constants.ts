/**
 * PowerReader - Knowledge Schema Constants
 *
 * Centralized constants for knowledge entry types and
 * validation limits. Used across UI, validation, and data processing.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/**
 * Character limits per type.
 * - Figure: title+period+background sum ≤120
 * - Issue: description ≤50, each stance ≤50
 * - Incident: title+date+description+keywords sum ≤120
 */
export const FIGURE_TOTAL_CHAR_LIMIT = 120;
export const ISSUE_DESC_CHAR_LIMIT = 50;
export const ISSUE_STANCE_CHAR_LIMIT = 50;
export const INCIDENT_TOTAL_CHAR_LIMIT = 120;

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
