import type { WorkerEnv } from "./ius/app";
import { createWorkerApp } from "./ius/app";

let cachedApp: ReturnType<typeof createWorkerApp> | null = null;
let cachedConnection: string | null = null;

function getApp(env: WorkerEnv) {
  if (!cachedApp || cachedConnection !== env.NEON_DATABASE_URL) {
    cachedApp = createWorkerApp(env);
    cachedConnection = env.NEON_DATABASE_URL;
  }
  return cachedApp;
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return getApp(env).fetch(request, env, ctx);
  },
};

export const fetch = (request: Request, env: WorkerEnv, ctx: ExecutionContext) =>
  getApp(env).fetch(request, env, ctx);
