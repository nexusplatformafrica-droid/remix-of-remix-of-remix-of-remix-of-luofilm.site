import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PDetails, PItem, PMirror, PSource, ProviderId } from "./providers/types";

const pid = z.enum(["4khdhub", "dramachi", "addons", "circleftp", "dhakaflix"]);

async function searchOne(provider: ProviderId, q: string): Promise<PItem[]> {
  const fk = await import("./providers/fourkhdhub.server");
  const o = await import("./providers/others.server");
  switch (provider) {
    case "4khdhub": return fk.fkSearch(q);
    case "dramachi": return o.drSearch(q);
    case "addons": return o.cmSearch(q);
    case "circleftp": return o.cfSearch(q);
    case "dhakaflix": return o.dfSearch();
  }
}

/** One provider's results. Errors come back as a message, never a crash. */
export const providerSearch = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ provider: pid, q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }): Promise<{ items: PItem[]; error: string | null }> => {
    try {
      return { items: (await searchOne(data.provider, data.q)).slice(0, 40), error: null };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "Unavailable" };
    }
  });

export const providerHome = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ provider: pid }).parse(d))
  .handler(async ({ data }): Promise<{ items: PItem[]; error: string | null }> => {
    try {
      const fk = await import("./providers/fourkhdhub.server");
      const o = await import("./providers/others.server");
      const items =
        data.provider === "4khdhub" ? await fk.fkHome()
        : data.provider === "dramachi" ? await (async () => {
            const seen = new Set<string>();
            const all = await Promise.all(["2026", "2025", "2024"].flatMap((y) => [1, 2].map((pg) => o.drSearch(y, pg).catch(() => []))));
            return all.flat().filter((i) => !seen.has(i.id) && !!seen.add(i.id));
          })()
        : data.provider === "addons" ? await o.cmHome()
        : data.provider === "circleftp" ? await o.cfHome()
        : await o.dfSearch();
      return { items, error: null };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "Unavailable" };
    }
  });

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9]+/g, " ").replace(/\b(19|20)\d{2}\b/g, "").trim();

export const providerDetails = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ provider: pid, id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ details: PDetails; sources: PSource[] }> => {
    const fk = await import("./providers/fourkhdhub.server");
    const o = await import("./providers/others.server");
    if (data.provider === "4khdhub") return fk.fkDetails(data.id);
    if (data.provider === "dramachi") return o.drDetails(data.id);
    if (data.provider === "circleftp") return o.cfDetails(data.id);
    if (data.provider === "addons") {
      // Cinemeta has no files: collect sources for the same title from every provider.
      const details = await o.cmDetails(data.id);
      const want = norm(details.title);
      const pick = (items: PItem[]) =>
        items.find((i) => norm(i.title) === want && (!details.year || !i.year || i.year === details.year)) ??
        items.find((i) => norm(i.title) === want);
      const [fkRes, drRes] = await Promise.all([
        fk.fkSearch(details.title).then(pick).catch(() => undefined),
        o.drSearch(details.title).then(pick).catch(() => undefined),
      ]);
      const groups = await Promise.all([
        fkRes ? fk.fkDetails(fkRes.id).then((r) => r.sources).catch(() => []) : [],
        drRes ? o.drDetails(drRes.id).then((r) => r.sources).catch(() => []) : [],
      ]);
      return { details, sources: groups.flat() };
    }
    throw new Error("DhakaFlix is only reachable from Bangladesh BDIX networks.");
  });

/** Turn a source token into fresh direct file links. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Returns the URL if it answers with real media bytes, null otherwise. */
async function liveMediaUrl(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-1", "user-agent": UA }, signal: ctl.signal });
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    await res.body?.cancel().catch(() => {});
    if ((res.status === 200 || res.status === 206) && !/text\/|json|xml|mpegurl/.test(type)) return url;
    // Landing pages like ".../dl.php?link=<real file>" wrap the real file link.
    const inner = new URL(res.url || url).searchParams.get("link");
    if (inner?.startsWith("https://") && inner !== url) return liveMediaUrl(inner);
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Puts mirrors that really return the file first and drops dead ones. */
async function liveMirrors(list: PMirror[]): Promise<PMirror[]> {
  const checked = await Promise.all(
    list.slice(0, 8).map(async (m) => {
      const url = await liveMediaUrl(m.url);
      return url ? { ...m, url } : null;
    }),
  );
  const ok = checked.filter((m): m is PMirror => m !== null);
  if (!ok.length) throw new Error("This source's files are offline right now — try another quality.");
  return ok;
}

export const resolveSource = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(3).max(2000) }).parse(d))
  .handler(async ({ data }): Promise<PMirror[]> => {
    const [kind, ...rest] = data.token.split("|");
    if (kind === "4k") {
      const { fkResolve } = await import("./providers/fourkhdhub.server");
      return liveMirrors(await fkResolve(rest.join("|")));
    }
    if (kind === "dr") {
      const { drResolve } = await import("./providers/others.server");
      return liveMirrors(await drResolve(rest[0] ?? "", rest[1] ?? ""));
    }
    if (kind === "url") return liveMirrors([{ label: "Direct", url: rest.join("|") }]);
    throw new Error("Unknown source");
  });
