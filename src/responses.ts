import { Context } from 'hono';

// As per OpenAPI spec for ErrorResponse
interface ErrorResponseBody {
  code: string;
  message: string;
  traceId: string;
}

// As per OpenAPI spec for DispatchStatus
interface SuccessResponseBody {
  dispatchId: string;
  status: 'QUEUED' | 'DELIVERING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  // other fields can be added later as per the full spec
}

/**
 * Creates a standardized success JSON response.
 * @param c - The Hono context object.
 * @param data - The payload for the response.
 * @param status - The HTTP status code.
 * @returns A Response object.
 */
export function createSuccessResponse(
  c: Context,
  data: SuccessResponseBody,
  status: number = 200
) {
  return c.json(data, status);
}

/**
 * Creates a standardized error JSON response.
 * @param c - The Hono context object.
 * @param message - The error message.
 * @param statusCode - The HTTP status code.
 * @param errorCode - A machine-readable error code.
 * @returns A Response object.
 */
export function createErrorResponse(
  c: Context,
  message: string,
  statusCode: number,
  errorCode: string,
) {
  // In a real app, the traceId would come from a request context/header.
  const traceId = c.req.header('x-trace-id') || 'mock-trace-id';

  const errorBody: ErrorResponseBody = {
    code: errorCode,
    message,
    traceId,
  };

  return c.json(errorBody, statusCode);
}