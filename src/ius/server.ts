import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { UniverseConstituentRecord, UniverseSnapshotRecord } from "./snapshot";

export interface AuthContext {
  tenantId: string;
  roles: string[];
  userId?: string;
}

export interface AuthService {
  verify(request: Request): Promise<AuthContext>;
}

export interface UniverseSnapshotAggregate {
  snapshot: UniverseSnapshotRecord;
  constituents: UniverseConstituentRecord[];
}

export interface UniverseListResult {
  items: UniverseSnapshotAggregate[];
  nextCursor: string | null;
  totalCount?: number | null;
}

export interface UniverseRepository {
  getLatestSnapshot(tenantId: string, asOf?: string): Promise<UniverseSnapshotAggregate | null>;
  listSnapshots(
    tenantId: string,
    options: {
      startDate?: string;
      endDate?: string;
      limit?: number;
      cursor?: string;
    }
  ): Promise<UniverseListResult>;
}

export type RebalanceJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobService {
  enqueueManualJob(
    tenantId: string,
    input: {
      effectiveDate?: string;
      source: "manual_override" | "provider_replay";
      force: boolean;
      requestedBy?: string;
    }
  ): Promise<{
    jobId: string;
    status: RebalanceJobStatus;
    requestedAt: string;
    effectiveDate?: string | null;
    queueEventId?: string | null;
  }>;
}

export interface CreateIusAppDeps {
  universeRepo: UniverseRepository;
  auth: AuthService;
  jobService: JobService;
}

type JsonErrorDetails = Record<string, unknown> | undefined;

const rebalanceSchema = z
  .object({
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    source: z.enum(["manual_override", "provider_replay"]).default("manual_override"),
    force: z.boolean().default(false),
  })
  .strict();

function jsonError(code: string, message: string, status: number, details?: JsonErrorDetails) {
  return new Response(JSON.stringify({ code, message, details }), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function ensureViewer(authContext: AuthContext) {
  if (!authContext.roles.includes("portfolio.viewer") && !authContext.roles.includes("portfolio.admin")) {
    throw new HTTPException(403, { message: "forbidden" });
  }
}

function ensureAdmin(authContext: AuthContext) {
  if (!authContext.roles.includes("portfolio.admin")) {
    throw new HTTPException(403, { message: "forbidden" });
  }
}

function mapConstituent(row: UniverseConstituentRecord, includeMeta: boolean) {
  return {
    position: row.position,
    ticker: row.ticker,
    weight: row.weight,
    freeFloatMarketCap: row.free_float_market_cap,
    sector: row.sector,
    currency: row.currency,
    ...(includeMeta
      ? {
          cusip: row.cusip,
          isin: row.isin,
        }
      : {}),
  };
}

function mapSnapshotAggregate(aggregate: UniverseSnapshotAggregate, includeMeta: boolean) {
  const { snapshot, constituents } = aggregate;
  return {
    snapshotId: snapshot.snapshot_id,
    tenantId: snapshot.tenant_id,
    asOfDate: snapshot.as_of_date,
    effectiveAt: snapshot.effective_at,
    publishedAt: snapshot.published_at,
    source: snapshot.source,
    hash: snapshot.hash,
    constituents: constituents.map((row) => mapConstituent(row, includeMeta)),
  };
}

export function createIusApp({ universeRepo, auth, jobService }: CreateIusAppDeps) {
  const app = new Hono<{ Variables: { auth: AuthContext } }>();

  app.use("*", async (c, next) => {
    try {
      const context = await auth.verify(c.req.raw);
      c.set("auth", context);
    } catch (error) {
      throw new HTTPException(401, { message: "unauthorized" });
    }
    await next();
  });

  app.get("/universe/current", async (c) => {
    const authContext = c.get("auth");
    ensureViewer(authContext);

    const asOf = c.req.query("asOf") ?? undefined;
    const includeMeta = c.req.query("includeConstituentMeta") === "true";

    const result = await universeRepo.getLatestSnapshot(authContext.tenantId, asOf);
    if (!result) {
      return jsonError("universe_not_found", "No universe snapshot available", 404);
    }

    return c.json(mapSnapshotAggregate(result, includeMeta));
  });

  app.get("/universe/history", async (c) => {
    const authContext = c.get("auth");
    ensureViewer(authContext);

    const query = c.req.query();
    const includeMeta = query["includeConstituentMeta"] === "true";

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const startDateRaw = query["startDate"];
    const endDateRaw = query["endDate"];

    if (startDateRaw && !dateRegex.test(startDateRaw)) {
      return jsonError("invalid_start_date", "startDate must be YYYY-MM-DD", 400);
    }
    if (endDateRaw && !dateRegex.test(endDateRaw)) {
      return jsonError("invalid_end_date", "endDate must be YYYY-MM-DD", 400);
    }

    const limitRaw = query["limit"];
    let limit = 25;
    if (limitRaw !== undefined) {
      const parsedLimit = Number.parseInt(Array.isArray(limitRaw) ? limitRaw[0] : limitRaw, 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return jsonError("invalid_limit", "limit must be between 1 and 100", 400);
      }
      limit = parsedLimit;
    }

    const cursor = query["cursor"];

    const result = await universeRepo.listSnapshots(authContext.tenantId, {
      startDate: startDateRaw,
      endDate: endDateRaw,
      limit,
      cursor,
    });

    return c.json({
      items: result.items.map((aggregate) => mapSnapshotAggregate(aggregate, includeMeta)),
      nextCursor: result.nextCursor,
      totalCount: result.totalCount ?? undefined,
    });
  });

  app.post("/universe/rebalance-job", async (c) => {
    const authContext = c.get("auth");
    ensureAdmin(authContext);

    let parsedBody: unknown;
    try {
      parsedBody = await c.req.json();
    } catch (error) {
      return jsonError("invalid_json", "Request body must be valid JSON", 400);
    }

    const validation = rebalanceSchema.safeParse(parsedBody ?? {});
    if (!validation.success) {
      return jsonError("invalid_request", "Invalid rebalance job payload", 400, {
        issues: validation.error.issues,
      });
    }

    const payload = validation.data;

    try {
      const result = await jobService.enqueueManualJob(authContext.tenantId, {
        ...payload,
        requestedBy: authContext.userId,
      });
      return c.json(
        {
          jobId: result.jobId,
          status: result.status,
          requestedAt: result.requestedAt,
          effectiveDate: result.effectiveDate ?? null,
          queueEventId: result.queueEventId ?? null,
        },
        202
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate_job")) {
        return jsonError("rebalance_conflict", "Rebalance job already in progress", 409);
      }
      throw error;
    }
  });

  app.onError((err) => {
    if (err instanceof HTTPException) {
      const status = err.status ?? 500;
      const code = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "http_error";
      return jsonError(code, err.message, status);
    }

    console.error(err);
    return jsonError("internal_error", "Unexpected error", 500);
  });

  return app;
}



