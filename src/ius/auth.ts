import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthService } from "./server";

interface SupabaseAuthOptions {
  jwksUrl: string;
  issuer?: string;
  audience?: string;
  cacheTtlMs?: number;
}

interface CachedJwks {
  expiresAt: number;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

const jwksCache = new Map<string, CachedJwks>();

function getJwks(url: string, cacheTtlMs: number) {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.jwks;
  }
  const jwks = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, {
    jwks,
    expiresAt: now + cacheTtlMs,
  });
  return jwks;
}

function extractRoles(payload: JWTPayload): string[] {
  if (Array.isArray(payload.roles)) {
    return payload.roles.filter((role): role is string => typeof role === "string");
  }
  const appMetadata = (payload["app_metadata"] ?? payload["appMetadata"]) as Record<string, unknown> | undefined;
  const roles = appMetadata?.roles;
  if (Array.isArray(roles)) {
    return roles.filter((role): role is string => typeof role === "string");
  }
  const role = payload.role;
  if (typeof role === "string") {
    return [role];
  }
  return [];
}

function extractTenantId(payload: JWTPayload): string {
  const tenantId =
    (payload["tenant_id"] as string | undefined) ??
    ((payload["app_metadata"] as Record<string, unknown> | undefined)?.tenant_id as string | undefined) ??
    payload.sub;
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("tenant_id_missing");
  }
  return tenantId;
}

export function createSupabaseAuthService({
  jwksUrl,
  issuer,
  audience = "authenticated",
  cacheTtlMs = 5 * 60 * 1000,
}: SupabaseAuthOptions): AuthService {
  return {
    async verify(request: Request) {
      const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
      if (!header || !header.startsWith("Bearer ")) {
        throw new Error("missing_authorization");
      }
      const token = header.slice("Bearer ".length).trim();
      if (!token) {
        throw new Error("missing_token");
      }

      const jwks = getJwks(jwksUrl, cacheTtlMs);
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience,
      });

      const tenantId = extractTenantId(payload);
      const roles = extractRoles(payload);
      const userId = typeof payload.sub === "string" ? payload.sub : undefined;

      return {
        tenantId,
        roles,
        userId,
      };
    },
  };
}
