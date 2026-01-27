/**
 * Circuit Breaker Tests
 *
 * Tests for circuit breaker pattern implementation
 * including state transitions, failure tracking, and recovery.
 *
 * @module lib/__tests__/circuit-breaker.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError, type CircuitBreakerConfig } from '../circuit-breaker';

// ===========================================
// Test Configuration
// ===========================================

const defaultConfig: CircuitBreakerConfig = {
  name: 'test-service',
  failureThreshold: 3,
  resetTimeoutMs: 1000,
  monitorWindowMs: 5000,
  halfOpenMaxAttempts: 2,
};

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================
// Initial State Tests
// ===========================================

describe('CircuitBreaker initial state', () => {
  it('starts in CLOSED state', () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const stats = breaker.getStats();

    expect(stats.state).toBe('CLOSED');
    expect(stats.failures).toBe(0);
    expect(stats.successes).toBe(0);
  });

  it('stores configuration', () => {
    const breaker = new CircuitBreaker(defaultConfig);

    expect(breaker.getName()).toBe('test-service');
  });
});

// ===========================================
// execute Tests - Success Path
// ===========================================

describe('CircuitBreaker.execute - success path', () => {
  it('executes function successfully in CLOSED state', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const fn = vi.fn().mockResolvedValue('success');

    const result = await breaker.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tracks successful calls', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const fn = vi.fn().mockResolvedValue('ok');

    await breaker.execute(fn);
    await breaker.execute(fn);
    await breaker.execute(fn);

    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.totalFailures).toBe(0);
  });

  it('maintains failure count until monitor window expires', async () => {
    const breaker = new CircuitBreaker(defaultConfig);

    // 2 failures (below threshold)
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    // 1 success - does not reset failures (they age out via monitor window)
    await breaker.execute(() => Promise.resolve('ok'));

    const stats = breaker.getStats();
    // Failures still in the window
    expect(stats.failures).toBe(2);
    expect(stats.state).toBe('CLOSED');
  });
});

// ===========================================
// execute Tests - Failure Path
// ===========================================

describe('CircuitBreaker.execute - failure path', () => {
  it('tracks failures in CLOSED state', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const fn = vi.fn().mockRejectedValue(new Error('service error'));

    await expect(breaker.execute(fn)).rejects.toThrow('service error');

    const stats = breaker.getStats();
    expect(stats.failures).toBe(1);
    expect(stats.state).toBe('CLOSED');
  });

  it('opens circuit after failure threshold', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trigger 3 failures (threshold)
    await expect(breaker.execute(fn)).rejects.toThrow();
    await expect(breaker.execute(fn)).rejects.toThrow();
    await expect(breaker.execute(fn)).rejects.toThrow();

    const stats = breaker.getStats();
    expect(stats.state).toBe('OPEN');
  });

  it('rejects immediately in OPEN state', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    // New call should be rejected immediately
    const successFn = vi.fn().mockResolvedValue('success');
    await expect(breaker.execute(successFn)).rejects.toThrow(CircuitOpenError);

    // Function should not have been called
    expect(successFn).not.toHaveBeenCalled();
  });
});

// ===========================================
// CircuitOpenError Tests
// ===========================================

describe('CircuitOpenError', () => {
  it('contains circuit name', () => {
    const error = new CircuitOpenError('api-service', 5000);

    expect(error.circuitName).toBe('api-service');
    expect(error.message).toContain('api-service');
  });

  it('contains retry after time', () => {
    const error = new CircuitOpenError('api-service', 5000);

    expect(error.retryAfterMs).toBe(5000);
    expect(error.message).toContain('5000');
  });

  it('has correct error name', () => {
    const error = new CircuitOpenError('test', 1000);

    expect(error.name).toBe('CircuitOpenError');
  });
});

// ===========================================
// State Transition Tests
// ===========================================

describe('CircuitBreaker state transitions', () => {
  it('transitions from OPEN to HALF_OPEN after timeout', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    expect(breaker.getStats().state).toBe('OPEN');

    // Advance time past reset timeout
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

    // Next call should transition to HALF_OPEN
    const successFn = vi.fn().mockResolvedValue('ok');
    await breaker.execute(successFn);

    // State depends on implementation - check it moved from OPEN
    const stats = breaker.getStats();
    expect(['HALF_OPEN', 'CLOSED']).toContain(stats.state);
  });

  it('transitions from HALF_OPEN to CLOSED after successes', async () => {
    const breaker = new CircuitBreaker({
      ...defaultConfig,
      halfOpenMaxAttempts: 2,
    });
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    // Advance time
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

    // Successful calls should close circuit
    const successFn = vi.fn().mockResolvedValue('ok');
    await breaker.execute(successFn);
    await breaker.execute(successFn);

    const stats = breaker.getStats();
    expect(stats.state).toBe('CLOSED');
  });

  it('transitions from HALF_OPEN back to OPEN on failure', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    // Advance time to allow HALF_OPEN
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

    // Fail in HALF_OPEN state
    await expect(breaker.execute(failFn)).rejects.toThrow('fail');

    const stats = breaker.getStats();
    expect(stats.state).toBe('OPEN');
  });
});

// ===========================================
// Monitor Window Tests
// ===========================================

describe('CircuitBreaker monitor window', () => {
  it('only counts failures within window', async () => {
    const breaker = new CircuitBreaker({
      ...defaultConfig,
      monitorWindowMs: 2000,
    });
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // 2 failures
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    // Wait for failures to expire
    vi.advanceTimersByTime(2500);

    // This should be failure #1 (not #3)
    await expect(breaker.execute(failFn)).rejects.toThrow();

    const stats = breaker.getStats();
    expect(stats.state).toBe('CLOSED'); // Should not open (only 1 failure in window)
  });
});

// ===========================================
// getStats Tests
// ===========================================

describe('CircuitBreaker.getStats', () => {
  it('returns complete statistics', async () => {
    const breaker = new CircuitBreaker(defaultConfig);

    await breaker.execute(() => Promise.resolve('ok'));
    await expect(breaker.execute(() => Promise.reject(new Error()))).rejects.toThrow();

    const stats = breaker.getStats();

    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failures');
    expect(stats).toHaveProperty('successes');
    expect(stats).toHaveProperty('totalRequests');
    expect(stats).toHaveProperty('totalFailures');
    expect(stats).toHaveProperty('lastStateChange');
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalFailures).toBe(1);
  });

  it('tracks last failure time', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const now = new Date();
    vi.setSystemTime(now);

    await expect(breaker.execute(() => Promise.reject(new Error()))).rejects.toThrow();

    const stats = breaker.getStats();
    expect(stats.lastFailure).toEqual(now);
  });
});

// ===========================================
// Concurrent Execution Tests
// ===========================================

describe('CircuitBreaker concurrent execution', () => {
  it('handles concurrent requests correctly', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) {
        throw new Error('fail');
      }
      return 'success';
    });

    // Fire multiple concurrent requests
    const promises = [
      breaker.execute(fn).catch(() => 'failed'),
      breaker.execute(fn).catch(() => 'failed'),
      breaker.execute(fn).catch(() => 'failed'),
    ];

    const results = await Promise.all(promises);

    // All should have been attempted
    expect(results.filter(r => r === 'failed')).toHaveLength(3);
  });
});

// ===========================================
// forceClose Tests
// ===========================================

describe('CircuitBreaker.forceClose', () => {
  it('resets circuit to CLOSED state', async () => {
    const breaker = new CircuitBreaker(defaultConfig);
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    expect(breaker.getStats().state).toBe('OPEN');

    // Manual reset via forceClose
    breaker.forceClose();

    const stats = breaker.getStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.failures).toBe(0);
  });
});
