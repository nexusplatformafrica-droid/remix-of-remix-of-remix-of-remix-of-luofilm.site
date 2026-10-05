import { base64ToBytes, bytesToBase64, hmacMd5, md5Hex } from "./md5";

const SECRET = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";

const HOSTS = [
  "https://api7.aoneroom.com",
  "https://api8.aoneroom.com",
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com",
];

/** Legacy mobile BFF prefix — kept only as a fallback / for home rails. */
export const API_PREFIX = "/wefeed-mobile-bff";

/**
 * TV BFF (APK com.community.mbox.tv 1.1.11.0915.03). Verified live: the
 * `/wefeed-tv-bff/*` routes are only served by the TV gateway host; the
 * api3–api8 hosts answer 404 for them.
 */
export const TV_PREFIX = "/wefeed-tv-bff";
const TV_HOSTS = ["https://tv.aoneroom.com"];

/**
 * Web BFF (movieboxhd.net). No request signature — the gateway only answers
 * fully when the request carries the exact browser header set below, and it
 * issues an anonymous Bearer token through the `x-user` response header.
 * Playback goes through the media domain returned by /media-player/get-domain.
 */
export const WEB_PREFIX = "/wefeed-h5api-bff";
const WEB_HOST = "https://h5-api.aoneroom.com";
const WEB_REFERER =
  "https://mzfi.me/spa/videoPlayPage/movies/x?id=0&detailSe=&detailEp=&lang=en&type=%2Fmovie%2Fdetail";

const RETRY_STATUS = new Set([403, 406, 407, 408, 425, 429, 500, 502, 503, 504]);

const encoder = new TextEncoder();
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

const md5 = (data: string | Uint8Array) => md5Hex(data);

/**
 * Canonical query per APK 4.0.02.0831.02: pairs are URL-decoded, duplicate
 * names overwrite (the client uses a map), then sorted by decoded name.
 */
function sortedQuery(url: URL) {
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      return value;
    }
  };
  const values = new Map<string, string>();
  for (const part of url.search.slice(1).split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    values.set(decode(eq < 0 ? part : part.slice(0, eq)), decode(eq < 0 ? "" : part.slice(eq + 1)));
  }
  return [...values.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function canonicalString(method: string, url: string, body: string | null, ts: number) {
  const parsed = new URL(url);
  const query = sortedQuery(parsed);
  const canonicalUrl = query ? `${parsed.pathname}?${query}` : parsed.pathname;
  // UTF-16 string length (Java/Kotlin semantics) and a 102,400-character —
  // not byte — body prefix for the hash.
  const bodyHash = body ? md5(encoder.encode(body.slice(0, 102_400))) : "";
  const bodyLength = body ? String(body.length) : "";
  return [
    method.toUpperCase(),
    "application/json",
    "application/json",
    bodyLength,
    String(ts),
    bodyHash,
    canonicalUrl,
  ].join("\n");
}

function signature(method: string, url: string, body: string | null, ts: number) {
  const padded = SECRET + "=".repeat((4 - (SECRET.length % 4)) % 4);
  const key = base64ToBytes(padded);
  const digest = bytesToBase64(
    hmacMd5(key, encoder.encode(canonicalString(method, url, body, ts))),
  );
  return `${ts}|2|${digest}`;
}

function randomHex(len: number) {
  let out = "";
  for (let i = 0; i < len; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function pick<T>(list: readonly T[]) {
  return list[Math.floor(Math.random() * list.length)]!;
}

type Identity = { userAgent: string; clientInfo: string; ip: string };

let identity: Identity | null = null;
let runtimeToken: string | null = null;
let activeHost = 0;

function getIdentity(): Identity {
  if (identity) return identity;
  // Stable per server process (rotating identities triggers throttling).
  const versionCode = 50040017;
  const model = "23078RKD5C";
  identity = {
    userAgent: `com.community.mbox.tv/${versionCode} (Linux; U; Android 13; en_US; ${model}; Build/TQ2A.230405.003; Cronet/135.0.7012.3)`,
    clientInfo: JSON.stringify({
      package_name: "com.community.mbox.tv",
      version_name: "1.1.11.0915.03",
      version_code: versionCode,
      os: "android",
      os_version: "13",
      install_ch: "ps",
      install_store: "ps",
      device_id: randomHex(32),
      gaid: `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`,
      phone_brand: "Redmi",
      brand: "Redmi",
      model,
      system_language: "en",
      net: "NETWORK_WIFI",
      region: "US",
      timezone: "UTC",
      sp_code: "40401",
      "X-Play-Mode": "2",
    }),
    // US egress ranges: the catalog serves its US home layout for these.
    ip: `${pick(["24.60", "66.176", "72.229", "98.115", "173.68"] as const)}.${
      1 + Math.floor(Math.random() * 253)
    }.${1 + Math.floor(Math.random() * 253)}`,
  };
  return identity;
}

let initPromise: Promise<void> | null = null;

async function ensureToken() {
  if (runtimeToken) return;
  if (!initPromise) {
    initPromise = rawRequest("GET", "/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=")
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        initPromise = null;
      });
  }
  await initPromise;
}

export async function request(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<any> {
  await ensureToken();
  try {
    return await rawRequest(method, path, payload);
  } catch {
    // Every host refused — most often a stale/expired runtime token. Drop it,
    // re-handshake once and replay the call before giving up.
    runtimeToken = null;
    await ensureToken();
    return rawRequest(method, path, payload);
  }
}

/**
 * Signed GET against the TV BFF. `query` values are encoded once and the exact
 * same string is both signed and sent.
 */
export async function tvRequest(
  route: string,
  query: Record<string, string | number | undefined | null> = {},
): Promise<any> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const path = `${TV_PREFIX}${route}${qs ? `?${qs}` : ""}`;
  return rawRequest("GET", path, undefined, TV_HOSTS);
}

/* ------------------------------------------------------------------------- *
 * Web BFF layer
 * ------------------------------------------------------------------------- */

let webToken: string | null = null;
let webInitPromise: Promise<void> | null = null;
let mediaDomain: string | null = null;

/** subjectId -> detailPath slug, captured whenever a subject passes through. */
const detailPathCache = new Map<string, string>();
function rememberDetailPath(subject: any) {
  const id = subject?.subjectId ? String(subject.subjectId) : "";
  const slug = typeof subject?.detailPath === "string" ? subject.detailPath : "";
  if (id && slug) {
    detailPathCache.set(id, slug);
    if (detailPathCache.size > 2000) detailPathCache.delete(detailPathCache.keys().next().value!);
  }
}

function webHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "sec-ch-ua": '"Chromium";v="141", "Not?A_Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "x-client-info": JSON.stringify({ timezone: "UTC" }),
    "x-no-high-risk-restrict": "0",
    "x-vip-restrict": "1",
    "x-source": "",
    referer: WEB_REFERER,
  };
  if (!isBrowser) {
    headers["user-agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
  }
  if (webToken) headers["authorization"] = `Bearer ${webToken}`;
  return headers;
}

