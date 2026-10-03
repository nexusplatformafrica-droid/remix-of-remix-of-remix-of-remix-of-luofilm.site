import { parse } from "node-html-parser";
import {
  detectExt,
  detectQuality,
  isBrowserPlayable,
  type PDetails,
  type PItem,
  type PMirror,
  type PSource,
} from "./types";

const BASE = "https://4khdhub.one";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function get(url: string, ms = 15000) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`4KHDHub ${res.status}`);
  return res.text();
}

function cards(html: string): PItem[] {
  const doc = parse(html);
  return doc.querySelectorAll("a.movie-card").flatMap((a) => {
    const href = a.getAttribute("href") ?? "";
    const id = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/|\/$/g, "");
    if (!id) return [];
    const title = a.querySelector(".movie-card-title")?.text.trim() ?? id;
    const meta = a.querySelector(".movie-card-meta")?.text ?? "";
    const img = a.querySelector("img");
    return [
      {
        provider: "4khdhub" as const,
        id,
        title,
        type: href.includes("-series-") ? ("series" as const) : ("movie" as const),
        year: meta.match(/(19|20)\d{2}/)?.[0] ?? null,
        poster: img?.getAttribute("src") ?? img?.getAttribute("data-src") ?? null,
      },
    ];
  });
}

export const fkSearch = async (q: string) => cards(await get(`${BASE}/?s=${encodeURIComponent(q)}`));
export const fkHome = async () => cards(await get(`${BASE}/`));

const safeId = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error("Bad id");
  return id;
};

export async function fkDetails(id: string): Promise<{ details: PDetails; sources: PSource[] }> {
  const html = await get(`${BASE}/${safeId(id)}/`);
  const doc = parse(html);
  const og = (p: string) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute("content") ?? null;
  const title = doc.querySelector("h1")?.text.trim() || og("og:title") || id;
  const details: PDetails = {
    provider: "4khdhub",
    id,
    title,
    type: id.includes("-series-") ? "series" : "movie",
    year: title.match(/(19|20)\d{2}/)?.[0] ?? null,
    poster: og("og:image"),
    backdrop: og("og:image"),
    overview:
      doc.querySelector(".content-section p.mt-4")?.text.trim() ||
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
      null,
    genres: doc.querySelectorAll(".badge-outline a").map((a) => a.text.trim()).join(", ") || null,
  };

  const sources: PSource[] = [];
  const push = (filename: string, group: string | null, size: string | null, hrefs: string[]) => {
    hrefs.forEach((href, i) => {
      const ext = detectExt(filename);
      sources.push({
        provider: "4khdhub",
        filename: hrefs.length > 1 ? `${filename}` : filename,
        group: group ?? (hrefs.length > 1 ? `Mirror ${i + 1}` : null),
        quality: detectQuality(filename),
        size,
        ext,
        playable: isBrowserPlayable(filename, ext),
        token: `4k|${href}`,
      });
    });
  };
  const linksOf = (el: ReturnType<typeof doc.querySelector>) =>
    (el?.querySelectorAll("a[href]") ?? [])
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("https://") && !h.includes("logout"));
  const sizeOf = (el: ReturnType<typeof doc.querySelector>) =>
    (el?.querySelectorAll(".badge-size, .badge") ?? [])
      .map((b) => b.text.trim())
      .find((t) => /\d\s*(GB|MB)/i.test(t)) ?? null;

  for (const item of doc.querySelectorAll("#episodes .episode-download-item")) {
    const name = item.querySelector(".episode-file-title")?.text.trim() ?? "Episode";
    const season = name.match(/S(\d{1,2})E\d+/i)?.[1];
    push(name, season ? `Season ${Number(season)}` : "Episodes", sizeOf(item), linksOf(item));
  }
  for (const item of doc.querySelectorAll(".download-item")) {
    const name = item.querySelector(".file-title")?.text.trim();
    if (!name) continue;
    const links = linksOf(item);
    links.forEach((href, i) => push(name, links.length > 1 ? `Mirror ${i + 1}` : null, sizeOf(item), [href]));
  }
  return { details, sources };
}

