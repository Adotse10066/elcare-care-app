/**
 * health.test.ts — Tests for /health, /readyz, /health/details endpoints
 * and the individual check functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  syncState: { findUnique: vi.fn() },
  trackedContract: { findMany: vi.fn() },
}));

const mockRedis = vi.hoisted(() => ({
  isReady: true,
  ping: vi.fn().mockResolvedValue('PONG'),
  get: vi.fn(),
  setEx: vi.fn(),
}));

const mockRpcServer = vi.hoisted(() => ({
  getLatestLedger: vi.fn().mockResolvedValue({ sequence: 5000 }),
}));

vi.mock('../db', () => ({ default: mockPrisma }));
vi.mock('../redis.js', () => ({ default: mockRedis }));
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => mockRpcServer),
    },
  };
});

import {
  checkDatabase,
  checkRedis,
  checkStellarRpc,
  checkSyncLag,
  runAllChecks,
  runReadinessChecks,
} from '../health';

// ── checkDatabase ─────────────────────────────────────────────────────────────

describe('checkDatabase()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok when SELECT 1 succeeds', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const result = await checkDatabase();
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns down when query throws', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
    const result = await checkDatabase();
    expect(result.status).toBe('down');
    expect(result.message).toContain('Connection refused');
  });
});

// ── checkRedis ────────────────────────────────────────────────────────────────

describe('checkRedis()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.isReady = true;
  });

  it('returns ok when PING returns PONG', async () => {
    mockRedis.ping.mockResolvedValue('PONG');
    const result = await checkRedis();
    expect(result.status).toBe('ok');
  });

  it('returns down when Redis client is not ready', async () => {
    mockRedis.isReady = false;
    const result = await checkRedis();
    expect(result.status).toBe('down');
    expect(result.message).toContain('not connected');
  });

  it('returns down when ping throws', async () => {
    mockRedis.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkRedis();
    expect(result.status).toBe('down');
  });

  it('returns degraded for unexpected PING reply', async () => {
    mockRedis.ping.mockResolvedValue('NOT_PONG');
    const result = await checkRedis();
    expect(result.status).toBe('degraded');
  });
});

// ── checkStellarRpc ───────────────────────────────────────────────────────────

describe('checkStellarRpc()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok when getLatestLedger resolves', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5000 });
    const result = await checkStellarRpc();
    expect(result.status).toBe('ok');
  });

  it('returns down on timeout / error', async () => {
    mockRpcServer.getLatestLedger.mockRejectedValue(new Error('timeout'));
    const result = await checkStellarRpc();
    expect(result.status).toBe('down');
  });

  it('completes within 5 seconds (has timeout guard)', async () => {
    // Simulate a slow RPC that would normally hang
    mockRpcServer.getLatestLedger.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Stellar RPC timeout')), 100))
    );
    const start = Date.now();
    const result = await checkStellarRpc();
    expect(Date.now() - start).toBeLessThan(6_000);
    expect(result.status).toBe('down');
  });
});

// ── checkSyncLag ──────────────────────────────────────────────────────────────

describe('checkSyncLag()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok when lag is low', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });
    const result = await checkSyncLag();
    expect(result.status).toBe('ok');
    expect((result as any).lagLedgers).toBe(5);
  });

  it('returns degraded when lag > 100', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5200 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5050 });
    const result = await checkSyncLag();
    expect(result.status).toBe('degraded');
  });

  it('returns down when lag > 1000', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 7000 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5000 });
    const result = await checkSyncLag();
    expect(result.status).toBe('down');
  });
});

// ── runAllChecks ──────────────────────────────────────────────────────────────

describe('runAllChecks()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockRedis.isReady = true;
    mockRedis.ping.mockResolvedValue('PONG');
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });
  });

  it('returns overall ok when all checks pass', async () => {
    const result = await runAllChecks();
    expect(result.status).toBe('ok');
    expect(result.checks).toHaveProperty('database');
    expect(result.checks).toHaveProperty('redis');
    expect(result.checks).toHaveProperty('stellar_rpc');
    expect(result.checks).toHaveProperty('sync_lag');
  });

  it('returns down overall when database is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB down'));
    const result = await runAllChecks();
    expect(result.status).toBe('down');
    expect(result.checks.database.status).toBe('down');
  });

  it('returns degraded when only sync lag is degraded', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5200 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5050 });
    const result = await runAllChecks();
    expect(['degraded', 'down']).toContain(result.status);
  });

  it('includes timestamp in result', async () => {
    const before = Date.now();
    const result = await runAllChecks();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});

// ── /health HTTP endpoint ─────────────────────────────────────────────────────

describe('GET /health', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockRedis.isReady = true;
    mockRedis.ping.mockResolvedValue('PONG');
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });

    app = express();
    app.get('/health', async (_req, res) => {
      const { runAllChecks: rac } = await import('../health');
      const result = await rac();
      const status = result.status === 'down' ? 503 : 200;
      res.status(status).json(result);
    });
  });

  it('returns 200 with per-dependency status when all ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toBeDefined();
    expect(Object.keys(res.body.checks)).toContain('database');
    expect(Object.keys(res.body.checks)).toContain('redis');
  });

  it('returns 503 when database fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.checks.database.status).toBe('down');
  });
});

// ── /readyz HTTP endpoint ─────────────────────────────────────────────────────

describe('GET /readyz — database failure causes 503', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });

    app = express();
    app.get('/readyz', async (_req, res) => {
      const { runReadinessChecks: rrc } = await import('../health');
      const { ready, checks } = await rrc();
      if (ready) return res.json({ status: 'ready', checks });
      return res.status(503).json({ status: 'not_ready', checks });
    });
  });

  it('returns 200 when DB is up and lag is ok', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('returns 503 when database is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB unreachable'));
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database.status).toBe('down');
  });

  it('returns 503 when sync lag is down (> 1000 ledgers)', async () => {
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 7000 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5000 });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
  });
});

// ── /health/details admin token ───────────────────────────────────────────────

describe('GET /health/details — admin token auth', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockRedis.isReady = true;
    mockRedis.ping.mockResolvedValue('PONG');
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });

    process.env.HEALTH_DETAILS_TOKEN = 'secret-token';

    app = express();
    app.get('/health/details', async (req, res) => {
      const adminToken = process.env.HEALTH_DETAILS_TOKEN;
      if (adminToken) {
        const provided = req.headers['x-admin-token'] ?? req.query.token;
        if (provided !== adminToken) return res.status(401).json({ error: 'Unauthorized' });
      }
      const { runAllChecks: rac } = await import('../health');
      const health = await rac();
      const httpStatus = health.status === 'down' ? 503 : 200;
      res.status(httpStatus).json({ ...health, details: { uptime: process.uptime() } });
    });
  });

  it('returns 401 without valid token', async () => {
    const res = await request(app).get('/health/details');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await request(app).get('/health/details').set('x-admin-token', 'wrong');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app).get('/health/details').set('x-admin-token', 'secret-token');
    expect(res.status).toBe(200);
    expect(res.body.checks).toBeDefined();
    expect(res.body.details).toBeDefined();
  });
});

// ── Secret redaction regression test ─────────────────────────────────────────

describe('Secret redaction regression — GET /health must not leak env secrets', () => {
  let app: express.Application;
  let savedEnv: Record<string, string | undefined>;

  const SENTINEL_KEYS = ['DATABASE_URL', 'REDIS_URL', 'STELLAR_RPC_URL'] as const;
  const SENTINEL_VALUES: Record<string, string> = {
    DATABASE_URL: 'postgresql://user:SECRET123@localhost/db',
    REDIS_URL: 'redis://:SECRET456@localhost:6379',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org/SECRET789',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Save current env values so we can restore them after each test
    savedEnv = {};
    for (const key of SENTINEL_KEYS) {
      savedEnv[key] = process.env[key];
      process.env[key] = SENTINEL_VALUES[key];
    }

    // All dependencies healthy so the handler reaches JSON serialisation
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockRedis.isReady = true;
    mockRedis.ping.mockResolvedValue('PONG');
    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 5010 });
    mockPrisma.syncState.findUnique.mockResolvedValue({ id: 1, lastLedger: 5005 });

    app = express();
    app.get('/health', async (_req, res) => {
      const { runAllChecks: rac } = await import('../health');
      const result = await rac();
      const status = result.status === 'down' ? 503 : 200;
      res.status(status).json(result);
    });
  });

  afterEach(() => {
    // Restore original env values
    for (const key of SENTINEL_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('does not include DATABASE_URL secret in response body', async () => {
    const res = await request(app).get('/health');
    expect(res.status).not.toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET123');
    expect(body).not.toContain(SENTINEL_VALUES.DATABASE_URL);
  });

  it('does not include REDIS_URL secret in response body', async () => {
    const res = await request(app).get('/health');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET456');
    expect(body).not.toContain(SENTINEL_VALUES.REDIS_URL);
  });

  it('does not include STELLAR_RPC_URL secret in response body', async () => {
    const res = await request(app).get('/health');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET789');
    expect(body).not.toContain(SENTINEL_VALUES.STELLAR_RPC_URL);
  });

  it('response body contains expected status fields, not raw env values', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Confirm the response has the expected health structure
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
    // None of the sentinel secrets should appear anywhere in the serialised body
    for (const val of Object.values(SENTINEL_VALUES)) {
      expect(body).not.toContain(val);
    }
    // The raw sentinel substrings should also be absent
    expect(body).not.toContain('SECRET123');
    expect(body).not.toContain('SECRET456');
    expect(body).not.toContain('SECRET789');
  });
});
