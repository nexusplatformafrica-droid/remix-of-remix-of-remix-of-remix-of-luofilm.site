/**
 * Catalog access layer.
 *
 * These run in whichever runtime calls them: during SSR they hit the upstream
 * from the server, and in the browser they hit it directly (the catalog sends
 * permissive CORS headers). That keeps the app working on hosts whose egress
 * IPs the catalog blocks — the shell renders, the browser fills in the data.
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

export const getHome = createServerFn({ method: "GET" }).handler(async (): Promise<HomeData> => {
  try {
    return await fetchHome();
  } catch (error) {
    console.error(error);
    return { hero: [], rows: [], trending: [], comingSoon: [], degraded: true };
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
