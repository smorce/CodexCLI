import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { portfolio } from '../../src/routes/portfolio';
import { PrismaClient, JobStatus, JobType } from '@prisma/client';
import { queueService } from '../../src/services/queueService';

// Mock the PrismaClient
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal();
  const mockPrismaClient = {
    optimization_jobs: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  return { ...actual, PrismaClient: vi.fn(() => mockPrismaClient) };
});

// We need a reference to the mocked prisma instance
const prismaMock = new PrismaClient();
// Spy on the singleton queue service
const queueServiceSpy = vi.spyOn(queueService, 'publish');

describe('POST /portfolio/efficient-frontier', () => {
  const app = new Hono().route('/portfolio', portfolio);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a job and publish its ID to the queue', async () => {
    const mockJobId = 'job-1';
    (prismaMock.optimization_jobs.create as any).mockResolvedValue({ id: mockJobId });
    const validPayload = { tickers: ['AAPL', 'GOOG'], steps: 20 };

    const req = new Request('http://localhost/portfolio/efficient-frontier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await app.request(req);
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.job_id).toBe(mockJobId);

    // Assert that the job ID was published to the queue
    expect(queueServiceSpy).toHaveBeenCalledWith(
      'optimization_jobs_queue',
      { jobId: mockJobId }
    );
  });
});

// Simplified tests for other endpoints for brevity
describe('Other Endpoints', () => {
  const app = new Hono().route('/portfolio', portfolio);
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET /jobs/:jobId should return 404 if job not found', async () => {
    (prismaMock.optimization_jobs.findUnique as any).mockResolvedValue(null);
    const req = new Request('http://localhost/portfolio/jobs/not-found');
    const res = await app.request(req);
    expect(res.status).toBe(404);
  });
});