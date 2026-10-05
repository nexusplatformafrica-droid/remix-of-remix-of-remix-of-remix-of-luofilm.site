type R2Object = {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  range?: { offset: number; length: number };
};
type Bucket = {
  put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>;
  get(key: string, options?: { range?: Headers }): Promise<R2Object | null>;
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType: string } }): Promise<{ uploadId: string }>;
  resumeMultipartUpload(key: string, uploadId: string): {
    uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer): Promise<{ etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>;
    abort(): Promise<void>;
  };
};

export function uploadBucket(request: Request): Bucket {
  const runtime = request as Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } };
  const bucket = runtime.runtime?.cloudflare?.env?.['MOVIE_MAX_MEDIA'] as Bucket | undefined;
  if (!bucket?.put || !bucket?.get) throw new Error("R2 binding MOVIE_MAX_MEDIA is not configured.");
  return bucket;
}

export async function verifyUploadAdmin(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || token.length > 12000) return false;
  try {
    const [encodedHeader, encodedClaims, encodedSignature, extra] = token.split(".");
    if (!encodedHeader || !encodedClaims || !encodedSignature || extra) return false;
    const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const header = JSON.parse(new TextDecoder().decode(decode(encodedHeader))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(decode(encodedClaims))) as {
      aud?: string; iss?: string; sub?: string; exp?: number; iat?: number;
    };
    const project = "luo-film-2026";
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid || claims.aud !== project ||
        claims.iss !== `https://securetoken.google.com/${project}` || !claims.sub ||
        claims.exp == null || claims.exp <= now || claims.iat == null || claims.iat > now) return false;
    const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!response.ok) return false;
    const keys = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    const jwk = keys.keys?.find((key) => key.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`));
    if (!valid) return false;
    const roles = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "user_roles" }],
        where: { fieldFilter: { field: { fieldPath: "user_id" }, op: "EQUAL", value: { stringValue: claims.sub } } },
        limit: 10,
      } }),
    });
    if (!roles.ok) return false;
    const rows = (await roles.json()) as { document?: { fields?: { user_id?: { stringValue?: string }; role?: { stringValue?: string } } } }[];
    return rows.some((row) => row.document?.fields?.user_id?.stringValue === claims.sub &&
      ["admin", "staff"].includes(row.document?.fields?.role?.stringValue ?? ""));
  } catch {
    return false;
  }
}