// ---- Mirror resolver (GreenMotors → HubDrive → HubCloud → direct file) ----
const b64 = (s: string) => Buffer.from(s, "base64").toString("utf8");
const rot13 = (s: string) =>
  s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};

function pixeldrain(u: string) {
  const m = u.match(/https:\/\/(pixeldrain\.(?:dev|com))\/(?:u|api\/file)\/([\w-]+)/);
  return m ? `https://${m[1]}/api/file/${m[2]}?download` : null;
}

async function fromHubCloud(drive: string): Promise<PMirror[]> {
  const page = parse(await get(drive));
  const resolver = page
    .querySelectorAll(
      "a#download, a.btn-primary, a.btn-success, a[href*='/download/'], a[href*='gamerxyt.com'], a[href*='hubcloud.php']",
    )
    .map((a) => a.getAttribute("href") ?? "")
    .find((h) => h.startsWith("https://"));
  if (!resolver) throw new Error("HubCloud link missing");
  const html = await get(resolver);
  const out: PMirror[] = [];
  for (const m of html.matchAll(/https:\/\/pixeldrain\.(?:dev|com)\/(?:u|api\/file)\/[\w-]+/g)) {
    const u = pixeldrain(m[0]);
    if (u && !out.some((x) => x.url === u)) out.push({ label: "PixelDrain", url: u });
  }
  for (const a of parse(html).querySelectorAll("a[href]")) {
    let href = a.getAttribute("href") ?? "";
    const label = a.text.replace(/\s+/g, " ").trim();
    const host = hostOf(href);
    if (host.includes("pages.dev")) {
      const u = new URL(href).searchParams.get("u");
      if (u) href = b64(u);
    }
    if (!href.startsWith("https://")) continue;
    const h = hostOf(href);
    const pd = pixeldrain(href);
    const good =
      pd ||
      /workers\.dev|r2\.dev|cloudflarestorage\.com|googleusercontent\.com|googleapis\.com|fsl|hubcdn|pixel\.hubcloud/.test(h) ||
      /download file|fsl server|10gbps|direct/i.test(label);
    const bad = /google\.com|t\.me|tinyurl|one\.one|hdhub4u|\/drive\/admin|login|\.zip$/i.test(href);
    if (good && !bad) {
      const url = pd ?? href;
      if (!out.some((x) => x.url === url)) out.push({ label: label.slice(0, 40) || h, url });
    }
  }
  // Direct-file hosts first (workers/r2/pixeldrain), redirect pages last.
  out.sort((a, b) => Number(a.url.includes("pixel.hubcloud")) - Number(b.url.includes("pixel.hubcloud")));
  if (!out.length) throw new Error("No playable mirror");
  return out;
}

async function fromHubDrive(url: string) {
  const doc = parse(await get(url));
  const drive = doc
    .querySelectorAll("a[href]")
    .map((a) => a.getAttribute("href") ?? "")
    .find((h) => hostOf(h).includes("hubcloud.") && h.includes("/drive/"));
  if (!drive) throw new Error("HubDrive mirror missing");
  return fromHubCloud(drive);
}

export async function fkResolve(url: string): Promise<PMirror[]> {
  const host = hostOf(url);
  if (!url.startsWith("https://")) throw new Error("Bad link");
  if (host.includes("greenmotors.") || host.includes("greenmountmotors.")) {
    const html = await get(url);
    const m = html.match(/s\(\s*['"]o['"]\s*,\s*['"]([^'"]+)['"]/);
    if (!m) throw new Error("Mirror target missing");
    const target = b64(JSON.parse(b64(rot13(b64(b64(m[1]))))).o);
    return fkResolve(target);
  }
  if (host.includes("hubcloud.")) return fromHubCloud(url);
  if (host.includes("hubdrive.")) return fromHubDrive(url);
  return [{ label: "Direct", url: pixeldrain(url) ?? url }];
}
