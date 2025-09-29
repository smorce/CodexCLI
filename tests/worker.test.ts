import { describe, it, expect, beforeEach } from 'vitest';
import worker, { _resetStateForTests } from '../src/worker';

describe('GET /universe/top10', () => {
  it('should return the top 10 universe snapshot according to the OpenAPI spec', async () => {
    const req = new Request('http://localhost/universe/top10', { method: 'GET' });
    const res = await worker.fetch(req);

    expect(res.status).toBe(200);

    const json = await res.json();

    // Validate the overall structure
    expect(json).toHaveProperty('data');
    expect(json).toHaveProperty('meta');

    // Validate the 'data' array
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(10);

    // Validate the structure of a single item in 'data'
    const sampleItem = json.data[0];
    expect(sampleItem).toHaveProperty('symbol');
    expect(sampleItem).toHaveProperty('name');
    expect(sampleItem).toHaveProperty('marketCap');
    expect(sampleItem).toHaveProperty('sector');

    // Validate the 'meta' object
    expect(json.meta).toHaveProperty('asOf');
    expect(json.meta).toHaveProperty('source');
    expect(json.meta).toHaveProperty('checksum');
  });
});

describe('POST /universe/sync', () => {
  beforeEach(() => {
    _resetStateForTests();
  });

  it('should accept the sync request and return a 202 status for an authorized user', async () => {
    const req = new Request('http://localhost/universe/sync', {
      method: 'POST',
      headers: { 'X-Test-Auth-Role': 'Admin' }, // Simulate an authorized user
    });
    // In a real scenario, this request would contain an Authorization header
    // that a middleware would validate to grant access.
    const res = await worker.fetch(req);

    expect(res.status).toBe(202);

    const json = await res.json();

    expect(json).toHaveProperty('syncJobId');
    expect(typeof json.syncJobId).toBe('string');
    expect(json).toHaveProperty('status', 'QUEUED');
    expect(json).toHaveProperty('acceptedAt');
  });

  it('should return 403 Forbidden for a user without the required role', async () => {
    // This test will initially fail because the endpoint returns 202 for all requests.
    // This failure drives the implementation of authorization logic.
    const req = new Request('http://localhost/universe/sync', { method: 'POST' });
    const res = await worker.fetch(req);

    expect(res.status).toBe(403);
  });

  it('should return 409 Conflict if a sync job is already running', async () => {
    // This test drives the implementation of state management for sync jobs.
    const authorizedRequest = new Request('http://localhost/universe/sync', {
      method: 'POST',
      headers: { 'X-Test-Auth-Role': 'Admin' },
    });

    // First request should succeed
    const res1 = await worker.fetch(authorizedRequest.clone());
    expect(res1.status).toBe(202);

    // Second request should fail with a conflict
    const res2 = await worker.fetch(authorizedRequest.clone());
    expect(res2.status).toBe(409);
  });
});

describe('GET /universe/sync/{syncJobId}', () => {
  beforeEach(() => {
    _resetStateForTests();
  });

  it('should return the status of a sync job', async () => {
    // Step 1: Create a sync job to get a valid ID
    const postReq = new Request('http://localhost/universe/sync', {
      method: 'POST',
      headers: { 'X-Test-Auth-Role': 'Admin' },
    });
    const postRes = await worker.fetch(postReq);
    const { syncJobId } = await postRes.json();

    // Step 2: Fetch the status of the created job
    const getReq = new Request(`http://localhost/universe/sync/${syncJobId}`, { method: 'GET' });
    const getRes = await worker.fetch(getReq);

    expect(getRes.status).toBe(200);

    const json = await getRes.json();
    expect(json.syncJobId).toBe(syncJobId);
    expect(json).toHaveProperty('status');
    expect(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']).toContain(json.status);
    expect(json).toHaveProperty('startedAt');
  });

  it('should return 404 Not Found for a non-existent sync job ID', async () => {
    const nonExistentId = crypto.randomUUID();
    const getReq = new Request(`http://localhost/universe/sync/${nonExistentId}`, { method: 'GET' });
    const getRes = await worker.fetch(getReq);

    expect(getRes.status).toBe(404);
  });
});