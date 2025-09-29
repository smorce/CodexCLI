import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

// This test suite verifies that the Prisma schema is correctly set up for the test environment.
// It relies on the globalSetup.ts script to create a temporary SQLite database.

describe('Database Schema Verification (Green)', () => {
  const prisma = new PrismaClient();

  it('should successfully query the optimization_jobs table', async () => {
    // This test confirms the table exists and is queryable.
    const result = await prisma.$queryRaw`SELECT 1 FROM "optimization_jobs" LIMIT 1;`;
    expect(result).toBeDefined();
  });

  it('should successfully query the optimization_results table', async () => {
    const result = await prisma.$queryRaw`SELECT 1 FROM "optimization_results" LIMIT 1;`;
    expect(result).toBeDefined();
  });

  it('should have the correct columns in optimization_jobs', async () => {
    // This test inspects the table schema to ensure it matches the model.
    // NOTE: The query is specific to SQLite, which is used for testing.
    // PostgreSQL uses `information_schema.columns`.
    const result: any[] = await prisma.$queryRaw`PRAGMA table_info(optimization_jobs);`;

    // The `PRAGMA` command returns a list of objects, each with a 'name' property for the column name.
    const columns = result.map(r => r.name).sort();

    expect(columns).toEqual([
      'created_at',
      'finished_at',
      'id',
      'job_type',
      'payload',
      'result_location',
      'started_at',
      'status',
      'trace_id',
      'user_id',
      'workspace_id'
    ].sort()); // Sort both arrays to ensure a stable comparison
  });
});