/**
 * Curated home page sections, mirroring the MovieBox home layout.
 *
 * Two ways a rail gets filled:
 *  - `titles`: an explicit, ordered list of real titles. Each one is looked up
 *    in the catalog and the best-matching result is used, so the rail shows
 *    exactly those shows/movies with live posters, ratings and ids.
 *  - `keywords`: merged live searches, then filtered by the catalog's own
 *    genre / type / year metadata.
 */
import { searchCatalog, fetchTabRows, fetchMostTrending, type CatalogItem } from "./moviebox";

export type HomeSection = {
  title: string;
  /** Explicit ordered titles (preferred — gives the exact real line-up). */
  titles?: string[];
  /** Search feeds merged into the rail. */
  keywords?: string[];
  /** Keep only items whose catalog genre matches. */
  genre?: RegExp;
  /** Drop items whose catalog genre matches this (e.g. animation in live-action rails). */
  avoidGenre?: RegExp;
  type?: "movie" | "series";
  /** Keep only items released on/after this year. */
  minYear?: number;
  ranked?: boolean;
  /** Fill only from live catalog searches (no fixed titles), newest first. */
  live?: boolean;
  /** Take items from the catalog's own real rails: [tabId, rail-title pattern]. */
  rails?: [number, RegExp][];
  /** Use the catalog's combined real trending line-up. */
  realTrending?: boolean;
};

export const HOME_SECTIONS: HomeSection[] = [
  {
    live: true,
    title: "Popular Series",
    rails: [[5, /series in progress/i], [0, /western tv|meet your next binge|trending/i]],
    type: "series",
  },
  {
    live: true,
    title: "Popular Movie",
    keywords: ["popular movie 2026","new movie 2026","box office","trending movie"],
    type: "movie",
  },
  {
    title: "Best Animation",
    live: true,
    keywords: [
      "animation 2026",
      "animated movie 2026",
      "animation 2025",
      "new animation movie",
      "cartoon movie",
    ],
    genre: /animation|animated/i,
    avoidGenre: /anime/i,
    type: "movie",
  },
  {
    live: true,
    title: "Most trending",
    realTrending: true,
    ranked: true,
  },
  {
    live: true,
    title: "Bet+",
    // Live searches for BET+ style shows — no fixed name list, so the row
    // refreshes with the catalog and never grabs a different movie that
    // happens to share a title.
    keywords: ["tyler perry series", "black drama series", "african american drama", "urban crime series"],
    genre: /drama|crime|romance|comedy|thriller/i,
    avoidGenre: /anime|animation|reality/i,
    type: "series",
  },
  {
    live: true,
    title: "Action & Thriller",
    keywords: ["action thriller 2026","thriller series","spy thriller","crime thriller"],
  },
  {
    live: true,
    title: "Gangster",
    keywords: ["gangster series","mafia crime","crime family drama","drug empire"],
  },
  {
    live: true,
    title: "C-Drama",
    keywords: ["chinese drama", "c-drama", "wuxia", "chinese romance"],
    genre: /drama|romance|fantasy/i,
    type: "series",
  },
  {
    live: true,
    title: "Action Movies",
    keywords: ["action movie", "action 2026", "fight"],
    genre: /action/i,
    type: "movie",
  },
  {
    live: true,
    title: "Horror Movies",
    keywords: ["horror", "horror 2026", "scary"],
    genre: /horror/i,
    type: "movie",
  },
  {
    live: true,
    title: "Hot Short TV",
    keywords: ["short tv", "short drama", "mini series romance"],
  },
  {
    live: true,
    title: "Epic Fantasy",
    keywords: ["epic fantasy series","medieval fantasy","dragons kingdom","sword sorcery"],
    type: "series",
    avoidGenre: /animation|anime/i,
  },
  {
    live: true,
    title: "Sitcom",
    keywords: ["sitcom","comedy series","family sitcom","funny series"],
  },
  {
    live: true,
    title: "Teen Romance",
    keywords: ["teen romance","high school romance","young love series","college romance"],
  },
  {
    live: true,
    title: "Superhero Series",
    keywords: ["superhero series","comic book series","dc series","marvel series"],
    type: "series",
  },
  {
    live: true,
    title: "Must-watch Black Shows",
    keywords: ["black series drama","african american series","urban series","hood drama"],
    type: "series",
  },
  {
    live: true,
    title: "Romance",
    keywords: ["romance 2026", "romantic movie", "love story"],
    genre: /romance/i,
  },
  {
    live: true,
    title: "Teen Fantasy",
    keywords: ["teen fantasy series","supernatural teen","magic school series","young adult fantasy"],
    avoidGenre: /animation|anime/i,
  },
  {
    live: true,
    title: "Anime [English Dubbed]",
    keywords: ["anime english dubbed","anime series 2026","shonen anime","isekai anime"],
  },
  {
    live: true,
    title: "K-Drama",
    keywords: ["korean drama", "k-drama 2026", "korean romance"],
    genre: /drama|romance|comedy/i,
    type: "series",
  },
  {
    live: true,
    title: "Comedy",
    keywords: ["comedy 2026", "comedy movie", "funny"],
    genre: /comedy/i,
  },
  {
    live: true,
    title: "Sci-Fi & Adventure",
    keywords: ["sci-fi", "adventure 2026", "space"],
    genre: /sci-fi|adventure/i,
  },
];

