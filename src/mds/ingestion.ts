import type { PriceRepository } from "./repository";
import { buildPriceSnapshot, type BuildPriceSnapshotInput } from "./snapshot";

export interface IngestionQueue {
  send(message: unknown): Promise<void>;
}

export interface CreateIngestionServiceDeps {
  priceRepo: PriceRepository;
  queue: IngestionQueue;
  clock?: () => Date;
}

export interface IngestionService {
  ingestPriceSnapshot(input: BuildPriceSnapshotInput): Promise<{ snapshotId: string }>;
}

export function createIngestionService({ priceRepo, queue, clock }: CreateIngestionServiceDeps): IngestionService {
  return {
    async ingestPriceSnapshot(input) {
      const snapshot = buildPriceSnapshot(input);
      await priceRepo.saveSnapshot(snapshot);

      const payload = {
        eventType: "marketdata.ingested",
        tenantId: snapshot.snapshot.tenant_id,
        snapshotId: snapshot.snapshot.snapshot_id,
        asOfDate: snapshot.snapshot.as_of_date,
        vendor: snapshot.snapshot.vendor,
        publishedAt: snapshot.snapshot.published_at,
        emittedAt: (clock?.() ?? new Date()).toISOString(),
      };

      await queue.send(payload);
      return { snapshotId: snapshot.snapshot.snapshot_id };
    },
  };
}
