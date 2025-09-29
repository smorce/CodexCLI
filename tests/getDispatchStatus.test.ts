import { app, MOCK_UUIDS } from '../src/worker';
import { describe, it, expect } from 'vitest';

describe('GET /notifications/dispatch/{dispatchId}', () => {
  // Test case 1: Successful retrieval
  it('should return 200 OK with the dispatch status for a valid ID', async () => {
    const dispatchId = MOCK_UUIDS.SUCCESS;

    const req = new Request(`http://localhost/notifications/dispatch/${dispatchId}`, {
      method: 'GET',
    });
    const res = await app.request(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      dispatchId: dispatchId,
      status: 'SUCCEEDED',
      attempts: 1,
    });
  });

  // Test case 2: Not Found
  it('should return 404 Not Found with a standardized error response', async () => {
    const nonExistentId = MOCK_UUIDS.NOT_FOUND;
    const req = new Request(`http://localhost/notifications/dispatch/${nonExistentId}`, {
      method: 'GET',
    });
    const res = await app.request(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Dispatch not found.');
    expect(body.traceId).toBeDefined();
  });

  // Test case 3: Forbidden
  it('should return 403 Forbidden with a standardized error response', async () => {
    const forbiddenId = MOCK_UUIDS.FORBIDDEN;
    const req = new Request(`http://localhost/notifications/dispatch/${forbiddenId}`, {
      method: 'GET',
    });
    const res = await app.request(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toBe('User is not authorized to access this resource.');
    expect(body.traceId).toBeDefined();
  });
});