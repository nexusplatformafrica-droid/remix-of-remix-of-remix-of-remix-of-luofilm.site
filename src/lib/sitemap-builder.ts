/**
 * Sitemap builders. Every file is regenerated at most once an hour (in-memory
 * cache + 1h HTTP cache), so newly added movies, Luo/Luganda titles and VJs
 * appear within the hour.
 */
import { CATEGORIES, isAdultItem } from "./categories";
import { restListTitles, type LuoPublicTitle } from "./luo-rest";
import { fetchMostTrending, searchCatalog, type CatalogItem } from "./moviebox";
import { vjInfo, vjKey } from "./vj";

export const BASE_URL = "https://luofilm.site";
const HOUR = 3_600_000;

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export const luoTitles = () => cached<LuoPublicTitle[]>("luo", () => restListTitles());

export const catalogTitles = () =>
  cached<CatalogItem[]>("catalog", async () => {
    const seen = new Map<string, CatalogItem>();
    const add = (list: CatalogItem[]) => {
      for (const i of list) if (!seen.has(i.id) && !isAdultItem(i)) seen.set(i.id, i);
    };
    add(await fetchMostTrending().catch(() => []));
    const keywords = [...new Set(CATEGORIES.filter((c) => !c.adult).flatMap((c) => [c.keyword, ...(c.keywords ?? [])]).filter(Boolean))];
    const jobs = keywords.flatMap((k) => [1, 2, 3].map((p) => () => searchCatalog(k, p).catch(() => [])));
    for (let i = 0; i < jobs.length; i += 6) {
      const batch = await Promise.all(jobs.slice(i, i + 6).map((j) => j()));
      batch.forEach(add);
    }
    return [...seen.values()];
  });

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "all",
    },
  });
}

export type UrlEntry = {
  path: string;
  lastmod?: string | null;
  changefreq?: string;
  priority?: string;
  images?: { loc: string; title?: string }[];
  video?: { thumb: string; title: string; description: string; player: string; content?: string | null };
};

