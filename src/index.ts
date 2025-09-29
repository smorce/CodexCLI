import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { JobStatus, JobState } from "@app/models";

export class RecomputationJob {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const method = request.method;
    const STATE_KEY = "currentState";

    if (url.pathname === "/setState" && method === "POST") {
      const { status } = await request.json<{ status: JobStatus }>();
      await this.state.storage.put<JobState>(STATE_KEY, { status });
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/status" && method === "GET") {
      const state = await this.state.storage.get<JobState>(STATE_KEY) ?? { status: JobStatus.IDLE };
      return new Response(JSON.stringify(state), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/start" && method === "POST") {
      const jobId = crypto.randomUUID();
      const jobState: JobState = {
        status: JobStatus.QUEUED,
        jobId,
        startedAt: new Date().toISOString(),
      };
      await this.state.storage.put(STATE_KEY, jobState);
      return new Response(JSON.stringify({ jobId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

// Define the environment bindings, including the Durable Object
export interface Env {
  RECOMPUTATION_JOB: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Simple JWT payload parsing function for the test environment.
// In a real app, we'd use a library like 'jose' to verify the signature.
const parseJwtPayload = (token: string) => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
};

// Middleware for checking admin role
const isAdmin = () => {
  return async (c: any, next: any) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ code: "UNAUTHORIZED", message: "Missing or invalid token" }, 401);
    }
    const token = authHeader.substring(7);
    const payload = parseJwtPayload(token);

    if (!payload || !payload.roles || !payload.roles.includes("admin")) {
      return c.json({ code: "FORBIDDEN", message: "Administrator access required" }, 403);
    }

    await next();
  };
};

app.post("/market/recompute", isAdmin(), async (c) => {
  // Use a singleton ID for the Durable Object to ensure we always interact with the same instance.
  const id = c.env.RECOMPUTATION_JOB.idFromName("singleton");
  const stub = c.env.RECOMPUTATION_JOB.get(id);

  // Check the current job status.
  const statusResponse = await stub.fetch("http://do/status", { method: "GET" });
  const { status } = await statusResponse.json<JobState>();

  if (status === JobStatus.RUNNING) {
    return c.json({ code: "CONFLICT", message: "A recomputation job is already in progress." }, 409);
  }

  // If no job is running, start a new one by calling the DO.
  const startResponse = await stub.fetch("http://do/start", { method: "POST" });
  const { jobId } = await startResponse.json<{ jobId: string }>();

  const responseBody = {
    jobId,
    status: JobStatus.QUEUED,
    acceptedAt: new Date().toISOString(),
  };

  return c.json(responseBody, 202);
});

export default app;