import { getSetting, saveSetting } from "./app-settings";

/** Admin-curated hero slide: an API title, an uploaded (VJ) title, or a manual promo banner. */
export type HeroSlide = {
  key: string;
  kind: "api" | "upload" | "promo";
  /** Catalog id (api) or uploaded title id (upload). */
  refId?: string;
  /** Language of uploaded titles, picks /luo or /luganda page. */
  language?: string;
  title: string;
  image: string;
  vj?: string | null;
  /** Promo destination (any URL or site path). */
  link?: string | null;
  subtitle?: string | null;
};

export const HERO_KEY = "hero_slides";

export const loadHeroSlides = () => getSetting<HeroSlide[]>(HERO_KEY, []);
export const saveHeroSlides = (slides: HeroSlide[]) => saveSetting(HERO_KEY, slides);

export function heroHref(s: HeroSlide): string {
  if (s.kind === "api") return `/watch/${s.refId}`;
  if (s.kind === "upload") return `/${s.language === "luganda" ? "luganda" : "luo"}/${s.refId}`;
  return s.link || "#";
}
