import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueService } from '../src/services/queueService'; // Corrected path
import { CalculationWorker } from '../src/workers/calculation';
import { initializeQueueConsumer } from '../src/consumer'; // This will fail: does not exist
import { PrismaClient } from '@prisma/client';
import { MarketDataApiClient } from '../src/clients/marketDataApiClient';
import { MetricsService } from '../src/services/metricsService';

// Mock the worker and its dependencies
vi.mock('../src/workers/calculation');

describe('Queue Consumer', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any listeners from previous tests
    queueService.clearAllQueues();
  });

  it('should trigger the CalculationWorker when a job is published to the queue', async () => {
    // --- Arrange ---
    // We need a mock instance of the worker to spy on its methods.
    const mockWorker = new CalculationWorker(
      new PrismaClient(),
      new MarketDataApiClient(),
      queueService,
      new MetricsService()
    );
    const processJobSpy = vi.spyOn(mockWorker, 'processJob');

    // Initialize the consumer, passing in the mocked worker.
    // This function, which subscribes the worker to the queue, does not exist yet.
    initializeQueueConsumer(mockWorker);

    const testMessage = { jobId: 'consume-test-123' };

    // --- Act ---
    // Publish a message to the queue, which should be picked up by the consumer.
    await queueService.publish('optimization_jobs_queue', testMessage);

    // --- Assert ---
    // Use a short timeout to allow the async event handler to fire.
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify that the worker's processJob method was called with the correct job ID.
    expect(processJobSpy).toHaveBeenCalledWith(testMessage.jobId);
  });
});