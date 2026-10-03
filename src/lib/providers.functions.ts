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
        : data.provider === "dramachi" ? await o.drSearch("2025")
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
export const resolveSource = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(3).max(2000) }).parse(d))
  .handler(async ({ data }): Promise<PMirror[]> => {
    const [kind, ...rest] = data.token.split("|");
    if (kind === "4k") {
      const { fkResolve } = await import("./providers/fourkhdhub.server");
      return fkResolve(rest.join("|"));
    }
    if (kind === "dr") {
      const { drResolve } = await import("./providers/others.server");
      return drResolve(rest[0], rest[1]);
    }
    if (kind === "url") return [{ label: "Direct", url: rest.join("|") }];
    throw new Error("Unknown source");
  });
