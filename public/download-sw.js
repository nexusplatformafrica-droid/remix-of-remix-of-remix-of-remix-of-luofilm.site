/* Download service worker (v4).
 * Links to /__dl/file?src=<same-origin path>&name=<file>&size=<bytes> are
 * answered here: the worker fetches the file itself (with the signed-in
 * page's cookies) and streams it back with Content-Disposition: attachment,
 * so the browser's own download manager saves the real file with progress.
 * No state is kept between requests, so worker restarts can't break it.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== "/__dl/file") return;
  event.respondWith(handle(url));
});

async function handle(url) {
  const src = url.searchParams.get("src") || "";
  const name = url.searchParams.get("name") || "download";
  const knownSize = Number(url.searchParams.get("size")) || 0;
  if (!src.startsWith("/api/public/")) return new Response("Bad request", { status: 400 });

  const target = new URL(src, self.location.origin).toString();
  let upstream;
  try {
    // same-origin credentials: cookies still reach our own server, and a
    // redirect to a media CDN that answers "Access-Control-Allow-Origin: *"
    // is still allowed (credentialed requests would be blocked there).
    upstream = await fetch(target, { credentials: "same-origin", cache: "no-store" });
  } catch {
    // The file host refused to be streamed through the page: let the browser
    // download it directly instead (the host sends it as an attachment).
    return Response.redirect(target, 302);
  }
  if (!upstream.ok || !upstream.body) {
    if (upstream.status >= 500 || upstream.status === 403 || upstream.status === 429) {
      return Response.redirect(target, 302);
    }
    return new Response("Download failed", { status: upstream.status || 502 });
  }
  const size = Number(upstream.headers.get("content-length")) || knownSize;
  const safe = name.replace(/["\\\r\n]/g, "");
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (size > 0) headers.set("Content-Length", String(size));
  return new Response(upstream.body, { status: 200, headers });
}