export function urlset(entries: UrlEntry[]) {
  const body = entries
    .map((e) => {
      const parts = [`  <url>`, `    <loc>${esc(BASE_URL + e.path)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${esc(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
      for (const img of e.images ?? []) {
        parts.push(`    <image:image><image:loc>${esc(img.loc)}</image:loc>${img.title ? `<image:title>${esc(img.title)}</image:title>` : ""}</image:image>`);
      }
      if (e.video) {
        const v = e.video;
        parts.push(
          `    <video:video><video:thumbnail_loc>${esc(v.thumb)}</video:thumbnail_loc><video:title>${esc(v.title)}</video:title><video:description>${esc(v.description.slice(0, 2000))}</video:description>${v.content ? `<video:content_loc>${esc(v.content)}</video:content_loc>` : ""}<video:player_loc>${esc(v.player)}</video:player_loc><video:family_friendly>yes</video:family_friendly></video:video>`,
        );
      }
      parts.push(`  </url>`);
      return parts.join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${body}\n</urlset>`;
}

export const SITEMAP_FILES = [
  "sitemap-pages.xml",
  "sitemap-movies.xml",
  "sitemap-series.xml",
  "sitemap-animations.xml",
  "sitemap-luo-movies.xml",
  "sitemap-luganda-movies.xml",
  "sitemap-vj.xml",
  "sitemap-images.xml",
  "sitemap-videos.xml",
];

export function sitemapIndex() {
  const now = new Date(Math.floor(Date.now() / HOUR) * HOUR).toISOString();
  const items = SITEMAP_FILES.map((f) => `  <sitemap><loc>${BASE_URL}/${f}</loc><lastmod>${now}</lastmod></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}

export async function buildSitemap(name: string): Promise<string> {
  switch (name) {
    case "pages": {
      const entries: UrlEntry[] = [
        { path: "/", changefreq: "hourly", priority: "1.0" },
        { path: "/luo", changefreq: "hourly", priority: "0.9" },
        { path: "/luganda", changefreq: "hourly", priority: "0.9" },
        { path: "/tutorial", changefreq: "monthly", priority: "0.6" },
      ];
      for (const c of CATEGORIES) if (c.slug !== "home" && !c.adult) entries.push({ path: `/category/${c.slug}`, changefreq: "hourly", priority: "0.7" });
      return urlset(entries);
    }
    case "movies": {
      const list = await catalogTitles();
      return urlset(list.map((t) => ({
        path: `/watch/${encodeURIComponent(t.id)}`,
        changefreq: "daily",
        priority: "0.8",
        images: [t.poster, t.backdrop].filter(Boolean).map((loc) => ({ loc: loc!, title: t.title })),
      })));
    }
    case "series": {
      const list = (await catalogTitles()).filter((t) => t.type === "series");
      return urlset(list.map((t) => ({
        path: `/watch/${encodeURIComponent(t.id)}`,
        changefreq: "daily",
        priority: "0.8",
        images: [t.poster, t.backdrop].filter(Boolean).map((loc) => ({ loc: loc!, title: `${t.title} series` })),
      })));
    }
    case "animations": {
      const animated = /animation|animated|anime|cartoon|family/i;
      const list = (await catalogTitles()).filter((t) => animated.test(`${t.genre ?? ""} ${t.title}`));
      return urlset(list.map((t) => ({
        path: `/watch/${encodeURIComponent(t.id)}`,
        changefreq: "daily",
        priority: "0.8",
        images: [t.poster, t.backdrop].filter(Boolean).map((loc) => ({ loc: loc!, title: `${t.title} animation` })),
      })));
    }
    case "luo-movies":
    case "luganda-movies": {
      const lang = name === "luo-movies" ? "luo" : "luganda";
      const list = (await luoTitles()).filter((t) => t.language === lang);
      return urlset(list.map((t) => ({
        path: `/${lang}/${encodeURIComponent(t.id)}`,
        lastmod: t.updatedAt,
        changefreq: "daily",
        priority: "0.9",
        images: t.poster ? [{ loc: t.poster, title: t.title }] : [],
      })));
    }
    case "vj": {
      const list = await luoTitles();
      const seen = new Map<string, UrlEntry>();
      for (const t of list) {
        const key = vjKey(t.vj);
        if (!key) continue;
        const path = `/${t.language}?vj=${encodeURIComponent(key)}`;
        const entry = seen.get(path) ?? { path, changefreq: "daily", priority: "0.8", images: [] };
        if (t.poster && entry.images!.length < 20) entry.images!.push({ loc: t.poster, title: `${vjInfo(key)?.name ?? key} — ${t.title}` });
        if (!entry.lastmod || (t.updatedAt && t.updatedAt > entry.lastmod)) entry.lastmod = t.updatedAt;
        seen.set(path, entry);
      }
      return urlset([...seen.values()]);
    }
    case "images": {
      const [luo, cat] = await Promise.all([luoTitles(), catalogTitles()]);
      return urlset([
        ...luo.filter((t) => t.poster).map((t) => ({ path: `/${t.language}/${encodeURIComponent(t.id)}`, images: [{ loc: t.poster!, title: t.title }] })),
        ...cat.filter((t) => t.poster || t.backdrop).map((t) => ({
          path: `/watch/${encodeURIComponent(t.id)}`,
          images: [t.poster, t.backdrop].filter(Boolean).map((loc) => ({ loc: loc!, title: t.title })),
        })),
      ]);
    }
    case "videos": {
      const [luo, cat] = await Promise.all([luoTitles(), catalogTitles()]);
      return urlset([
        ...luo.filter((t) => t.poster).map((t) => {
          const path = `/${t.language}/${encodeURIComponent(t.id)}`;
          return {
            path,
            lastmod: t.updatedAt,
            video: {
              thumb: t.poster!,
              title: t.title,
              description: t.description ?? `${t.title}${t.vj ? ` — ${vjInfo(t.vj)?.name}` : ""} translated ${t.language === "luo" ? "Luo" : "Luganda"} movie on MOVIE MAX.`,
              player: BASE_URL + path,
              content: null,
            },
          };
        }),
        ...cat.filter((t) => t.poster || t.backdrop).map((t) => {
          const path = `/watch/${encodeURIComponent(t.id)}`;
          return {
            path,
            video: {
              thumb: (t.backdrop ?? t.poster)!,
              title: t.title,
              description: `Watch and download ${t.title}${t.year ? ` (${t.year})` : ""}${t.genre ? ` — ${t.genre}` : ""} ${t.type === "series" ? "series" : "movie"} with subtitles on MOVIE MAX.`,
              player: BASE_URL + path,
            },
          };
        }),
      ]);
    }
    default:
      return urlset([]);
  }
}