async function webRaw(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
  host: string = WEB_HOST,
): Promise<any> {
  const res = await fetch(`${host}${WEB_PREFIX}${path}`, {
    method,
    headers: webHeaders(),
    body: payload === undefined ? null : JSON.stringify(payload),
  });
  const xUser = res.headers.get("x-user");
  if (xUser) {
    try {
      const token = JSON.parse(xUser)?.token;
      if (typeof token === "string" && token) webToken = token;
    } catch {
      /* ignore malformed header */
    }
  }
  if (!res.ok) throw new Error(`web ${res.status}`);
  const json = (await res.json()) as any;
  if (json && typeof json.code === "number" && json.code !== 0 && json.code !== 200)
    throw new Error(`web code ${json.code}`);
  return json?.data ?? json;
}

async function ensureWebToken() {
  if (webToken) return;
  if (!webInitPromise) {
    webInitPromise = webRaw("GET", "/country-code")
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        webInitPromise = null;
      });
  }
  await webInitPromise;
}

export async function webRequest(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
  host?: string,
): Promise<any> {
  await ensureWebToken();
  try {
    return await webRaw(method, path, payload, host);
  } catch {
    webToken = null;
    await ensureWebToken();
    return webRaw(method, path, payload, host);
  }
}

/** Media domain that serves subject/play (e.g. https://mzfi.me). */
async function getMediaDomain(): Promise<string> {
  if (mediaDomain) return mediaDomain;
  const data = await webRequest("GET", "/media-player/get-domain").catch(() => null);
  const url = typeof data === "string" && data.startsWith("https://") ? data.replace(/\/$/, "") : "";
  mediaDomain = url || "https://mzfi.me";
  return mediaDomain;
}

async function rawRequest(
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
  hosts: string[] = HOSTS,
): Promise<any> {
  const body = payload === undefined ? null : JSON.stringify(payload);
  const id = getIdentity();
  const useActive = hosts === HOSTS;

  for (let i = 0; i < hosts.length; i += 1) {
    const idx = useActive ? (activeHost + i) % hosts.length : i;
    const url = `${hosts[idx]}${path}`;
    const ts = Date.now();
    const reversed = [...String(ts)].reverse().join("");

    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      "x-client-token": `${ts},${md5(reversed)}`,
      "x-tr-signature": signature(method, url, body, ts),
      "x-tr-signature-method": "2",
      "x-client-info": id.clientInfo,
      "x-client-status": "0",
    };
    // Browsers forbid setting these; only send them from a server runtime.
    if (!isBrowser) {
      headers["user-agent"] = id.userAgent;
      headers["x-forwarded-for"] = id.ip;
    }
    if (runtimeToken) headers["authorization"] = `Bearer ${runtimeToken}`;

    try {
      const res = await fetch(url, { method, headers, body: body ?? null });
      const xUser = res.headers.get("x-user");
      if (xUser) {
        try {
          const token = JSON.parse(xUser)?.token;
          if (typeof token === "string" && token) runtimeToken = token;
        } catch {
          /* ignore malformed header */
        }
      }
      if (res.status === 441 || res.status === 401) runtimeToken = null;
      if (RETRY_STATUS.has(res.status) || !res.ok) continue;
      const json = (await res.json()) as any;
      if (json && typeof json.code === "number" && json.code !== 0 && json.code !== 200) continue;
      if (useActive) activeHost = idx;
      return json?.data ?? json;
    } catch {
      continue;
    }
  }
  throw new Error("Unable to reach the catalog right now. Please try again.");
}

