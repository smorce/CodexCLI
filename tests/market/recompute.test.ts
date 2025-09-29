import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { JobStatus } from "@app/models";

// Helper to create a mock JWT.
const createMockJWT = (payload: object) => {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  // The signature doesn't matter for this test as we are not verifying it.
  return `${encodedHeader}.${encodedPayload}.fakesignature`;
};

describe("POST /market/recompute", () => {
  it("should return 409 Conflict if a recomputation job is already in progress", async () => {
    // Arrange: Get a stub for the singleton Durable Object and set its state to simulate a running job.
    const id = env.RECOMPUTATION_JOB.idFromName("singleton");
    const stub = env.RECOMPUTATION_JOB.get(id);

    // This is a mock of how we'll set the state. We'll make the real DO respond to this.
    // For now, we just need to get the test to fail correctly.
    await stub.fetch("http://do/setState", { method: "POST", body: JSON.stringify({ status: JobStatus.RUNNING }) });

    const adminToken = createMockJWT({ sub: "admin-user", roles: ["admin"] });
    const request = new Request("http://localhost/market/recompute", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
      },
    });

    // Act: Attempt to start a new job.
    const response = await SELF.fetch(request);

    // Assert: Expect a 409 Conflict response.
    expect(response.status).toBe(409);
  });

  it("should return 403 Forbidden if the user does not have the 'admin' role", async () => {
    // Arrange: Create a token for a non-admin user.
    const nonAdminToken = createMockJWT({ sub: "user-123", roles: ["viewer"] });
    const request = new Request("http://localhost/market/recompute", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nonAdminToken}`,
        "Content-Type": "application/json",
      },
    });

    // Act: Dispatch the request to the worker using the SELF binding.
    const response = await SELF.fetch(request);
    const body = await response.json();

    // Assert: Expect a 403 Forbidden response.
    expect(response.status).toBe(403);
    expect(body).toEqual({
      code: "FORBIDDEN",
      message: "Administrator access required",
    });
  });

  it("should return 202 Accepted and a job ID when a new job is started", async () => {
    // Arrange: Ensure the job state is idle.
    const id = env.RECOMPUTATION_JOB.idFromName("singleton");
    const stub = env.RECOMPUTATION_JOB.get(id);
    await stub.fetch("http://do/setState", { method: "POST", body: JSON.stringify({ status: JobStatus.IDLE }) });

    const adminToken = createMockJWT({ sub: "admin-user", roles: ["admin"] });
    const request = new Request("http://localhost/market/recompute", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    });

    // Act: Dispatch the request to the worker.
    const response = await SELF.fetch(request);
    const body = await response.json();

    // Assert: Expect a 202 Accepted response with the correct schema.
    expect(response.status).toBe(202);
    expect(body.status).toBe(JobStatus.QUEUED);
    expect(body.jobId).toEqual(expect.any(String));
    expect(body.acceptedAt).toEqual(expect.any(String));
  });
});