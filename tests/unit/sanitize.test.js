import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeObj } from '../../src/lib/sanitize';

describe('sanitize', () => {
  it('strips script tags', () => {
    expect(sanitize('<script>alert("xss")</script>')).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitize('<b>bold</b>')).toBe('bold');
    expect(sanitize('<a href="evil.com">click</a>')).toBe('click');
  });

  it('strips event handlers', () => {
    expect(sanitize('<div onclick="evil()">text</div>')).toBe('text');
    expect(sanitize('<img onerror="evil()" src="x">')).toBe('');
  });

  it('strips javascript: protocol', () => {
    expect(sanitize('<a href="javascript:evil()">link</a>')).toBe('link');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
    expect(sanitize(123)).toBe('');
  });

  it('preserves safe text', () => {
    expect(sanitize('Hello, patient!')).toBe('Hello, patient!');
    expect(sanitize('Follow-up in 2 weeks')).toBe('Follow-up in 2 weeks');
  });
});

describe('sanitizeObj', () => {
  it('sanitizes specified fields', () => {
    const obj = {
      name: '<script>alert(1)</script>John',
      comment: 'Great service! <b>thanks</b>',
      rating: 5,
    };
    const result = sanitizeObj(obj, ['name', 'comment']);
    expect(result.name).toBe('John');
    expect(result.comment).toBe('Great service! thanks');
    expect(result.rating).toBe(5);
  });

  it('returns the same object for non-object input', () => {
    expect(sanitizeObj(null, ['name'])).toBeNull();
    expect(sanitizeObj('string', ['name'])).toBe('string');
  });
});
