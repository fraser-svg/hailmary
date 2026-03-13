import { describe, it, expect } from 'vitest';
import { makeSourceId, makeEvidenceId, makeRunId, slugify } from '../ids.js';

describe('makeSourceId', () => {
  it('formats with 3-digit zero-padded number', () => {
    expect(makeSourceId(1)).toBe('src_001');
    expect(makeSourceId(12)).toBe('src_012');
    expect(makeSourceId(123)).toBe('src_123');
  });

  it('handles numbers over 999', () => {
    expect(makeSourceId(1000)).toBe('src_1000');
  });
});

describe('makeEvidenceId', () => {
  it('formats with 3-digit zero-padded number', () => {
    expect(makeEvidenceId(1)).toBe('ev_001');
    expect(makeEvidenceId(42)).toBe('ev_042');
  });

  it('handles numbers over 999', () => {
    expect(makeEvidenceId(1234)).toBe('ev_1234');
  });
});

describe('makeRunId', () => {
  it('returns a valid UUID v4 format', () => {
    const id = makeRunId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const a = makeRunId();
    const b = makeRunId();
    expect(a).not.toBe(b);
  });
});

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces non-alphanumeric characters', () => {
    expect(slugify('Acme, Inc.')).toBe('acme-inc');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('collapses multiple non-alphanumeric chars into single hyphen', () => {
    expect(slugify('a   b___c')).toBe('a-b-c');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
