/**
 * Firecrawl Web Scraping Integration
 *
 * Exports all Firecrawl client functionality for web scraping operations.
 */

export {
  // Errors
  FirecrawlError,
  FirecrawlAuthError,
  FirecrawlRateLimitError,
  FirecrawlPaymentError,
  // Client
  FirecrawlClient,
  createFirecrawlClient,
  // Types
  type FirecrawlClientConfig,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapeResponse,
  type ScrapeMetadata,
  type CrawlOptions,
  type CrawlResponse,
  type ExtractOptions,
  type ExtractResponse,
} from './client'
