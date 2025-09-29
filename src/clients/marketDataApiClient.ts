import { marketDataApiConfig } from '../config';

/**
 * A client for interacting with the external Market Data Service.
 * This class is responsible for fetching financial statistics required
 * for portfolio optimization calculations. It includes a basic retry mechanism
 * and is configured from a central module.
 */
export class MarketDataApiClient {
  private readonly baseUrl: string;
  private readonly retries: number;
  private readonly retryDelay: number;

  constructor() {
    this.baseUrl = marketDataApiConfig.baseUrl;
    this.retries = marketDataApiConfig.retries;
    this.retryDelay = marketDataApiConfig.retryDelay;
  }

  /**
   * A private utility to introduce a delay.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetches the latest statistics for a given list of ticker symbols.
   * It will retry the request on failure according to the centrally configured options.
   */
  public async getLatestStatistics(tickers: string[]): Promise<any> {
    const endpoint = `${this.baseUrl}/statistics/latest`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tickers }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch market data: ${response.status} ${response.statusText}`);
        }

        return response.json(); // Success, return the result
      } catch (error: any) {
        lastError = error;
        if (attempt < this.retries) {
          console.log(`Attempt ${attempt} failed. Retrying in ${this.retryDelay}ms...`);
          await this.sleep(this.retryDelay);
        }
      }
    }

    // If all retries fail, throw the last captured error
    throw lastError;
  }
}