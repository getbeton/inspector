/**
 * Unit tests for billing cycle date calculation utilities.
 * Tests pure functions that don't require database access.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCycleEndDate,
  getDaysBetween,
  isDateInCycle,
} from '@/lib/billing/cycle-service';

describe('calculateCycleEndDate', () => {
  it('calculates end date exactly 1 month later for mid-month dates', () => {
    const start = new Date(2025, 0, 18); // Jan 18
    const end = calculateCycleEndDate(start);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(18);
  });

  it('clamps to last day of shorter month (Jan 31 → Feb 28)', () => {
    const start = new Date(2025, 0, 31); // Jan 31
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(28); // 2025 is not a leap year
  });

  it('handles leap year (Jan 31 → Feb 29)', () => {
    const start = new Date(2024, 0, 31); // Jan 31, 2024 (leap year)
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(29);
  });

  it('handles Feb 28 in non-leap year → Mar 28', () => {
    const start = new Date(2025, 1, 28); // Feb 28
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(2); // Mar
    expect(end.getDate()).toBe(28);
  });

  it('handles Feb 29 in leap year → Mar 29', () => {
    const start = new Date(2024, 1, 29); // Feb 29, 2024
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(2); // Mar
    expect(end.getDate()).toBe(29);
  });

  it('handles year rollover (Dec 15 → Jan 15)', () => {
    const start = new Date(2025, 11, 15); // Dec 15
    const end = calculateCycleEndDate(start);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0); // Jan
    expect(end.getDate()).toBe(15);
  });

  it('handles Dec 31 → Jan 31', () => {
    const start = new Date(2025, 11, 31); // Dec 31
    const end = calculateCycleEndDate(start);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0); // Jan
    expect(end.getDate()).toBe(31);
  });

  it('handles first of month (Mar 1 → Apr 1)', () => {
    const start = new Date(2025, 2, 1); // Mar 1
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(3); // Apr
    expect(end.getDate()).toBe(1);
  });

  it('handles Mar 31 → Apr 30 (shorter target month)', () => {
    const start = new Date(2025, 2, 31); // Mar 31
    const end = calculateCycleEndDate(start);
    expect(end.getMonth()).toBe(3); // Apr
    expect(end.getDate()).toBe(30); // Apr has 30 days
  });
});

describe('getDaysBetween', () => {
  it('returns 0 for the same date', () => {
    const date = new Date(2025, 0, 15);
    expect(getDaysBetween(date, date)).toBe(0);
  });

  it('returns correct days for a normal range', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 31);
    expect(getDaysBetween(start, end)).toBe(30);
  });

  it('returns negative for reversed dates', () => {
    const start = new Date(2025, 0, 31);
    const end = new Date(2025, 0, 1);
    expect(getDaysBetween(start, end)).toBe(-30);
  });

  it('handles month boundaries', () => {
    const start = new Date(2025, 0, 28);
    const end = new Date(2025, 1, 3);
    expect(getDaysBetween(start, end)).toBe(6);
  });

  it('handles year boundaries', () => {
    const start = new Date(2025, 11, 30);
    const end = new Date(2026, 0, 2);
    expect(getDaysBetween(start, end)).toBe(3);
  });
});

describe('isDateInCycle', () => {
  const cycle = {
    start: new Date(2025, 0, 15), // Jan 15
    end: new Date(2025, 1, 15),   // Feb 15
  };

  it('returns true for a date within the cycle', () => {
    expect(isDateInCycle(new Date(2025, 0, 20), cycle)).toBe(true);
  });

  it('returns true for the start date (inclusive)', () => {
    expect(isDateInCycle(new Date(2025, 0, 15), cycle)).toBe(true);
  });

  it('returns false for the end date (exclusive)', () => {
    expect(isDateInCycle(new Date(2025, 1, 15), cycle)).toBe(false);
  });

  it('returns false for a date before the cycle', () => {
    expect(isDateInCycle(new Date(2025, 0, 14), cycle)).toBe(false);
  });

  it('returns false for a date after the cycle', () => {
    expect(isDateInCycle(new Date(2025, 1, 16), cycle)).toBe(false);
  });
});
