/**
 * Defines the possible states for a recomputation job.
 */
export const JobStatus = {
  IDLE: "IDLE",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type JobStatus = typeof JobStatus[keyof typeof JobStatus];

/**
 * Represents the state of a recomputation job stored in the Durable Object.
 */
export interface JobState {
  status: JobStatus;
  jobId?: string;
  startedAt?: string;
  completedAt?: string;
}