export type CatalogItem = {
  id: string;
  title: string;
  type: "movie" | "series";
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: string | null;
  genre: string | null;
  /** Upcoming release date (Coming Soon rail), ISO-ish string from the catalog. */
  appointmentDate?: string | null;
  /** How many users pre-booked an upcoming title. */
  booked?: number | null;
};

/**
 * The catalog serves original artwork that can be several megabytes per file.
 * Its image CDN supports on-the-fly resizing, so request display-sized images
 * instead. The transformed URL is stable and can stay in the browser/CDN cache.
 */
function artworkUrl(value: unknown, width: number): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.endsWith("aoneroom.com") && !url.searchParams.has("x-oss-process")) {
      url.searchParams.set("x-oss-process", `image/resize,w_${width}/quality,q_82`);
    }
    return url.toString();
  } catch {
    return value;
  }
}

const cleanTitle = (raw: string) =>
  raw
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export function toItem(subject: any): CatalogItem | null {
  if (!subject?.subjectId || !subject?.title) return null;
  rememberDetailPath(subject);
  return {
    id: String(subject.subjectId),
    title: cleanTitle(String(subject.title)),
    type: Number(subject.subjectType) === 2 ? "series" : "movie",
    year: subject.releaseDate ? String(subject.releaseDate).slice(0, 4) : null,
    poster: artworkUrl(subject.cover?.url, 400),
    backdrop: artworkUrl(subject.stills?.url ?? subject.cover?.url, 1440),
    rating: subject.imdbRatingValue ? String(subject.imdbRatingValue) : null,
    genre: subject.genre ? String(subject.genre).split(",").slice(0, 3).join(" · ") : null,
    appointmentDate: subject.appointmentDate ? String(subject.appointmentDate) : null,
    booked: typeof subject.viewers === "number" ? subject.viewers : null,
  };
}

export async function fetchHome() {
  const data = await request("GET", "/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=");
  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  const hero: CatalogItem[] = [];
  const rows: { title: string; items: CatalogItem[] }[] = [];
  // Real upstream trending rail ("🔥Trending Now") and the appointment list.
  let trending: CatalogItem[] = [];
  let comingSoon: CatalogItem[] = [];
  const seen = new Set<string>();

  for (const block of items) {
    if (block?.banner?.banners) {
      for (const banner of block.banner.banners) {
        const item = toItem(banner.subject);
        if (item && banner.image?.url) {
          hero.push({ ...item, backdrop: artworkUrl(banner.image.url, 1440) });
        }
      }
      continue;
    }
    const subjects: CatalogItem[] = [];
    const push = (subject: any) => {
      const item = toItem(subject);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        subjects.push(item);
      }
    };
    if (Array.isArray(block?.subjects)) block.subjects.forEach(push);
    if (Array.isArray(block?.groups)) {
      for (const group of block.groups)
        if (Array.isArray(group?.subjects)) group.subjects.forEach(push);
    }
    const title = String(block?.title || "Popular now");
    if (block?.type === "APPOINTMENT_LIST" || /coming soon/i.test(title)) {
      if (subjects.length) comingSoon = [...comingSoon, ...subjects];
      continue;
    }
    if (/trending/i.test(title) && subjects.length >= 4 && trending.length < 18) {
      trending = [...trending, ...subjects];
    }
    if (subjects.length >= 4) {
      rows.push({ title, items: subjects.slice(0, 18) });
    }
  }

  return {
    hero: hero.slice(0, 5),
    rows: rows.slice(0, 10),
    trending: trending.slice(0, 20),
    comingSoon: comingSoon.slice(0, 20),
  };
}

/** Emoji / decoration stripped rail title. */
const railTitle = (raw: string) =>
  raw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Every real, populated rail of one upstream tab (0 = home, 2 = movies,
 * 5 = TV series). Banners, filters and empty promo blocks are skipped, so what
 * comes back is exactly the catalog's own live sections with live items.
 */
