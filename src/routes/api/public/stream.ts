import { createFileRoute } from "@tanstack/react-router";

// Catalog CDN hosts plus the storage providers used for admin-uploaded
// (Luo/Luganda) media, so streaming, downloads and size probes all work.
const ALLOWED_HOSTS = [
  ".hakunaymatata.com",
  ".aoneroom.com",
  ".inmoviebox.com",
  ".r2.dev",
  ".r2.cloudflarestorage.com",
  ".workers.dev",
  ".up.railway.app",
  ".supabase.co",
  ".supabase.in",
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
  ".firebasestorage.app",
  ".googleapis.com",
  ".googlevideo.com",
  ".oneaxcess.com",
  ".amazonaws.com",
  ".luofilm.site",
];

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const target = params.get("url");
        const filename = params.get("dl");
        if (!target) return new Response("Missing url", { status: 400 });

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        // Only public HTTPS origins may be relayed. The catalog rotates CDN
        // hostnames, so instead of a fixed list we allow any public host and
        // only block private/loopback targets.
        const isPrivate = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i.test(
          parsed.hostname,
        );
        const known = ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h));
        if (parsed.protocol !== "https:" || (isPrivate && !known)) {
          return new Response("Host not allowed", { status: 403 });
        }


        // ?probe=1 → lightweight metadata lookup (file size/type) without
        // downloading the media. Used to show real sizes in download dialogs.
        if (params.get("probe")) {
          const json = (size: number | null, type: string | null) =>
            Response.json(
              { size, type },
              {
                headers: {
                  "cache-control": "public, max-age=86400",
                  "access-control-allow-origin": "*",
                },
              },
            );
          try {
            const head = await fetch(parsed.toString(), { method: "HEAD" });
            const length = Number(head.headers.get("content-length")) || null;
            if (head.ok && length) return json(length, head.headers.get("content-type"));
            // Some CDNs reject HEAD — fall back to a 1-byte range request.
            const rangeRes = await fetch(parsed.toString(), {
              headers: { range: "bytes=0-0" },
            });
            const contentRange = rangeRes.headers.get("content-range");
            const total = contentRange ? Number(contentRange.split("/")[1]) || null : null;
            return json(total, rangeRes.headers.get("content-type"));
          } catch {
            return json(null, null);
          }
        }

        const range = request.headers.get("range");
        const upstream = await fetch(parsed.toString(), {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            accept: "*/*",
            ...(range ? { range } : {}),
          },
        }).catch(() => null);
        // Some file hosts refuse our server. For downloads, send the browser
        // straight to the host instead (it serves the file as an attachment).
        if (!upstream || [403, 429, 500, 502, 503, 504].includes(upstream.status)) {
          await upstream?.body?.cancel();
          if (filename || !upstream) {
            return new Response(null, {
              status: 307,
              headers: {
                location: parsed.toString(),
                "cache-control": "no-store",
                "referrer-policy": "no-referrer",
                "access-control-allow-origin": "*",
              },
            });
          }
        }
        if (!upstream) return new Response("Unavailable", { status: 502 });

        const headers = new Headers();
        for (const key of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
        ]) {
          const value = upstream.headers.get(key);
          if (value) headers.set(key, value);
        }
        // Generic binary types confuse players; label real video files properly.
        const ct = (headers.get("content-type") ?? "").toLowerCase();
        if (!ct || ct.includes("octet-stream")) {
          const ext = (filename ?? parsed.pathname).toLowerCase().match(/\.(mkv|mp4|webm|m4v|avi|mov)$/)?.[1];
          if (ext) headers.set("content-type", ext === "mkv" ? "video/x-matroska" : ext === "avi" ? "video/x-msvideo" : ext === "mov" ? "video/quicktime" : `video/${ext === "m4v" ? "mp4" : ext}`);
        }
        headers.set("cache-control", "public, max-age=3600");
        headers.set("access-control-allow-origin", "*");
        if (filename) {
          // A download must always be the real media file. If the origin
          // answered with an error page or a manifest/text body, fail loudly
          // instead of letting the browser save a bogus ".txt".
          const type = (upstream.headers.get("content-type") ?? "").toLowerCase();
          const bogus =
            !upstream.ok ||
            type.startsWith("text/") ||
            type.includes("json") ||
            type.includes("xml") ||
            type.includes("dash+xml") ||
            type.includes("mpegurl");
          if (bogus) {
            return new Response("This file is not available for download right now.", {
              status: 502,
              headers: { "content-type": "text/plain", "access-control-allow-origin": "*" },
            });
          }
          const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
          headers.set("content-disposition", `attachment; filename="${safe}"`);
          if (!headers.get("content-type")) headers.set("content-type", "video/mp4");
        }

        return new Response(upstream.body, { status: upstream.status, headers });

      },
    },
  },
});
