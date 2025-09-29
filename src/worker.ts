import { Hono } from 'hono';
import { createSuccessResponse, createErrorResponse } from './responses';

// Define static UUIDs to be used for mocking different scenarios.
export const MOCK_UUIDS = {
  SUCCESS: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  NOT_FOUND: 'b2c3d4e5-f6a7-8901-2345-678901bcdefa',
  FORBIDDEN: 'c3d4e5f6-a7b8-9012-3456-789012cdefab',
};

const app = new Hono();

app.get('/notifications/dispatch/:dispatchId', (c) => {
  const { dispatchId } = c.req.param();

  switch (dispatchId) {
    case MOCK_UUIDS.SUCCESS:
      return createSuccessResponse(c, {
        dispatchId: dispatchId,
        status: 'SUCCEEDED',
        attempts: 1,
      });

    case MOCK_UUIDS.NOT_FOUND:
      return createErrorResponse(c, 'Dispatch not found.', 404, 'NOT_FOUND');

    case MOCK_UUIDS.FORBIDDEN:
      return createErrorResponse(c, 'User is not authorized to access this resource.', 403, 'FORBIDDEN');

    default:
      // Default behavior for any other UUID is 404
      return createErrorResponse(c, 'Dispatch not found.', 404, 'NOT_FOUND');
  }
});

// Export the app instance for testing and deployment
export { app };