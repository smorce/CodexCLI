/**
 * This module centralizes configuration for the application.
 * It reads values from environment variables and provides sensible defaults,
 * making the application easier to configure for different environments (development, testing, production).
 */

export const marketDataApiConfig = {
  // The base URL for the Market Data Service API.
  baseUrl: process.env.MARKET_DATA_API_BASE_URL || 'http://localhost:8788',

  // The number of times to retry a failed request.
  retries: parseInt(process.env.MARKET_DATA_API_RETRIES || '3', 10),

  // The delay between retries in milliseconds.
  retryDelay: parseInt(process.env.MARKET_DATA_API_RETRY_DELAY || '200', 10),
};

// We can add other configurations here as the application grows.
export const appConfig = {
  // e.g., environment: process.env.NODE_ENV || 'development'
};