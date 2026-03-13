import { describe, it, expect } from 'vitest';
import { isValidConfidence, CONFIDENCE_VALUES } from '../enums.js';

describe('CONFIDENCE_VALUES', () => {
  it('contains exactly low, medium, high', () => {
    expect([...CONFIDENCE_VALUES]).toEqual(['low', 'medium', 'high']);
  });
});

describe('isValidConfidence', () => {
  it('returns true for valid values', () => {
    expect(isValidConfidence('low')).toBe(true);
    expect(isValidConfidence('medium')).toBe(true);
    expect(isValidConfidence('high')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidConfidence('none')).toBe(false);
    expect(isValidConfidence('very_high')).toBe(false);
    expect(isValidConfidence('')).toBe(false);
    expect(isValidConfidence('LOW')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isValidConfidence(null)).toBe(false);
    expect(isValidConfidence(undefined)).toBe(false);
    expect(isValidConfidence(42)).toBe(false);
    expect(isValidConfidence(true)).toBe(false);
  });
});
