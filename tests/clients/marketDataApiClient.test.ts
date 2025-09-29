import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketDataApiClient } from '../../src/clients/marketDataApiClient';
import { marketDataApiConfig } from '../../src/config';

// This test suite is for the client that interacts with the external Market Data Service.
// It uses mocking to simulate the external service and central configuration.

describe('MarketDataApiClient', () => {
  let client: MarketDataApiClient;

  beforeEach(() => {
    // The client is now instantiated without arguments, as it uses the central config.
    client = new MarketDataApiClient();
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch latest statistics and return the JSON response', async () => {
    const mockTickers = ['AAPL', 'GOOG'];
    const mockStatistics = {
      expected_returns: [0.1, 0.2],
      covariance_matrix: [[0.05, 0.01], [0.01, 0.06]],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatistics),
    });

    const result = await client.getLatestStatistics(mockTickers);

    // Verify fetch was called with the URL from the central config
    expect(fetch).toHaveBeenCalledWith(
      `${marketDataApiConfig.baseUrl}/statistics/latest`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: mockTickers }),
      })
    );

    expect(result).toEqual(mockStatistics);
  });

  it('should throw an error if the network response is not ok', async () => {
    const mockTickers = ['MSFT'];

    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // We expect the client to retry based on the default config, then fail.
    await expect(client.getLatestStatistics(mockTickers))
      .rejects.toThrow('Failed to fetch market data: 500 Internal Server Error');

    // Verify it retried according to the default config
    expect(fetch).toHaveBeenCalledTimes(marketDataApiConfig.retries);
  });

  it('should retry fetching on failure before eventually succeeding', async () => {
    const mockTickers = ['TSLA'];
    const mockStatistics = { expected_returns: [0.3], covariance_matrix: [[0.08]] };

    // For this specific test, we override the config to use specific retry values.
    // This is done by mocking the config module itself.
    vi.mock('../../src/config', () => ({
      marketDataApiConfig: {
        baseUrl: 'http://test-url',
        retries: 3,
        retryDelay: 10,
      },
    }));

    // Re-instantiate the client to make it use the mocked config
    const testClient = new MarketDataApiClient();

    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatistics),
      });

    const result = await testClient.getLatestStatistics(mockTickers);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual(mockStatistics);

    // Un-mock to not affect other tests
    vi.unmock('../../src/config');
  });
});