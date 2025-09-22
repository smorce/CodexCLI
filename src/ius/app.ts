import { Pool } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { createSupabaseAuthService } from "./auth";
import { createIusApp, type AuthService } from "./server";
import { createUniverseRepository } from "./repository";
import { createQueueJobService } from "./job-service";

export interface WorkerEnv {
  NEON_DATABASE_URL: string;
  SUPABASE_JWKS_URL: string;
  SUPABASE_JWT_AUDIENCE?: string;
  SUPABASE_JWT_ISSUER?: string;
  IUS_UNIVERSE_QUEUE: Queue;
}

interface Queue extends Pick<import("@cloudflare/workers-types").Queue<any>, "send"> {}

const poolCache = new Map<string, Pool>();

function getPool(connectionString: string) {
  const existing = poolCache.get(connectionString);
  if (existing) {
    return existing;
  }
  const pool = new Pool({ connectionString });
  poolCache.set(connectionString, pool);
  return pool;
}

function createQueueProducer(queue: Queue) {
  return {
    async send(message: unknown) {
      await queue.send(JSON.stringify(message));
    },
  };
}

function createAuth(env: WorkerEnv): AuthService {
  return createSupabaseAuthService({
    jwksUrl: env.SUPABASE_JWKS_URL,
    audience: env.SUPABASE_JWT_AUDIENCE ?? "authenticated",
    issuer: env.SUPABASE_JWT_ISSUER,
  });
}

export function createWorkerApp(env: WorkerEnv) {
  const pool = getPool(env.NEON_DATABASE_URL);
  const auth = createAuth(env);
  const universeRepo = createUniverseRepository({ pool });
  const queueProducer = createQueueProducer(env.IUS_UNIVERSE_QUEUE);
  const jobService = createQueueJobService({
    pool,
    queue: queueProducer,
    clock: () => new Date(),
    idGenerator: () => randomUUID(),
  });

  const app = createIusApp({
    universeRepo,
    auth,
    jobService,
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
