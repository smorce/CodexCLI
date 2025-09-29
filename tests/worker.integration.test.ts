import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import worker from '../src/worker';
import type { Env } from '../src/worker';

// Create deep mocks for the environment
const mockQueue = {
  send: vi.fn(),
};

const mockPrisma = {
  universe_snapshots: {
    create: vi.fn().mockResolvedValue({ id: 'snapshot-id' }),
  },
};

describe('Scheduled Worker (Cron Trigger)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data from IEX, save a snapshot, and dispatch an event', async () => {
    // 1. Arrange
    const mockIexData = [
      { symbol: 'NVDA', companyName: 'NVIDIA Corp.', marketCap: 1.5e12, sector: 'Technology' },
      { symbol: 'AAPL', companyName: 'Apple Inc.', marketCap: 3e12, sector: 'Technology' },
      { symbol: 'MSFT', companyName: 'Microsoft Corp.', marketCap: 2.5e12, sector: 'Technology' },
      { symbol: 'GOOGL', companyName: 'Alphabet Inc.', marketCap: 2e12, sector: 'Technology' },
      { symbol: 'AMZN', companyName: 'Amazon.com Inc.', marketCap: 1.8e12, sector: 'Technology' },
      { symbol: 'TSLA', companyName: 'Tesla, Inc.', marketCap: 1e12, sector: 'Automotive' },
      { symbol: 'META', companyName: 'Meta Platforms, Inc.', marketCap: 9e11, sector: 'Technology' },
      { symbol: 'BRK.B', companyName: 'Berkshire Hathaway Inc.', marketCap: 8e11, sector: 'Financials' },
      { symbol: 'JPM', companyName: 'JPMorgan Chase & Co.', marketCap: 5e11, sector: 'Financials' },
      { symbol: 'V', companyName: 'Visa Inc.', marketCap: 4.5e11, sector: 'Financials' },
      { symbol: 'JNJ', companyName: 'Johnson & Johnson', marketCap: 4e11, sector: 'Healthcare' },
    ];

    server.use(
      http.get('https://api.iex.cloud/v1/stock/market/list/mostactive', () => {
        return HttpResponse.json(mockIexData);
      })
    );

    const mockEnv: Env = { UniverseQueue: mockQueue, prisma: mockPrisma };
    const mockCtx = { waitUntil: vi.fn() } as any;
    const mockController = { cron: '0 21 * * *' } as any;

    // 2. Act
    await worker.scheduled(mockController, mockEnv, mockCtx);

    // 3. Assert
    const expectedTop10Symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'JPM', 'V'];

    // Check what was passed to prisma.create
    expect(mockPrisma.universe_snapshots.create).toHaveBeenCalledOnce();
    const createCall = mockPrisma.universe_snapshots.create.mock.calls[0][0];
    expect(createCall.data.top_symbols).toEqual(expectedTop10Symbols);
    expect(createCall.data.source).toBe('iexcloud');
    expect(typeof createCall.data.checksum).toBe('string');
    expect(createCall.data.checksum.length).toBe(64); // SHA-256

    // Check what was passed to the queue
    expect(mockQueue.send).toHaveBeenCalledOnce();
    const queueCall = mockQueue.send.mock.calls[0][0];
    expect(queueCall.type).toBe('UniverseUpdated');
    expect(queueCall.payload.snapshotId).toBe('snapshot-id'); // from the mock
    expect(queueCall.payload.traceId).toBeDefined();
  });

  it('should log an error and not write to DB if IEX fetch fails', async () => {
    // 1. Arrange
    server.use(
      http.get('https://api.iex.cloud/v1/stock/market/list/mostactive', () => {
        return new HttpResponse('Internal Server Error', { status: 500 });
      })
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockEnv: Env = { UniverseQueue: mockQueue, prisma: mockPrisma };
    const mockCtx = { waitUntil: vi.fn() } as any;
    const mockController = { cron: '0 21 * * *' } as any;

    // 2. Act
    await worker.scheduled(mockController, mockEnv, mockCtx);

    // 3. Assert
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to execute scheduled sync'));
    expect(mockPrisma.universe_snapshots.create).not.toHaveBeenCalled();
    expect(mockQueue.send).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});