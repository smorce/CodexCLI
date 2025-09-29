import { PrismaClient, JobStatus, JobType } from '@prisma/client';
import { MarketDataApiClient } from '../clients/marketDataApiClient';
import { QueueService } from '../services/queueService';
import { MetricsService } from '../services/metricsService';
import { calculateEfficientFrontier, calculateOptimalWeights } from '../wasm/calculator';
import { createHash } from 'crypto';
import { MetricNames } from '../core/metrics'; // Import the new constants

/**
 * The CalculationWorker orchestrates the background processing of portfolio optimization jobs.
 */
export class CalculationWorker {
  private prisma: PrismaClient;
  private marketDataApi: MarketDataApiClient;
  private queueService: QueueService;
  private metricsService: MetricsService;

  constructor(
    prisma: PrismaClient,
    marketDataApi: MarketDataApiClient,
    queueService: QueueService,
    metricsService: MetricsService
  ) {
    this.prisma = prisma;
    this.marketDataApi = marketDataApi;
    this.queueService = queueService;
    this.metricsService = metricsService;
  }

  private async _saveResults(jobId: string, result: any): Promise<void> {
    const resultChecksum = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);

    await this.prisma.optimization_results.create({
      data: {
        job_id: jobId,
        summary: { calculated_at: new Date() },
        frontier_points: result.frontier_points || null,
        optimal_weights: result.optimal_weights || null,
        checksum: resultChecksum,
        expires_at: expirationDate,
      },
    });
  }

  public async processJob(jobId: string): Promise<void> {
    const startTime = Date.now();
    let jobStatusForMetrics: 'success' | 'failure' = 'failure';
    let jobTypeForMetrics: JobType | undefined;
    let traceId: string | undefined;

    try {
      const job = await this.prisma.optimization_jobs.findUnique({ where: { id: jobId } });
      if (!job) {
        console.error(`Job with ID ${jobId} not found.`);
        return;
      }
      traceId = job.trace_id;
      jobTypeForMetrics = job.job_type;

      await this.prisma.optimization_jobs.update({
        where: { id: jobId },
        data: { status: JobStatus.PROCESSING, started_at: new Date() },
      });

      const marketData = await this.marketDataApi.getLatestStatistics(job.payload.tickers);

      let result;
      if (job.job_type === JobType.FRONTIER) {
        result = await calculateEfficientFrontier(marketData, job.payload);
      } else {
        result = await calculateOptimalWeights(marketData, job.payload);
      }

      await this._saveResults(jobId, result);

      await this.prisma.optimization_jobs.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, finished_at: new Date() },
      });

      await this.queueService.publish('portfolio_insights_queue', {
        eventName: 'PortfolioComputed',
        jobId: job.id,
        traceId: job.trace_id,
        timestamp: new Date().toISOString(),
      });

      jobStatusForMetrics = 'success';
      console.log('Successfully processed job', { traceId: job.trace_id, jobId: job.id });

    } catch (error: any) {
      console.error('Failed to process job', { traceId, jobId, error: error.message });
      await this.prisma.optimization_jobs.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, finished_at: new Date() },
      });
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordDuration(
        MetricNames.OPTIMIZATION_JOB_DURATION_SECONDS, // Use the constant
        duration,
        {
          status: jobStatusForMetrics,
          job_type: jobTypeForMetrics,
        }
      );
    }
  }
}