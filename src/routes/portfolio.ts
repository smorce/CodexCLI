import { Hono, MiddlewareHandler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { PrismaClient } from '@prisma/client';
import { JobType } from '../core/job';
import { randomUUID } from 'crypto';
import { efficientFrontierSchema, optimalWeightsSchema } from '../validators/portfolio';
import { z, ZodSchema } from 'zod';
import { toJobStatusResponse } from '../mappers/jobMapper';
import { queueService } from '../services/queueService'; // Import the queue service

// This is a placeholder for a real job queuing and duplicate detection mechanism.
const inMemoryJobStore = new Set<string>();

const prisma = new PrismaClient();

/**
 * A higher-order function that creates a generic job creation handler.
 */
const createJobHandler = (schema: ZodSchema, jobType: JobType): MiddlewareHandler => {
  return async (c) => {
    const payload = c.req.valid('json');

    const payloadHash = JSON.stringify(payload);
    if (inMemoryJobStore.has(payloadHash)) {
      return c.json({ error: 'A job with the exact same parameters has recently been submitted.' }, 409);
    }

    try {
      const newJob = await prisma.optimization_jobs.create({
        data: {
          workspace_id: 'mock-workspace-id',
          user_id: 'mock-user-id',
          job_type: jobType,
          payload: payload,
          trace_id: randomUUID(),
        },
      });

      inMemoryJobStore.add(payloadHash);

      // Publish the job ID to the queue for the worker to process.
      await queueService.publish('optimization_jobs_queue', { jobId: newJob.id });

      return c.json({ job_id: newJob.id }, 202);
    } catch (error) {
      console.error(`Error creating ${jobType} job:`, error);
      return c.json({ error: `Failed to create ${jobType} job due to a server error.` }, 500);
    }
  };
};

export const portfolio = new Hono();

portfolio.post(
  '/efficient-frontier',
  zValidator('json', efficientFrontierSchema, (result, c) => {
    if (!result.success) return c.json({ error: 'Validation failed', details: result.error.issues }, 422);
  }),
  createJobHandler(efficientFrontierSchema, JobType.FRONTIER)
);

portfolio.post(
  '/optimal-weights',
  zValidator('json', optimalWeightsSchema, (result, c) => {
    if (!result.success) return c.json({ error: 'Validation failed', details: result.error.issues }, 422);
  }),
  createJobHandler(optimalWeightsSchema, JobType.OPTIMAL)
);

portfolio.get('/jobs/:jobId', async (c) => {
  const { jobId } = c.req.param();

  try {
    const job = await prisma.optimization_jobs.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        job_type: true,
        created_at: true,
        finished_at: true,
      },
    });

    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    const response = toJobStatusResponse(job);
    return c.json(response, 200);

  } catch (error) {
    console.error(`Error fetching job ${jobId}:`, error);
    return c.json({ error: 'Failed to fetch job status due to a server error.' }, 500);
  }
});