import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { JobService } from "./server";

export interface QueueProducer {
  send(message: unknown): Promise<void>;
}

export interface CreateQueueJobServiceDeps {
  pool: Pick<Pool, "connect">;
  queue: QueueProducer;
  clock?: () => Date;
  idGenerator?: () => string;
}

class DuplicateJobError extends Error {
  constructor() {
    super("duplicate_job");
  }
}

export function createQueueJobService({
  pool,
  queue,
  clock,
  idGenerator,
}: CreateQueueJobServiceDeps): JobService {
  return {
    async enqueueManualJob(tenantId, input) {
      const jobId = idGenerator?.() ?? randomUUID();
      const queueEventId = randomUUID();
      const requestedAt = clock?.() ?? new Date();

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        if (!input.force) {
          const duplicate = await client.query<{ job_id: string }>(
            `SELECT job_id FROM ius.rebalance_jobs
             WHERE tenant_id = $1
               AND status IN ('queued', 'running')
               AND (
                 ($2::date IS NULL AND effective_date IS NULL)
                 OR ($2::date IS NOT NULL AND effective_date = $2::date)
               )
             LIMIT 1`,
            [tenantId, input.effectiveDate ?? null],
          );

          if (duplicate.rows.length > 0) {
            throw new DuplicateJobError();
          }
        }

        const payload = {
          type: "universe.rebalance.requested",
          jobId,
          tenantId,
          effectiveDate: input.effectiveDate ?? null,
          source: input.source,
          force: input.force,
          requestedAt: requestedAt.toISOString(),
          queueEventId,
        };

        await queue.send(payload);

        await client.query(
          `INSERT INTO ius.rebalance_jobs (
             job_id,
             tenant_id,
             triggered_by,
             requested_at,
             effective_date,
             status,
             error_code,
             error_message,
             source,
             queue_event_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            jobId,
            tenantId,
            input.requestedBy ?? tenantId,
            requestedAt.toISOString(),
            input.effectiveDate ?? null,
            "queued",
            null,
            null,
            input.source,
            queueEventId,
          ],
        );

        await client.query("COMMIT");

        return {
          jobId,
          status: "queued" as const,
          requestedAt: requestedAt.toISOString(),
          effectiveDate: input.effectiveDate ?? null,
          queueEventId,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
