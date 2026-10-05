import { createFileRoute } from "@tanstack/react-router";
import { uploadBucket, verifyUploadAdmin } from "@/lib/r2-upload.server";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const safeKey = (key: unknown): key is string => typeof key === "string" && /^media\/admin\/[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,120}$/.test(key);

export const Route = createFileRoute("/api/public/admin-upload")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = new URL(request.url).searchParams.get("key");
        if (!safeKey(key)) return new Response("Not found", { status: 404 });
        try {
          const object = await uploadBucket(request).get(key, { range: request.headers });
          if (!object) return new Response("Not found", { status: 404 });
          const headers = new Headers({
            "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "x-content-type-options": "nosniff",
            "accept-ranges": "bytes",
            etag: object.httpEtag,
            "cache-control": "public, max-age=3600",
            "content-length": String(object.range?.length ?? object.size),
          });
          if (object.range) headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
          if (!/^(image\/(?!svg\+xml)|video\/|audio\/)/i.test(object.httpMetadata?.contentType ?? "")) headers.set("content-disposition", "attachment");
          return new Response(object.body, { status: object.range ? 206 : 200, headers });
        } catch { return new Response("Storage unavailable", { status: 503 }); }
      },
      POST: async ({ request }) => {
        if (!(await verifyUploadAdmin(request))) return json({ error: "Unauthorized admin upload" }, 403);
        let bucket: ReturnType<typeof uploadBucket>;
        try { bucket = uploadBucket(request); }
        catch (error) { return json({ error: error instanceof Error ? error.message : "R2 unavailable" }, 503); }
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        if (action === "single") {
          const filename = url.searchParams.get("filename")?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
          const key = `media/admin/${crypto.randomUUID()}-${filename}`;
          if (Number(request.headers.get("content-length")) > 20 * 1024 * 1024) return json({ error: "File too large for single upload" }, 413);
          await bucket.put(key, request.body ?? new ArrayBuffer(0), { httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" } });
          return json({ url: `${url.origin}/api/public/admin-upload?key=${encodeURIComponent(key)}` });
        }
        let body: { key?: string; uploadId?: string; filename?: string; contentType?: string; parts?: { partNumber: number; etag: string }[] };
        try { body = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
        if (action === "create") {
          const filename = body.filename?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
          const key = `media/admin/${crypto.randomUUID()}-${filename}`;
          const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: body.contentType || "application/octet-stream" } });
          return json({ key, uploadId: upload.uploadId, url: `${url.origin}/api/public/admin-upload?key=${encodeURIComponent(key)}` });
        }
        if (!safeKey(body.key) || !body.uploadId || body.uploadId.length > 200) return json({ error: "Invalid upload" }, 400);
        const upload = bucket.resumeMultipartUpload(body.key, body.uploadId);
        if (action === "complete") {
          if (!body.parts?.length || body.parts.length > 10000 || body.parts.some((p, i) => p.partNumber !== i + 1 || !p.etag)) return json({ error: "Invalid parts" }, 400);
          await upload.complete(body.parts);
          return json({ url: `${url.origin}/api/public/admin-upload?key=${encodeURIComponent(body.key)}` });
        }
        if (action === "abort") { await upload.abort(); return json({ ok: true }); }
        return json({ error: "Unknown action" }, 400);
      },
      PUT: async ({ request }) => {
        if (!(await verifyUploadAdmin(request))) return json({ error: "Unauthorized admin upload" }, 403);
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        const uploadId = url.searchParams.get("uploadId");
        const part = Number(url.searchParams.get("part"));
        if (!safeKey(key) || !uploadId || uploadId.length > 200 || !Number.isInteger(part) || part < 1 || part > 10000 || !request.body) return json({ error: "Invalid part" }, 400);
        const uploaded = await uploadBucket(request).resumeMultipartUpload(key, uploadId).uploadPart(part, request.body);
        return json({ etag: uploaded.etag });
      },
    },
  },
});