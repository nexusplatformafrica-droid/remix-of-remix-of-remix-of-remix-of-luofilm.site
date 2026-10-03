import {
  detectExt,
  detectQuality,
  isBrowserPlayable,
  type PDetails,
  type PItem,
  type PMirror,
  type PSource,
} from "./types";

const t = (ms: number) => AbortSignal.timeout(ms);
const json = async <T>(url: string, init?: RequestInit, ms = 15000): Promise<T> => {
  const res = await fetch(url, { ...init, signal: t(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
};

// ---------------- Dramachi ----------------
const DR = "https://api.nodeobjects.com/";
const DR_IMG = "https://static.nodeobjects.com/thumbnail/";
type DrItem = { id: string; title: string; year?: string; thumb?: string; content?: string };

const drItem = (i: DrItem): PItem => ({
  provider: "dramachi",
  id: String(i.id),
  title: i.title,
  type: /movie/i.test(i.content ?? "") ? "movie" : "series",
  year: i.year?.trim() || null,
  poster: i.thumb ? `${DR_IMG}${i.thumb.trim()}` : null,
});

export async function drSearch(q: string, page = 1) {
  const d = await json<{ data?: DrItem[] }>(
    `${DR}?interface=search&q=${encodeURIComponent(q)}&filter=all&page=${page}`,
  );
  return (d.data ?? []).map(drItem);
}

type DrTitle = {
  album?: (DrItem & { storyline?: string; genres?: string })[];
  seasons?: Record<string, { season_name?: string; versions?: { version_name?: string; rip: string }[] }>;
};
type DrEp = { f_title: string; fid: string; disk: string; size?: string; quality?: string; title?: string };

export async function drDetails(id: string): Promise<{ details: PDetails; sources: PSource[] }> {
  const d = await json<DrTitle>(`${DR}?interface=title_v2&id=${encodeURIComponent(id)}`);
  const a = d.album?.[0];
  if (!a) throw new Error("Not found");
  const base = drItem(a);
  const details: PDetails = { ...base, overview: a.storyline ?? null, backdrop: base.poster, genres: a.genres ?? null };
  const rips = Object.entries(d.seasons ?? {}).flatMap(([name, g]) =>
    (g.versions ?? [{ rip: name }]).map((v) => ({
      group: v.version_name && v.version_name !== "Original" ? `${name} · ${v.version_name}` : name,
      rip: v.rip,
    })),
  );
  const lists = await Promise.all(
    rips.slice(0, 6).map(async (r) => {
      const l = await json<{ episode_list?: DrEp[] }>(
        `${DR}?interface=eplist&season=${encodeURIComponent(r.rip)}&id=${encodeURIComponent(id)}`,
      ).catch(() => ({ episode_list: [] as DrEp[] }));
      return (l.episode_list ?? []).map((e): PSource => {
        const quality = e.quality ? detectQuality(e.quality) : "SD";
        return {
          provider: "dramachi",
          filename: e.f_title,
          group: r.group,
          quality: quality === "SD" && e.quality ? e.quality : quality,
          size: e.size ?? null,
          ext: "mkv",
          playable: true,
          token: `dr|${e.fid}|${e.disk}`,
        };
      });
    }),
  );
  return { details, sources: lists.flat() };
}

export async function drResolve(fid: string, disk: string): Promise<PMirror[]> {
  const d = await json<{
    fileInfo?: { url?: string; filename?: string; ext?: string }[];
    hostInfo?: { host: string };
  }>(`${DR}?interface=getFile&fid=${encodeURIComponent(fid)}&findex=${encodeURIComponent(disk)}`);
  const f = d.fileInfo?.[0];
  if (!f?.url || !d.hostInfo?.host) throw new Error("File not found");
  return [
    {
      label: f.filename ?? "Dramachi",
      url: `https://${d.hostInfo.host.replace(/\/$/, "")}/cdn/${f.url.replace(/^\//, "")}`,
    },
  ];
}

// ---------------- Addons (Stremio Cinemeta) ----------------
const CM = "https://v3-cinemeta.strem.io";
type Meta = { id: string; type: string; name: string; poster?: string; background?: string; releaseInfo?: string; year?: string; description?: string; genres?: string[] };
const cmItem = (m: Meta): PItem => ({
  provider: "addons",
  id: `${m.type}:${m.id}`,
  title: m.name,
  type: m.type === "series" ? "series" : "movie",
  year: (m.releaseInfo ?? m.year ?? "").slice(0, 4) || null,
  poster: m.poster ?? null,
});

export async function cmSearch(q: string) {
  const s = encodeURIComponent(q);
  const [mv, sr] = await Promise.all([
    json<{ metas?: Meta[] }>(`${CM}/catalog/movie/top/search=${s}.json`).catch(() => ({ metas: [] })),
    json<{ metas?: Meta[] }>(`${CM}/catalog/series/top/search=${s}.json`).catch(() => ({ metas: [] })),
  ]);
  return [...(mv.metas ?? []), ...(sr.metas ?? [])].map(cmItem);
}

export async function cmHome() {
  const d = await json<{ metas?: Meta[] }>(`${CM}/catalog/movie/top.json`);
  return (d.metas ?? []).slice(0, 60).map(cmItem);
}

export async function cmDetails(id: string): Promise<PDetails> {
  const [type, imdb] = id.split(":");
  if (!/^(movie|series)$/.test(type ?? "") || !/^tt\d+$/.test(imdb ?? "")) throw new Error("Bad id");
  const d = await json<{ meta?: Meta }>(`${CM}/meta/${type}/${imdb ?? ""}.json`);
  if (!d.meta) throw new Error("Not found");
  return {
    ...cmItem(d.meta),
    overview: d.meta.description ?? null,
    backdrop: d.meta.background ?? d.meta.poster ?? null,
    genres: d.meta.genres?.join(", ") ?? null,
  };
}

// ---------------- BDIX (CircleFTP / DhakaFlix) ----------------
const CF = "http://new.circleftp.net:5000";
type CfPost = { id: number; title?: string; name?: string; type?: string; year?: unknown; image?: string; image_sm?: string };
const cfItem = (p: CfPost): PItem => ({
  provider: "circleftp",
  id: String(p.id),
  title: p.title ?? p.name ?? `#${p.id}`,
  type: p.type === "series" ? "series" : "movie",
  year: p.year ? String(p.year) : null,
  poster: p.image_sm || p.image ? `${CF}/uploads/${p.image_sm || p.image}` : null,
});

export async function cfSearch(q: string) {
  const d = await json<{ posts?: CfPost[] }>(`${CF}/api/posts?searchTerm=${encodeURIComponent(q)}&order=desc`, undefined, 5000);
  return (d.posts ?? []).map(cfItem);
}
export async function cfHome() {
  const d = await json<{ posts?: CfPost[] }>(`${CF}/api/posts?page=1&order=desc`, undefined, 5000);
  return (d.posts ?? []).map(cfItem);
}
export async function cfDetails(id: string): Promise<{ details: PDetails; sources: PSource[] }> {
  const p = await json<CfPost & { content?: unknown; metaData?: string }>(`${CF}/api/posts/${Number(id)}`, undefined, 6000);
  const base = cfItem(p);
  const urls = JSON.stringify(p.content ?? "").match(/https?:\/\/[^"\\\s]+\.(?:mkv|mp4|avi|webm)/gi) ?? [];
  return {
    details: { ...base, overview: p.metaData ?? null, backdrop: base.poster, genres: null },
    sources: [...new Set(urls)].map((u) => {
      const name = decodeURIComponent(u.split("/").pop() ?? u);
      const ext = detectExt(name);
      return { provider: "circleftp", filename: name, group: null, quality: detectQuality(name), size: null, ext, playable: isBrowserPlayable(name, ext), token: `url|${u}` };
    }),
  };
}

/** DhakaFlix only lives on private 172.16.50.x BDIX servers. */
export async function dfSearch(): Promise<PItem[]> {
  throw new Error("DhakaFlix is only reachable from Bangladesh BDIX networks.");
}
