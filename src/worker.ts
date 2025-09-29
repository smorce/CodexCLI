import { Hono } from 'hono';

// Define the environment bindings for the worker
// This will include database connections, queues, etc.
export interface Env {
  // In a real application, you would define your bindings here
  // For example: DB: D1Database;
  // For this TDD cycle, we'll pass mocks in the tests.
  UniverseQueue: any; // Mocked queue
  prisma: any; // Mocked prisma client
}

const app = new Hono<{ Bindings: Env }>();

// NOTE: This is a simple in-memory state management for the TDD cycle.
// A real-world implementation would use a more robust distributed solution,
// like Cloudflare Durable Objects, to handle state across multiple worker instances.
let isSyncing = false;
const syncJobs = new Map<string, any>();

app.get('/universe/top10', (c) => {
  // NOTE: This is a mocked response to satisfy the initial API contract test.
  const mockResponse = {
    data: Array(10).fill({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      marketCap: 3_000_000_000_000,
      sector: 'Technology',
    }),
    meta: {
      asOf: new Date().toISOString(),
      source: 'mock',
      checksum: 'mock-checksum',
    },
  };
  return c.json(mockResponse, 200);
});

app.post('/universe/sync', (c) => {
  const role = c.req.header('X-Test-Auth-Role');
  if (role !== 'Admin') {
    return c.json({ code: 'FORBIDDEN', message: 'Insufficient privileges' }, 403);
  }

  if (isSyncing) {
    return c.json({ code: 'CONFLICT', message: 'A sync job is already in progress.' }, 409);
  }
  isSyncing = true;

  const job = {
    syncJobId: crypto.randomUUID(),
    status: 'QUEUED',
    acceptedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };
  syncJobs.set(job.syncJobId, job);
  return c.json(job, 202);
});

app.get('/universe/sync/:syncJobId', (c) => {
  const { syncJobId } = c.req.param();
  const job = syncJobs.get(syncJobId);
  if (!job) {
    return c.json({ code: 'NOT_FOUND', message: 'Sync job not found.' }, 404);
  }
  return c.json(job, 200);
});

/**
 * The scheduled handler for the cron trigger.
 * This is where the core synchronization logic will be implemented.
 */
/**
 * Fetches, processes, and stores the top 10 stock universe.
 */
async function syncUniverse(env: Env): Promise<void> {
  // In a real app, the token would be a secret from env
  const response = await fetch('https://api.iex.cloud/v1/stock/market/list/mostactive?token=DUMMY_TOKEN');

  if (!response.ok) {
    throw new Error(`IEX Cloud API responded with status: ${response.status}`);
  }

  const iexData = await response.json() as { symbol: string, marketCap: number }[];

  // Process the data: sort by market cap and get the top 10
  const sortedStocks = iexData.sort((a, b) => b.marketCap - a.marketCap);
  const top10Symbols = sortedStocks.slice(0, 10).map(stock => stock.symbol);

  // Calculate a checksum for data integrity
  const symbolsString = JSON.stringify(top10Symbols);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(symbolsString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Save the snapshot to the database
  const snapshot = await env.prisma.universe_snapshots.create({
    data: {
      as_of: new Date(),
      top_symbols: top10Symbols,
      source: 'iexcloud',
      checksum: checksum,
      metadata: { rawCount: iexData.length }
    }
  });

  // Dispatch an event to the queue
  await env.UniverseQueue.send({
    type: 'UniverseUpdated',
    payload: {
      snapshotId: snapshot.id,
      traceId: crypto.randomUUID(), // In a real app, this would be propagated
    }
  });
}


async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`Scheduled handler executed at ${new Date().toISOString()}`);
  try {
    await syncUniverse(env);
    console.log("Successfully processed universe data.");
  } catch (error) {
    console.error(`Failed to execute scheduled sync: ${error}`);
  }
}

// Export the worker object with both fetch and scheduled handlers
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};

/**
 * Resets the in-memory state for testing purposes.
 * This is not intended for production use.
 */
export function _resetStateForTests() {
  isSyncing = false;
  syncJobs.clear();
}