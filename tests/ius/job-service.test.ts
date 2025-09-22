import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createQueueJobService } from "../../src/ius/job-service";

const migrationPath = resolve(__dirname, "../../src/ius/sql/0001_init.sql");

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("Queue job service", () => {
  let pool: Pool;
  const messages: any[] = [];

  beforeEach(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
    const sql = readFileSync(migrationPath, "utf8");
    await pool.query(sql);
    messages.length = 0;
  });

  it("persists jobs and enqueues payload", async () => {
    const jobService = createQueueJobService({
      pool,
      queue: {
        async send(message: unknown) {
          messages.push(message);
        },
      },
      clock: () => new Date("2025-09-22T09:00:00Z"),
      idGenerator: () => "88888888-8888-4888-8888-888888888888",
    });

    const result = await jobService.enqueueManualJob(tenantId, {
      source: "manual_override",
      force: false,
      effectiveDate: "2025-09-19",
    });

    expect(result.jobId).toEqual("88888888-8888-4888-8888-888888888888");
    expect(result.status).toEqual("queued");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      jobId: result.jobId,
      tenantId,
      source: "manual_override",
      effectiveDate: "2025-09-19",
    });

    const rows = await pool.query(
      `SELECT * FROM ius.rebalance_jobs WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toEqual("queued");
  });

  it("rejects duplicate jobs unless force flag", async () => {
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    const jobService = createQueueJobService({
      pool,
      queue: {
        async send() {
          return;
        },
      },
      clock: () => new Date("2025-09-22T09:00:00Z"),
      idGenerator: () => ids.shift()!,
    });

    await jobService.enqueueManualJob(tenantId, {
      source: "manual_override",
      force: false,
      effectiveDate: "2025-09-19",
    });

    await expect(
      jobService.enqueueManualJob(tenantId, {
        source: "manual_override",
        force: false,
        effectiveDate: "2025-09-19",
      }),
    ).rejects.toThrow(/duplicate_job/);

    const forced = await jobService.enqueueManualJob(tenantId, {
      source: "manual_override",
      force: true,
      effectiveDate: "2025-09-19",
    });
    expect(forced.queueEventId).toBeDefined();
    expect(forced.status).toEqual("queued");
  });

  it("rolls back when queue send fails", async () => {
    const jobService = createQueueJobService({
      pool,
      queue: {
        async send() {
          throw new Error("queue_down");
        },
      },
      clock: () => new Date("2025-09-22T09:00:00Z"),
      idGenerator: () => "77777777-7777-4777-7777-777777777777",
    });

    await expect(
      jobService.enqueueManualJob(tenantId, {
        source: "manual_override",
        force: false,
        effectiveDate: "2025-09-19",
      }),
    ).rejects.toThrow(/queue_down/);

    const rows = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ius.rebalance_jobs WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows.rows[0].count).toEqual(0);
  });
});
