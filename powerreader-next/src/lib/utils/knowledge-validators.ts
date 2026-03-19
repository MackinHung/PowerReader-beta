/**
 * PowerReader - Knowledge Entry Validators
 *
 * Client-side validation for knowledge entries with type-specific rules
 * and 120-character field limits.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import {
  FIELD_CHAR_LIMIT,
  VALID_SOURCE_TYPES,
  VALID_PARTIES,
  isFigureType,
  isIssueType,
  isIncidentType,
} from './knowledge-constants.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function checkCharLimit(value: unknown, fieldName: string, errors: string[]): void {
  if (typeof value === 'string' && value.length > FIELD_CHAR_LIMIT) {
    errors.push(`${fieldName} exceeds ${FIELD_CHAR_LIMIT} chars`);
  }
}

/**
 * Validate a knowledge entry with type-specific rules.
 */
export function validateKnowledge(entry: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Common required fields
  if (!isNonEmptyString(entry.id)) errors.push('id is required');
  if (!isNonEmptyString(entry.title)) errors.push('title is required');

  const type = entry.type as string;

  // Type-specific validation
  if (isFigureType(type)) {
    checkCharLimit(entry.period, 'period', errors);
    checkCharLimit(entry.background, 'background', errors);
    checkCharLimit(entry.experience, 'experience', errors);
    if (entry.party && !VALID_PARTIES.includes(entry.party as typeof VALID_PARTIES[number])) {
      errors.push('invalid party');
    }
  } else if (isIssueType(type)) {
    checkCharLimit(entry.description, 'description', errors);
    if (entry.stances && typeof entry.stances === 'object') {
      const stances = entry.stances as Record<string, unknown>;
      for (const [party, text] of Object.entries(stances)) {
        if (typeof text === 'string' && text.length > FIELD_CHAR_LIMIT) {
          errors.push(`stance ${party} exceeds ${FIELD_CHAR_LIMIT} chars`);
        }
      }
    }
  } else if (isIncidentType(type)) {
    checkCharLimit(entry.description, 'description', errors);
    if (entry.keywords && !Array.isArray(entry.keywords)) {
      errors.push('keywords must be array');
    }
    if (entry.date && typeof entry.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      errors.push('date must be ISO format (YYYY-MM-DD)');
    }
  }

  // source_type validation (optional — only present on new entries)
  if (entry.source_type != null) {
    if (!VALID_SOURCE_TYPES.includes(entry.source_type as typeof VALID_SOURCE_TYPES[number])) {
      errors.push('invalid source_type');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a report reason string.
 */
export function validateReportReason(reason: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isNonEmptyString(reason)) {
    errors.push('reason is required');
  } else if ((reason as string).length > 200) {
    errors.push('reason exceeds 200 chars');
  }
  return { valid: errors.length === 0, errors };
}
