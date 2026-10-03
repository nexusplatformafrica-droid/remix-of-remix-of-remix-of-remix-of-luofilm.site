/** Shared, browser-safe provider types (ported from MovieBox-TUI providers). */
export const PROVIDERS = [
  { id: "4khdhub", name: "4KHDHub", blurb: "4K UHD, HDR, REMUX & 1080p releases" },
  { id: "dramachi", name: "Dramachi", blurb: "Hollywood, Asian dramas & series" },
  { id: "addons", name: "Addons", blurb: "Stremio Cinemeta catalog, sources from every provider" },
  { id: "circleftp", name: "CircleFTP", blurb: "BDIX mirror (Bangladesh networks only)" },
  { id: "dhakaflix", name: "DhakaFlix", blurb: "BDIX indexer (Bangladesh networks only)" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const providerName = (id: string) => PROVIDERS.find((p) => p.id === id)?.name ?? id;

export type PItem = {
  provider: ProviderId;
  id: string;
  title: string;
  type: "movie" | "series";
  year: string | null;
  poster: string | null;
};

export type PDetails = PItem & {
  overview: string | null;
  backdrop: string | null;
  genres: string | null;
};

export type PSource = {
  /** Provider that actually hosts this file (Addons borrows from others). */
  provider: ProviderId;
  filename: string;
  group: string | null;
  quality: string;
  size: string | null;
  ext: string;
  /** Can a browser likely play it inline? Otherwise download-only. */
  playable: boolean;
  /** Opaque token resolved on demand into direct file mirrors. */
  token: string;
};

export type PMirror = { label: string; url: string };

const QUALITY_ORDER = ["8K", "4K", "1440p", "1080p", "720p", "540p", "480p", "360p", "SD"];

export function detectQuality(text: string): string {
  const t = text.toLowerCase();
  if (/4320p/.test(t)) return "8K";
  if (/2160p/.test(t)) return "4K";
  if (/1440p/.test(t)) return "1440p";
  const m = t.match(/(1080|720|540|480|360)p/);
  if (m) return `${m[1]}p`;
  if (/\b8k\b/.test(t)) return "8K";
  if (/\b4k\b|\buhd\b/.test(t)) return "4K";
  return "SD";
}

export const qualityRank = (q: string) => {
  const i = QUALITY_ORDER.indexOf(q);
  return i < 0 ? 99 : i;
};

export function detectExt(name: string) {
  const m = name.toLowerCase().match(/\.(mp4|mkv|webm|m4v|avi|mov|ts)(?:$|[?#\s])/);
  return m?.[1] ?? "mkv";
}

/** Browsers play mp4/webm; MKV only when it's not HEVC/AV1/10-bit/REMUX. */
export function isBrowserPlayable(name: string, ext: string) {
  const t = name.toLowerCase();
  if (ext === "mp4" || ext === "webm" || ext === "m4v") return !/hevc|x265|h\.?265|av1/.test(t);
  if (ext === "mkv") return !/hevc|x265|h\.?265|av1|10bit|remux|dts|truehd|atmos/.test(t);
  return false;
}
