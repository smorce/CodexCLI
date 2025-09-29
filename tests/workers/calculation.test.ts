import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalculationWorker } from '../../src/workers/calculation';
import { MarketDataApiClient } from '../../src/clients/marketDataApiClient';
import { QueueService } from '../../src/services/queueService';
import { MetricsService } from '../../src/services/metricsService';
import { MetricNames } from '../../src/core/metrics'; // Import the constants

// Mock dependencies
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal();
  const mockPrismaClient = {
    optimization_jobs: { findUnique: vi.fn(), update: vi.fn() },
    optimization_results: { create: vi.fn() },
  };
  return { ...actual, PrismaClient: vi.fn(() => mockPrismaClient) };
});
vi.mock('../../src/clients/marketDataApiClient');
vi.mock('../../src/services/queueService');
vi.mock('../../src/services/metricsService');
vi.mock('../../src/wasm/calculator', () => ({
  calculateEfficientFrontier: vi.fn(),
}));

describe('CalculationWorker', () => {
  let worker: CalculationWorker;
  let mockPrisma: any;
  let mockMarketDataApi: any;
  let mockQueueService: any;
  let mockMetricsService: any;
  let JobStatus: any;
  let JobType: any;

  beforeEach(async () => {
    const prismaClientModule = await import('@prisma/client');
    JobStatus = prismaClientModule.JobStatus;
    JobType = prismaClientModule.JobType;

    const { PrismaClient } = await import('@prisma/client');
    mockPrisma = new PrismaClient();
    mockMarketDataApi = new MarketDataApiClient();
    mockQueueService = new QueueService();
    mockMetricsService = new MetricsService();

    worker = new CalculationWorker(mockPrisma, mockMarketDataApi, mockQueueService, mockMetricsService);

    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should successfully process a job, publish an event, and record metrics', async () => {
    const jobId = 'test-job-id-123';
    const mockJob = {
      id: jobId,
      status: JobStatus.PENDING,
      job_type: JobType.FRONTIER,
      payload: { tickers: ['AAPL', 'GOOG'], steps: 20 },
      trace_id: 'trace-123',
    };
    const mockMarketData = { expected_returns: [0.1], covariance_matrix: [[0.1]] };
    const mockCalcResult = { frontier_points: [{ risk: 0.15, return: 0.2 }] };

    mockPrisma.optimization_jobs.findUnique.mockResolvedValue(mockJob);
    mockMarketDataApi.getLatestStatistics.mockResolvedValue(mockMarketData);
    const { calculateEfficientFrontier } = await import('../../src/wasm/calculator');
    (calculateEfficientFrontier as any).mockResolvedValue(mockCalcResult);

    await worker.processJob(jobId);

    // Assert Metrics were recorded using the constant
    expect(mockMetricsService.recordDuration).toHaveBeenCalledWith(
      MetricNames.OPTIMIZATION_JOB_DURATION_SECONDS,
      expect.any(Number),
      { job_type: 'FRONTIER', status: 'success' }
    );

    // Assert structured log was written
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully processed job'),
      expect.objectContaining({
        traceId: mockJob.trace_id,
        jobId: mockJob.id,
      })
    );
  });
});