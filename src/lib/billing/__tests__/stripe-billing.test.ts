/**
 * Unit tests for Stripe billing utilities.
 * Tests pure validation functions that don't require Stripe API access.
 */

import { describe, it, expect } from 'vitest';
import { validateMtuCount } from '@/lib/integrations/stripe/billing';

describe('validateMtuCount', () => {
  it('accepts a valid positive integer', () => {
    const result = validateMtuCount(500);
    expect(result.valid).toBe(true);
    expect(result.skip).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it('accepts zero but marks as skip', () => {
    const result = validateMtuCount(0);
    expect(result.valid).toBe(true);
    expect(result.skip).toBe(true);
  });

  it('rejects negative values', () => {
    const result = validateMtuCount(-1);
    expect(result.valid).toBe(false);
    expect(result.skip).toBe(true);
    expect(result.error).toContain('negative');
  });

  it('rejects non-integer values', () => {
    const result = validateMtuCount(1.5);
    expect(result.valid).toBe(false);
    expect(result.skip).toBe(true);
    expect(result.error).toContain('integer');
  });

  it('accepts large values but warns', () => {
    const result = validateMtuCount(20_000_000);
    expect(result.valid).toBe(true);
    expect(result.skip).toBe(false);
    expect(result.warning).toContain('Unusually high');
  });

  it('accepts values just below warning threshold without warning', () => {
    const result = validateMtuCount(10_000_000);
    expect(result.valid).toBe(true);
    expect(result.skip).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('accepts 1 (minimum billable)', () => {
    const result = validateMtuCount(1);
    expect(result.valid).toBe(true);
    expect(result.skip).toBe(false);
  });

  it('rejects NaN', () => {
    const result = validateMtuCount(NaN);
    expect(result.valid).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = validateMtuCount(Infinity);
    expect(result.valid).toBe(false);
  });
});