const dedupe = (items: CatalogItem[]) => {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Look up one real title and return the closest catalog match.
 * A match must actually resemble the requested name — otherwise the rail would
 * fill with unrelated search noise, so we return null and the rail stays honest.
 */
async function lookupTitle(title: string, section: HomeSection): Promise<CatalogItem | null> {
  const results = await searchCatalog(title, 1).catch(() => [] as CatalogItem[]);
  const wanted = norm(title);
  const candidates = results.filter(
    (r) => !!r.poster && !(section.avoidGenre && section.avoidGenre.test(r.genre ?? "")),
  );
  if (!candidates.length) return null;

  const score = (item: CatalogItem) => {
    const name = norm(item.title);
    let s = 0;
    if (name === wanted) s += 100;
    else if (name.startsWith(wanted) || wanted.startsWith(name)) s += 55;
    else if (name.includes(wanted) || wanted.includes(name)) s += 20;
    else return -1000;
    // A rail that asks for series must not fall back to a movie / music clip.
    if (section.type && item.type !== section.type) return -1000;
    // Long trailing noise ("… (Official Video)") means it is a different work.
    const extra = name.length - wanted.length;
    if (extra > 14) s -= Math.min(80, extra * 2);
    s += Number(item.rating ?? 0) * 3;
    const year = Number(item.year ?? 0);
    if (year >= 2024) s += 10;
    else if (year >= 2015) s += 4;
    return s;
  };

  const best = [...candidates]
    .map((item) => ({ item, s: score(item) }))
    .sort((a, b) => b.s - a.s)[0];
  // Reject weak matches so a rail never shows something unrelated.
  return best && best.s >= 20 ? best.item : null;
}

/** Minimum items a rail should carry before we stop backfilling. */
const TARGET = 18;

/** Live search feed for a section, filtered by the catalog's own metadata. */
async function fetchFeed(section: HomeSection): Promise<CatalogItem[]> {
  const keywords = section.keywords ?? [];
  if (!keywords.length) return [];
  const batches = await Promise.all(
    keywords.flatMap((q) => [
      searchCatalog(q, 1).catch(() => [] as CatalogItem[]),
      searchCatalog(q, 2).catch(() => [] as CatalogItem[]),
    ]),
  );

  const keep = (item: CatalogItem) =>
    !!item.poster &&
    (!section.type || item.type === section.type) &&
    (!section.genre || section.genre.test(item.genre ?? "")) &&
    !(section.avoidGenre && section.avoidGenre.test(item.genre ?? "")) &&
    (!section.minYear || Number(item.year) >= section.minYear);

  const filtered = batches.map((list) => list.filter(keep));

  // Round-robin so every keyword contributes, keeping rails varied and fresh.
  const merged: CatalogItem[] = [];
  for (let i = 0; i < 20; i += 1) {
    for (const list of filtered) if (list[i]) merged.push(list[i]!);
  }
  return dedupe(merged);
}

/**
 * Fill a rail. Curated titles come first (so the well-known line-up is exact),
 * then the rail is topped up from live catalog searches — that way every
 * section is full and refreshes with whatever the catalog is pushing today
 * instead of being a short, static list.
 */
export async function fetchSection(section: HomeSection): Promise<CatalogItem[]> {
  if (section.realTrending) return (await fetchMostTrending()).slice(0, 24);
  if (section.rails?.length) {
    const tabs = [...new Set(section.rails.map(([t]) => t))];
    const byTab = new Map(await Promise.all(tabs.map(async (t) => [t, await fetchTabRows(t)] as const)));
    const lanes = section.rails.map(([t, re]) =>
      (byTab.get(t) ?? []).filter((r) => re.test(r.title)).flatMap((r) => r.items)
        .filter((i) => !section.type || i.type === section.type),
    );
    const out: CatalogItem[] = [];
    for (let i = 0; i < 30; i += 1) for (const l of lanes) if (l[i]) out.push(l[i]!);
    return dedupe(out).slice(0, 24);
  }
  if (section.titles?.length && !section.keywords?.length) {
    const found = await Promise.all(section.titles.map((t) => lookupTitle(t, section)));
    return dedupe(found.filter((i): i is CatalogItem => !!i));
  }
  if (section.live) {
    // Live rail: only what the catalog returns right now, newest releases first.
    const feed = await fetchFeed(section);
    return [...feed]
      .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
      .slice(0, Math.max(TARGET, 24));
  }
  const [curated, feed] = await Promise.all([
    section.titles?.length
      ? Promise.all(section.titles.map((t) => lookupTitle(t, section))).then((r) =>
          r.filter((i): i is CatalogItem => !!i),
        )
      : Promise.resolve([] as CatalogItem[]),
    fetchFeed(section),
  ]);

  return dedupe([...curated, ...feed]).slice(0, Math.max(TARGET, 24));
}

