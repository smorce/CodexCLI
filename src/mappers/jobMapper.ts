import { JobStatus, JobType } from '@prisma/client';

/**
 * This module contains functions for mapping database models to API response objects.
 */

// Define the shape of the Prisma job object we expect for mapping.
// This improves type safety within the mapper.
type JobModel = {
  id: string;
  status: JobStatus;
  job_type: JobType;
  created_at: Date;
  finished_at: Date | null;
};

// Define the shape of the API response object.
type JobApiResponse = {
  job_id: string;
  status: JobStatus;
  job_type: JobType;
  created_at: Date;
  finished_at: Date | null;
  result_url: string | null;
};

/**
 * Maps a Prisma job object to the public API response format for a job status check.
 * @param job The job object from the database.
 * @returns The formatted API response object.
 */
export function toJobStatusResponse(job: JobModel): JobApiResponse {
  return {
    job_id: job.id,
    status: job.status,
    job_type: job.job_type,
    created_at: job.created_at,
    finished_at: job.finished_at,
    // In a real application, this URL would point to the result artifact in R2/S3.
    // The logic to generate this URL would live here.
    result_url: job.status === JobStatus.COMPLETED ? `/results/${job.id}` : null,
  };
}