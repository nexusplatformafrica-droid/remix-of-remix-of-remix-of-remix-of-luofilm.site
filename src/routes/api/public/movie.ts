import { createFileRoute } from "@tanstack/react-router";
import { fetchFreshSources, fetchSources } from "@/lib/moviebox";
import { z } from "zod";

/**
 * Stable relay for full TV-BFF MP4 files. It resolves a fresh signed URL for
 * each browser Range request, preventing an expired URL from breaking long
 * playback sessions or downloads.
 */

const safeName = (value: string) =>
  (value.replace(/[^\w\s.()-]+/g, "").trim() || "luofilm").slice(0, 90);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Range, Content-Type, Authorization",
  "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges",
  "access-control-max-age": "86400",
} as const;

const querySchema = z.object({
  subjectId: z.string().min(1).max(80),
  se: z.coerce.number().int().min(0).max(10_000).default(0),
  ep: z.coerce.number().int().min(0).max(100_000).default(0),
  res: z.coerce.number().int().min(0).max(8_640).default(0),
  resourceId: z.string().min(1).max(200),
  dl: z.string().max(120).nullish(),
  probe: z.string().max(10).nullish(),
});

const errorResponse = (message: string, status: number) =>
  new Response(message, { status, headers: corsHeaders });

// Browsers commonly ask for `bytes=0-`. Passing that through makes the CDN
// return the entire movie in one response, which hosted edge connections can
// terminate before the player has buffered enough metadata. Serve open-ended
// playback requests in bounded pieces; the browser automatically asks for the
// next piece and seeking continues to work through normal Range requests.
const PLAYBACK_CHUNK_BYTES = 8 * 1024 * 1024;
const boundedPlaybackRange = (range: string | null) => {
  if (!range) return `bytes=0-${PLAYBACK_CHUNK_BYTES - 1}`;
  const openEnded = /^bytes=(\d+)-$/i.exec(range.trim());
  if (!openEnded) return range;
  const start = Number(openEnded[1]);
  if (!Number.isSafeInteger(start) || start < 0) return range;
  return `bytes=${start}-${start + PLAYBACK_CHUNK_BYTES - 1}`;
};

export const Route = createFileRoute("/api/public/movie")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return errorResponse("Invalid media request", 400);
        const { subjectId, se, ep, resourceId } = parsed.data;
        const wanted = parsed.data.res;
        const requestedName = parsed.data.dl ?? null;
        const probe = parsed.data.probe !== null && parsed.data.probe !== undefined;
        const filename = safeName(requestedName ?? "movie.mp4");

        const selectSource = (items: Awaited<ReturnType<typeof fetchSources>>) =>
          items.find((item) => item.id === resourceId) ??
          items.find((item) => wanted > 0 && item.resolution === wanted);
        const sources = await fetchSources(subjectId, se, ep).catch(() => []);
        let source = selectSource(sources);
        if (!source) return errorResponse("Full movie file is unavailable", 404);

        // TV play-info includes the full file size. Return it immediately so
        // the download dialog never waits for the large media host to answer.
        if (probe && source.bytes > 0) {
          return Response.json(
            { size: source.bytes, type: "video/mp4" },
            {
              headers: {
                "cache-control": "private, max-age=60",
                ...corsHeaders,
              },
            },
          );
        }

        const incomingRange = request.headers.get("range");
        const range = probe
          ? "bytes=0-0"
          : requestedName
            ? incomingRange
            : boundedPlaybackRange(incomingRange);
        // The media host returns 403 for requests without a browser
        // User-Agent (the hosted server sends none by default).
        const mediaHeaders = (): Record<string, string> => ({
          "user-agent":
            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
          accept: "*/*",
          ...(range ? { range } : {}),
        });
        // Cloudflare egress is sometimes refused by the media host even when
        // the same full file is available to the viewer's browser. Redirect
        // without a Referer so the host does not reject the follow-up request
        // as hotlinking. 307 preserves Range for playback and resumable files.
        const directFallback = (url: string) =>
          !probe
            ? new Response(null, {
                status: 307,
                headers: {
                  location: url,
                  "cache-control": "no-store",
                  "referrer-policy": "no-referrer",
                  "cross-origin-resource-policy": "cross-origin",
                  ...corsHeaders,
                },
              })
            : null;
        const safeFetch = (url: string) =>
          fetch(url, { headers: mediaHeaders() }).catch(() => null);
        let upstream = await safeFetch(source.url);
        // A signed CDN URL may expire during a long range download. Refresh
        // play-info once and retry the exact same range against the same file.
        if (!upstream || [401, 403, 404, 410, 429].includes(upstream.status)) {
          await upstream?.body?.cancel();
          const freshSources = await fetchFreshSources(subjectId, se, ep).catch(() => []);
          source = selectSource(freshSources) ?? source;
          upstream = await safeFetch(source.url);
        }
        if (!upstream || (!upstream.ok && upstream.status !== 206)) {
          await upstream?.body?.cancel();
          if (probe) {
            // The media host refused our server; the browser can read the size itself.
            return Response.json(
              { size: source.bytes || null, type: "video/mp4", direct: source.url },
              { headers: { "cache-control": "no-store", ...corsHeaders } },
            );
          }
          return (
            directFallback(source.url) ??
            errorResponse("Full movie file could not be opened", 502)
          );
        }

        if (probe) {
          const contentRange = upstream.headers.get("content-range");
          const rangedSize = contentRange ? Number(contentRange.split("/")[1]) || 0 : 0;
          const size = rangedSize || Number(upstream.headers.get("content-length")) || source.bytes || 0;
          await upstream.body?.cancel();
          return Response.json(
            { size: size || null, type: upstream.headers.get("content-type") ?? "video/mp4" },
            {
              headers: {
                "cache-control": "private, max-age=60",
                ...corsHeaders,
              },
            },
          );
        }

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
        headers.set("content-type", "video/mp4");
        headers.set("cache-control", "private, no-store");
        for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
        headers.set("x-content-type-options", "nosniff");
        if (requestedName) headers.set("content-disposition", `attachment; filename="${filename}"`);
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