export async function fetchTabRows(tabId: number) {
  const data = await request(
    "GET",
    `/wefeed-mobile-bff/tab-operating?page=1&tabId=${tabId}&version=`,
  ).catch(() => null);
  const blocks: any[] = Array.isArray(data?.items) ? data.items : [];
  const rows: { title: string; items: CatalogItem[] }[] = [];
  const takenTitles = new Set<string>();

  for (const block of blocks) {
    if (block?.banner || block?.type === "FILTER" || block?.type === "BANNER") continue;
    const seen = new Set<string>();
    const items: CatalogItem[] = [];
    const push = (subject: any) => {
      const item = toItem(subject);
      if (item?.poster && !seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    };
    if (Array.isArray(block?.subjects)) block.subjects.forEach(push);
    if (Array.isArray(block?.groups)) {
      for (const group of block.groups)
        if (Array.isArray(group?.subjects)) group.subjects.forEach(push);
    }
    if (items.length < 4) continue;
    const title = railTitle(String(block?.title || ""));
    if (!title || /appointment|coming soon/i.test(title)) continue;
    const key = title.toLowerCase();
    if (takenTitles.has(key)) {
      // Upstream repeats some rails; merge instead of showing them twice.
      const existing = rows.find((r) => r.title.toLowerCase() === key)!;
      const ids = new Set(existing.items.map((i) => i.id));
      existing.items = [...existing.items, ...items.filter((i) => !ids.has(i.id))].slice(0, 24);
      continue;
    }
    takenTitles.add(key);
    rows.push({ title, items: items.slice(0, 24) });
  }
  return rows;
}

/**
 * A broad, live "trending" line-up: the catalog's own trending rail plus the
 * Hollywood / Western TV / Asian and in-progress-series rails, interleaved so
 * the row is a real worldwide mix instead of one region's feed. Regional dub
 * rails (Bollywood, South Indian, Hindi short TV…) are skipped on purpose.
 */
export async function fetchMostTrending(): Promise<CatalogItem[]> {
  const [home, movies, series] = await Promise.all([
    fetchTabRows(0),
    fetchTabRows(2),
    fetchTabRows(5),
  ]);
  const SKIP = /bollywood|south indian|indian|hindi|tamil|telugu|hot short tv|punjabi/i;
  const pick = (rows: { title: string; items: CatalogItem[] }[], re: RegExp) =>
    rows.filter((r) => re.test(r.title) && !SKIP.test(r.title)).flatMap((r) => r.items);

  // Each entry is one "lane"; we take one title from each lane in turn.
  const lanes = [
    pick(home, /trending/i),
    pick(home, /hollywood/i),
    pick(series, /series in progress|top series this week|trending/i),
    pick(home, /western tv/i),
    pick(movies, /trending|top movies|adventure|sci-fi|super hero/i),
    pick(home, /best asian series/i),
    pick(series, /fantasy chronicles|action hardcore/i),
  ].filter((lane) => lane.length);

  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  const depth = Math.max(0, ...lanes.map((l) => l.length));
  for (let i = 0; i < depth && out.length < 30; i += 1) {
    for (const lane of lanes) {
      const item = lane[i];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out.slice(0, 30);
}

/** All live catalog rails from the movie + TV tabs, for the home page. */
export async function fetchLiveRails() {
  const [movies, series] = await Promise.all([fetchTabRows(2), fetchTabRows(5)]);
  const out: { title: string; items: CatalogItem[] }[] = [];
  const seen = new Set<string>();
  // Interleave TV and movie rails so the page alternates instead of grouping.
  for (let i = 0; i < Math.max(series.length, movies.length); i += 1) {
    for (const row of [series[i], movies[i]]) {
      if (!row) continue;
      const key = row.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** Raw subject list from TV `search/result` (null when the TV gateway fails). */
async function tvSearchSubjects(keyword: string, page = 1): Promise<any[] | null> {
  const data = await tvRequest("/search/result", { keyword, page, perPage: 20 }).catch(() => null);
  return Array.isArray(data?.items) ? data.items : null;
}

async function mobileSearchSubjects(keyword: string, page = 1): Promise<any[]> {
  const data = await request("POST", "/wefeed-mobile-bff/subject-api/search/v2", {
    keyword,
    page,
    perPage: 20,
    subjectType: "All",
    tabId: "All",
  });
  return (data?.results ?? []).flatMap((r: any) => r?.subjects ?? []);
}

/** Web BFF search (POST /subject/search) — the same search the website uses. */
async function webSearchSubjects(keyword: string, page = 1): Promise<any[] | null> {
  const data = await webRequest("POST", "/subject/search", {
    keyword,
    page,
    perPage: 20,
  }).catch(() => null);
  return Array.isArray(data?.items) ? data.items : null;
}

export async function searchCatalog(keyword: string, page = 1) {
  const subjects =
    (await webSearchSubjects(keyword, page)) ??
    (await tvSearchSubjects(keyword, page)) ??
    (await mobileSearchSubjects(keyword, page));
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const subject of subjects) {
    const item = toItem(subject);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Live autocomplete words from TV `search/suggest`. */
export async function suggestSearch(keyword: string): Promise<string[]> {
  const data = await tvRequest("/search/suggest", { keyword }).catch(() => null);
  return (Array.isArray(data?.items) ? data.items : [])
    .map((i: any) => (typeof i?.word === "string" ? i.word : ""))
    .filter(Boolean)
    .slice(0, 10);
}

export type CastMember = { name: string; character: string | null; avatar: string | null };

export type TitleDetails = CatalogItem & {
  description: string | null;
  duration: string | null;
  country: string | null;
  language: string | null;
  cast: CastMember[];
  seasons: { season: number; episodes: number }[];
};

export async function fetchDetails(subjectId: string): Promise<TitleDetails> {
  const tv = await tvRequest("/subject/get", { subjectId }).catch(() => null);
  const data = tv?.subjectId
    ? tv
    : await request("GET", `/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`);
  const base = toItem(data);
  if (!base) throw new Error("Title not found");

  let seasons: { season: number; episodes: number }[] = [];
  if (base.type === "series") {
    try {
      // TV season-info first; mobile v2 / v1 kept as fallbacks.
      const info = await tvRequest("/subject/season-info", { subjectId })
        .then((res: any) =>
          Array.isArray(res?.seasons) && res.seasons.length ? res : Promise.reject(),
        )
        .catch(() =>
          request("GET", `${API_PREFIX}/subject-api/season-info/v2?subjectId=${subjectId}&isVip=0`),
        )
        .catch(() =>
          request("GET", `${API_PREFIX}/subject-api/season-info?subjectId=${subjectId}`),
        );

      const list: any[] = Array.isArray(info?.seasons)
        ? info.seasons
        : Array.isArray(info)
          ? info
          : [];
      seasons = list
        .map((s) => ({
          season: Number(s?.se ?? s?.season ?? 0),
          episodes: Number(
            s?.maxEp ??
              s?.episodes ??
              (Array.isArray(s?.resolutions)
                ? Math.max(0, ...s.resolutions.map((r: any) => Number(r?.epNum) || 0))
                : 0),
          ),
        }))
        .filter((s) => s.season > 0 && s.episodes > 0);
    } catch {
      seasons = [];
    }
    if (!seasons.length && Number(data?.seNum) > 0) {
      seasons = [{ season: 1, episodes: Number(data?.epNum) || 1 }];
    }
  }

  return {
    ...base,
    description: data?.description ? String(data.description) : null,
    duration: data?.duration ? String(data.duration) : null,
    country: data?.countryName ? String(data.countryName) : null,
    language: data?.language ? String(data.language) : null,
    cast: (data?.staffList ?? [])
      .filter((s: any) => typeof s?.name === "string" && s.name)
      .map((s: any) => ({
        name: String(s.name),
        character: s.character ? String(s.character) : null,
        avatar: s.avatarUrl ? String(s.avatarUrl) : null,
      }))
      .slice(0, 16),
    seasons,
  };
}

export type StreamSource = {
  id: string;
  url: string;
  resolution: number;
  codec: string | null;
  bytes: number;
  size: string | null;
  /** True when this file is the provider's short "upgrade your app" promo clip. */
  promo: boolean;
  captions: { label: string; url: string }[];
};

/** Human file size — MB under 1 GB, GB above. */
const fmtBytes = (bytes: number) => {
  if (!bytes) return null;
  const mb = bytes / 1_048_576;
  return mb < 1024 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(2)} GB`;
};

/**
 * The provider ships a ~5 MB "upgrade your app" clip alongside real files.
 * It is always tiny, so anything under 40 MB (or a few seconds long) is a
 * promo: still listed for download, but never used as the player source.
 */
const isPromoEntry = (entry: any) => {
  const bytes = Number(entry?.size) || 0;
  const seconds = Number(entry?.duration) || 0;
  if (bytes > 0 && bytes < 40 * 1024 * 1024) return true;
  if (seconds > 0 && seconds < 300) return true;
  return false;
};

/** se/ep the TV play-info expects: movies 0/0, episodes their 1-based numbers. */
const playIdentity = (season: number, episode: number) => {
  const se = season > 0 ? season : 0;
  return { se, ep: se > 0 ? Math.max(1, episode) : 0 };
};

/** Short-lived cache so source and caption lookups share one play-info call. */
const playInfoCache = new Map<string, { at: number; data: Promise<any> }>();
function tvPlayInfo(subjectId: string, season: number, episode: number): Promise<any> {
  const { se, ep } = playIdentity(season, episode);
  const key = `${subjectId}:${se}:${ep}`;
  const hit = playInfoCache.get(key);
  // Signed URLs: never cache longer than 45 s.
  // Expired links are refreshed by the relay on 401/403, so a longer cache
  // keeps playback starting fast instead of re-signing on every range.
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const attempt = () => tvRequest("/subject/play-info/v2", { subjectId, se, ep });
  const data = attempt()
    .catch(() => attempt())
    .then((d: any) => {
      // Never cache an empty/failed answer — retry on the next request.
      if (!Array.isArray(d?.resources) || !d.resources.length) playInfoCache.delete(key);
      return d;
    })
    .catch(() => {
      playInfoCache.delete(key);
      return null;
    });
  playInfoCache.set(key, { at: Date.now(), data });
  if (playInfoCache.size > 200) playInfoCache.delete(playInfoCache.keys().next().value!);
  return data;
}

/** TV `stream-captions` for the selected stream, normalised for the player. */
async function tvCaptions(subjectId: string, streamId: string, se: number, ep: number) {
  const data = await tvRequest("/subject/stream-captions", { subjectId, streamId, se, ep }).catch(
    () => null,
  );
  const seen = new Set<string>();
  return (Array.isArray(data?.captions) ? data.captions : [])
    .filter((c: any) => typeof c?.url === "string" && c.url.startsWith("https://"))
    .map((c: any) => ({
      label: String(c.lanName ?? c.language ?? c.languageCode ?? "Subtitle"),
      url: String(c.url),
    }))
    .filter((c: { label: string }) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
}

/** Direct signed H.264/MP4 files from TV play-info/v2 `resources[]`. */
async function tvSources(
  subjectId: string,
  season: number,
  episode: number,
): Promise<StreamSource[]> {
  const { se, ep } = playIdentity(season, episode);
  const info = await tvPlayInfo(subjectId, season, episode);
  const resources: any[] = Array.isArray(info?.resources) ? info.resources : [];
  const found = new Map<string, StreamSource>();
  for (const r of resources) {
    const url = typeof r?.url === "string" ? r.url : "";
    if (!url.startsWith("https://")) continue;
    // Only drop entries that explicitly belong to a different episode.
    if (se > 0 && r?.se != null && r?.ep != null && (Number(r.se) !== se || Number(r.ep) !== ep))
      continue;
    // The same file is often listed under several resolution labels.
    const fileKey = url.split("?")[0]!;
    const resolution = parseInt(String(r?.resolution ?? ""), 10) || 0;
    const prev = found.get(fileKey);
    if (prev && prev.resolution >= resolution) continue;
    const bytes = Number(r?.size) || 0;
    found.set(fileKey, {
      id: String(
        r?.resourceId ??
          fileKey
            .split("/")
            .pop()
            ?.replace(/\.\w+$/, "") ??
          fileKey,
      ),
      url,
      resolution,
      codec: r?.codec ? String(r.codec) : r?.codecName ? String(r.codecName) : null,
      bytes,
      size: fmtBytes(bytes),
      promo: isPromoEntry(r),
      captions: [],
    });
  }
  const codecRank = (s: StreamSource) => (s.codec && /hevc|h265/i.test(s.codec) ? 1 : 0);
  const sources = [...found.values()].sort(
    (a, b) => codecRank(a) - codecRank(b) || b.resolution - a.resolution || b.bytes - a.bytes,
  );
  const streamId = Array.isArray(info?.streams) ? info.streams.find((s: any) => s?.id)?.id : null;
  if (sources.length && streamId) {
    const captions = await tvCaptions(subjectId, String(streamId), se, ep);
    for (const s of sources) s.captions = captions;
  }
  return sources;
}

export async function fetchSources(subjectId: string, season = 0, episode = 0) {
  let tv = await tvSources(subjectId, season, episode);
  if (!tv.some((s) => !s.promo)) {
    // One fresh retry before declaring a title unplayable.
    const { se, ep } = playIdentity(season, episode);
    playInfoCache.delete(`${subjectId}:${se}:${ep}`);
    tv = await tvSources(subjectId, season, episode);
  }
  return tv.filter((source) => !source.promo);
}

/** Refresh short-lived TV play-info after a CDN authorization failure. */
export async function fetchFreshSources(subjectId: string, season = 0, episode = 0) {
  const { se, ep } = playIdentity(season, episode);
  playInfoCache.delete(`${subjectId}:${se}:${ep}`);
  return fetchSources(subjectId, season, episode);
}

/** Placeholder used when the upstream catalog is unreachable during render. */
export function unavailableTitle(id: string): TitleDetails & { unavailable: true } {
  return {
    id,
    title: "Loading…",
    type: "movie",
    year: null,
    poster: null,
    backdrop: null,
    rating: null,
    genre: null,
    description: null,
    duration: null,
    country: null,
    language: null,
    cast: [],
    seasons: [],
    unavailable: true,
  };
}

/**
 * Related titles for the watch page.
 *
 * Genre keyword searches alone return junk (titles literally named "Action",
 * "Drama"), so results are filtered to real titles that share a genre with the
 * current one, deduped by normalised name, and ranked by rating.
 */
export async function fetchRelated(details: {
  id: string;
  title: string;
  genre: string | null;
  type: "movie" | "series";
}): Promise<CatalogItem[]> {
  // TV detail-rec: the catalog's own recommendations for this title.
  const rec = await tvRequest("/subject/detail-rec", { subjectId: details.id }).catch(() => null);
  const recItems: CatalogItem[] = [];
  const recSeen = new Set<string>([details.id]);
  for (const s of Array.isArray(rec?.items) ? rec.items : []) {
    const item = toItem(s);
    if (!item?.poster || recSeen.has(item.id)) continue;
    recSeen.add(item.id);
    recItems.push(item);
  }
  if (recItems.length >= 6) return recItems.slice(0, 18);
  return legacyRelated(details);
}

async function legacyRelated(details: {
  id: string;
  title: string;
  genre: string | null;
  type: "movie" | "series";
}): Promise<CatalogItem[]> {
  const genres = (details.genre ?? "")
    .split(/[·,/|]/)
    .map((g) => g.trim())
    .filter(Boolean);

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\bs\d+\s*-\s*s?\d+\b/g, "")
      .replace(/\bseason\s*\d+\b/g, "")
      .replace(/[^a-z0-9]+/g, "");

  const kind = details.type === "series" ? "series" : "movies";
  // Seed the query set with the title's own words so two titles that share a
  // genre don't come back with an identical "You may also like" rail.
  const titleWords = details.title
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 2);

  const terms = new Set<string>();
  for (const g of genres.slice(0, 3)) {
    terms.add(`${g} ${kind}`);
    for (const w of titleWords) terms.add(`${w} ${g}`);
  }
  if (genres.length > 1) terms.add(`${genres.slice(0, 2).join(" ")} ${kind}`);
  for (const w of titleWords) terms.add(w);
  if (!terms.size) terms.add(details.title);

  const pages = await Promise.all(
    [...terms].map((q) => searchCatalog(q, 1).catch(() => [] as CatalogItem[])),
  );

  const generic = new Set(genres.map(norm));
  const BROAD = new Set(["drama", "action", "comedy", "family", "adventure", "kids"]);
  const specific = genres.map((g) => g.toLowerCase()).filter((g) => !BROAD.has(g));
  const seenId = new Set<string>([details.id]);
  const seenName = new Set<string>([norm(details.title)]);

  const merged: CatalogItem[] = [];
  const max = Math.max(...pages.map((p) => p.length), 0);
  for (let i = 0; i < max; i++) {
    for (const page of pages) {
      const item = page[i];
      if (!item) continue;
      const name = norm(item.title);
      if (seenId.has(item.id) || seenName.has(name)) continue;
      if (!item.poster) continue;
      if (generic.has(name) || name.length < 3) continue; // "Action", "Drama", …
      if (item.type !== details.type) continue; // movies next to movies, series next to series
      // Same franchise ("Peaky Blinders S6" next to "Peaky Blinders") is not a
      // recommendation — drop anything whose name contains the source name.
      const self = norm(details.title);
      if (name.includes(self) || self.includes(name)) continue;
      const itemGenres = (item.genre ?? "").toLowerCase();
      // Match on the most specific genre available (Crime, Romance, Horror…)
      // instead of a catch-all like Drama, so rails stay on-topic.
      const shares = specific.length
        ? specific.some((g) => itemGenres.includes(g))
        : !genres.length || genres.some((g) => itemGenres.includes(g.toLowerCase()));
      if (!shares) continue;
      seenId.add(item.id);
      seenName.add(name);
      merged.push(item);
    }
  }

  // Stable per-title rotation: same title always gets the same rail, different
  // titles in the same genre start from a different offset.
  let seed = 0;
  for (const ch of details.id) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
  const ranked = merged.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
  const offset = ranked.length > 24 ? seed % Math.max(1, ranked.length - 18) : 0;
  return ranked.slice(offset, offset + 18);
}

/* ------------------------------------------------------------------------- *
 * Audio language variants
 *
 * The provider publishes each dub as its own subject ("Movie [Hindi]"), and
 * play-info only ever returns the single stream that belongs to the subject
 * that was asked for. So "this movie only plays in Hindi" means the user
 * landed on the Hindi subject. We look the title up again, label every
 * matching subject with the language its resources advertise and let the
 * player switch between them — defaulting to the original-language one.
 * ------------------------------------------------------------------------- */

export type AudioVariant = {
  /** Subject id to play for this language. */
  id: string;
  language: string;
  /** True for the untagged / original-language release. */
  original: boolean;
};

const LANGUAGES: [RegExp, string][] = [
  [/hindi|hin\b/i, "Hindi"],
  [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"],
  [/malayalam/i, "Malayalam"],
  [/kannada/i, "Kannada"],
  [/bengali/i, "Bengali"],
  [/punjabi/i, "Punjabi"],
  [/urdu/i, "Urdu"],
  [/arabic/i, "Arabic"],
  [/spanish|espanol|español|latino/i, "Spanish"],
  [/french|francais|français|vf\b/i, "French"],
  [/portuguese|dublado/i, "Portuguese"],
  [/german|deutsch/i, "German"],
  [/italian/i, "Italian"],
  [/russian/i, "Russian"],
  [/turkish/i, "Turkish"],
  [/korean/i, "Korean"],
  [/japanese/i, "Japanese"],
  [/chinese|mandarin|cantonese/i, "Chinese"],
  [/thai/i, "Thai"],
  [/indonesian/i, "Indonesian"],
  [/swahili|kiswahili/i, "Swahili"],
  [/luganda/i, "Luganda"],
  [/yoruba/i, "Yoruba"],
  [/hausa/i, "Hausa"],
  [/english|eng\b/i, "English"],
];

/** Pull a dub language out of a subject/resource title, if it advertises one. */
export function detectAudioLanguage(text: string): string | null {
  if (/dual\s*audio|multi\s*audio/i.test(text)) return "Dual Audio";
  // Only trust bracketed / parenthesised tags plus explicit "dubbed" wording,
  // so a movie literally called "The French Dispatch" is not mislabelled.
  const tags = [...text.matchAll(/[[(]([^\])]{2,30})[\])]/g)].map((m) => m[1] ?? "");
  if (/dubbed/i.test(text)) tags.push(text);
  for (const tag of tags) {
    for (const [pattern, name] of LANGUAGES) if (pattern.test(tag)) return name;
  }
  return null;
}

const variantKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");

/** Language of a subject, read from its own title and its resource titles. */
async function subjectLanguage(subjectId: string, rawTitle: string): Promise<string | null> {
  const fromTitle = detectAudioLanguage(rawTitle);
  if (fromTitle) return fromTitle;
  const res = await request(
    "GET",
    `${API_PREFIX}/subject-api/resource/v2?subjectId=${subjectId}&page=1&perPage=10`,
  ).catch(() => null as any);
  const list: any[] = Array.isArray(res?.list) ? res.list : [];
  for (const entry of list) {
    const found = detectAudioLanguage(`${entry?.title ?? ""} ${entry?.sourceUrl ?? ""}`);
    if (found) return found;
  }
  return null;
}

export async function fetchAudioVariants(details: {
  id: string;
  title: string;
  type: "movie" | "series";
}): Promise<AudioVariant[]> {
  // TV dub-info lists every audio track (each is its own subject) directly.
  const dubs = await tvRequest("/subject/dub-info", { subjectId: details.id }).catch(() => null);
  const dubItems: any[] = Array.isArray(dubs?.items) ? dubs.items : [];
  if (dubItems.length >= 2) {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    const seenIds = new Set<string>();
    const out: AudioVariant[] = [];
    for (const d of dubItems) {
      const id = d?.subjectId ? String(d.subjectId) : "";
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const original = Boolean(d?.original);
      let language = String(d?.lanName ?? "")
        .replace(/\s*dub$/i, "")
        .trim();
      if (!language || /original/i.test(language)) {
        try {
          language = d?.lanCode ? `${names.of(String(d.lanCode))}` : "Original";
        } catch {
          language = "Original";
        }
        if (original) language = `${language} (Original)`;
      }
      out.push({ id, language, original });
    }
    if (out.length >= 2) {
      return out.sort(
        (a, b) => Number(b.original) - Number(a.original) || a.language.localeCompare(b.language),
      );
    }
  }

  const wanted = variantKey(details.title);
  if (!wanted) return [];

  const data = await request("POST", `${API_PREFIX}/subject-api/search/v2`, {
    keyword: details.title,
    page: 1,
    perPage: 20,
    subjectType: "All",
    tabId: "All",
  }).catch(() => null as any);

  const subjects: { id: string; raw: string }[] = [];
  const seen = new Set<string>();
  for (const result of data?.results ?? []) {
    for (const subject of result?.subjects ?? []) {
      const id = subject?.subjectId ? String(subject.subjectId) : "";
      const raw = subject?.title ? String(subject.title) : "";
      const sameKind = (Number(subject?.subjectType) === 2 ? "series" : "movie") === details.type;
      if (!id || !raw || seen.has(id) || !sameKind) continue;
      if (variantKey(raw) !== wanted) continue;
      seen.add(id);
      subjects.push({ id, raw });
    }
  }
  if (!seen.has(details.id)) subjects.unshift({ id: details.id, raw: details.title });

  const labelled = await Promise.all(
    subjects.slice(0, 6).map(async (s) => ({
      id: s.id,
      language: (await subjectLanguage(s.id, s.raw)) ?? "Original",
    })),
  );

  // One entry per language; an untagged release is the original audio.
  const byLanguage = new Map<string, AudioVariant>();
  for (const entry of labelled) {
    if (byLanguage.has(entry.language)) continue;
    byLanguage.set(entry.language, { ...entry, original: entry.language === "Original" });
  }
  const variants = [...byLanguage.values()];
  if (variants.length < 2) return [];
  return variants.sort(
    (a, b) => Number(b.original) - Number(a.original) || a.language.localeCompare(b.language),
  );
}
