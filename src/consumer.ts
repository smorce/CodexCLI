import { queueService } from './services/queueService';
import { CalculationWorker } from './workers/calculation';

/**
 * This module is responsible for initializing the queue consumer,
 * which bridges the message queue to the calculation worker.
 */

const JOB_QUEUE_NAME = 'optimization_jobs_queue';

/**
 * Subscribes the CalculationWorker to the job queue.
 * In a real application, this would be called at application startup.
 * @param worker An instance of the CalculationWorker.
 */
export function initializeQueueConsumer(worker: CalculationWorker): void {
  console.log(`Initializing consumer for queue: ${JOB_QUEUE_NAME}`);

  queueService.subscribe(JOB_QUEUE_NAME, async (message: { jobId: string }) => {
    if (!message || !message.jobId) {
      console.error('Received invalid message from queue:', message);
      return;
    }

    console.log(`Consumer received job ID: ${message.jobId}. Triggering worker...`);
    await worker.processJob(message.jobId);
  });
}