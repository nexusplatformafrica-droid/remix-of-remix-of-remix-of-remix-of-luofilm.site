/**
 * Catalog access layer.
 *
 * Catalog calls stay server-side because the upstream rejects browser origins.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchAudioVariants,
  fetchDetails,
  fetchRelated,
  fetchHome,
  fetchMostTrending,
  fetchSources,
  searchCatalog,
  unavailableTitle,
  type AudioVariant,
  type CatalogItem,
  type StreamSource,
  type TitleDetails,
} from "./moviebox";
import { HOME_SECTIONS, fetchSection } from "./home-sections";

export type HomeData = {
  hero: CatalogItem[];
  rows: { title: string; items: CatalogItem[] }[];
  trending?: CatalogItem[];
  comingSoon?: CatalogItem[];
  degraded?: boolean;
  /** True when rows are the MovieBox website's own home sections. */
  web?: boolean;
};

// A transient upstream failure must not replace real web sections with an empty page.
// Worker instances may come and go, so this is only a short-lived resilience cache.
let lastGoodWebHome: { value: HomeData; at: number } | null = null;

export const getHome = createServerFn({ method: "GET" }).handler(async (): Promise<HomeData> => {
  try {
    const home = await fetchHome();
    if (!home.rows.length) throw new Error("Web home returned no sections");
    lastGoodWebHome = { value: home, at: Date.now() };
    return home;
  } catch (error) {
    console.error(error);
    if (lastGoodWebHome && Date.now() - lastGoodWebHome.at < 15 * 60_000) {
      return { ...lastGoodWebHome.value, degraded: true };
    }
    throw new Error("MovieBox web sections are temporarily unavailable");
  }
});

export const searchTitles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ q: z.string(), page: z.number().optional() }).parse(data))
  .handler(async ({ data }): Promise<CatalogItem[]> => {
    try {
      return await searchCatalog(data.q, data.page ?? 1);
    } catch (error) {
      console.error(error);
      return [];
    }
  });

export const getTitle = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }): Promise<TitleDetails & { unavailable?: boolean }> => {
    try {
      return await fetchDetails(data.id);
    } catch (error) {
      console.error(error);
      return unavailableTitle(data.id);
    }
  });

export const getSources = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({ id: z.string(), season: z.number().optional(), episode: z.number().optional() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<StreamSource[]> => {
    try {
      return await fetchSources(data.id, data.season ?? 0, data.episode ?? 0);
    } catch (error) {
      console.error(error);
      return [];
    }
  });

export const getRelated = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        title: z.string(),
        genre: z.string().nullable(),
        type: z.enum(["movie", "series"]),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<CatalogItem[]> => {
    try {
      return await fetchRelated(data);
    } catch (error) {
      console.error(error);
      return [];
    }
  });

export const getAudioVariants = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ id: z.string(), title: z.string(), type: z.enum(["movie", "series"]) }).parse(data),
  )
  .handler(async ({ data }): Promise<AudioVariant[]> => {
    try {
      return await fetchAudioVariants(data);
    } catch (error) {
      console.error(error);
      return [];
    }
  });

/**
 * Trending rail: the catalog's own live trending rails from the home, movie and
 * series tabs merged together, so it never falls back to a thin, regional list.
 */
export const getTrending = createServerFn({ method: "GET" }).handler(
  async (): Promise<CatalogItem[]> => {
    try {
      return await fetchMostTrending();
    } catch (error) {
      console.error(error);
      return [];
    }
  },
);

/**
 * One curated home rail, resolved on the server. The catalog gateway blocks
 * browser origins, so the client only sends the rail's title and the real
 * section definition (including its genre filters) stays server-side.
 */
export const getSection = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ title: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<CatalogItem[]> => {
    const section = HOME_SECTIONS.find((s) => s.title === data.title);
    if (!section) return [];
    try {
      return await fetchSection(section);
    } catch (error) {
      console.error(error);
      return [];
    }
  });
