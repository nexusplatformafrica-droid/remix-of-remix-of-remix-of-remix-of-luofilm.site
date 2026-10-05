import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Sidebar } from "@/components/youku/Sidebar";
import { TopBar } from "@/components/youku/TopBar";
import { MobileNav } from "@/components/youku/MobileNav";
import { Rail } from "@/components/youku/Rail";
import { RowSkeleton } from "@/components/youku/Skeletons";
import { VjRail } from "@/components/youku/VjRail";
import { ReferralBanner } from "@/components/youku/ReferralBanner";
import { isAdultItem } from "@/lib/categories";
import { ProviderTrending } from "@/components/providers/ProviderTrending";
import { getHome, getTrending, getSection } from "@/lib/catalog.functions";
import { balanceTrending } from "@/lib/trending-filter";
import { HOME_SECTIONS } from "@/lib/home-sections";
import { heroHref, loadHeroSlides } from "@/lib/hero";

type HeroCard = { id: string; title: string; image: string | null; watchId?: string | undefined; href: string; vj?: string | null | undefined; promo: boolean; meta: string };

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHome(),
  // Keep the front page live: the catalog's trending / coming-soon rails move
  // every few minutes, so refresh in the background rather than caching for long.
  staleTime: 30 * 1000,
  refetchInterval: 2 * 60 * 1000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
  refetchOnMount: "always",
});





const trendingQuery = queryOptions({
  queryKey: ["trending-wide"],
  queryFn: () => getTrending(),
  staleTime: 15 * 1000,
  refetchInterval: 60 * 1000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
  refetchOnMount: "always",
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "MOVIE MAX — Watch and Download Free Movies, Series, Animations, Episodes with Multiple Subtitles, Luo Translated Movies and Lugandan Translated Movies",
      },
      {
        name: "description",
        content:
          "MOVIE MAX — watch and download free movies, series, animations and episodes with multiple subtitles, plus Luo translated movies and Lugandan translated movies in HD.",
      },
      {
        property: "og:title",
        content:
          "MOVIE MAX — Watch and Download Free Movies, Series, Animations, Episodes with Multiple Subtitles, Luo & Lugandan Translated Movies",
      },
      {
        property: "og:description",
        content:
          "Free movies, series, animations and episodes with multiple subtitles, plus Luo and Lugandan translated movies — watch or download in HD.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // No blocking loader: the shell + skeletons render instantly and the catalog
  // fills in from the browser — this keeps first paint fast on every host.
  component: HomePage,
});

function HomePage() {
  const { data, refetch } = useQuery(homeQuery);
  const wideTrending = useQuery(trendingQuery);
  // On some hosts the upstream hero list comes back empty; fall back to
  // trending / first rail titles that have artwork so the slider never vanishes.
  const autoHero = (() => {
    const h = data?.hero ?? [];
    if (h.length) return h;
    const pool = [
      ...(wideTrending.data ?? []),
      ...(data?.trending ?? []),
      ...((data?.rows ?? []).flatMap((r) => r.items ?? [])),
    ];
    const seen = new Set<string>();
    return pool
      .filter((i) => (i.backdrop || i.poster) && !seen.has(i.id) && seen.add(i.id))
      .slice(0, 10)
      .map((i) => ({ ...i, backdrop: i.backdrop ?? i.poster }));
  })();
  // Admin-curated hero (API picks, uploaded VJ titles, promo banners) wins
  // over the automatic hero whenever the admin has saved any slides.
  const curated = useQuery({ queryKey: ["hero_slides"], queryFn: loadHeroSlides, staleTime: 60_000 });
  const slides: HeroCard[] = curated.data?.length
    ? curated.data.map((h) => ({
        id: h.key,
        title: h.title,
        image: h.image,
        watchId: h.kind === "api" ? h.refId : undefined,
        href: heroHref(h),
        vj: h.kind === "upload" ? h.vj : null,
        promo: h.kind === "promo",
        meta: h.subtitle ?? "",
      }))
    : autoHero.map((s) => ({
        id: s.id,
        title: s.title,
        image: s.backdrop,
        watchId: s.id,
        href: `/watch/${s.id}`,
        vj: null,
        promo: false,
        meta: [s.year, s.genre, s.rating ? `IMDb ${s.rating}` : null].filter(Boolean).join(" · "),
      }));
  // The hero never stops: the track repeats the cards and drifts left slowly
  // forever instead of jumping between fixed pages.
  const copies = Math.max(2, Math.ceil(6 / Math.max(slides.length, 1)));
  const marqueeDur = Math.max(28, slides.length * 8);

  // Keep the skeleton up until the first visible slide images have actually
  // downloaded, so cards never pop in half-loaded under or beside it.
  const [heroReady, setHeroReady] = useState(false);
  const slideKey = slides.map((s) => s.id).join("|");
  useEffect(() => {
    setHeroReady(false);
    if (!slides.length) return;
    let cancelled = false;
    const first = slides.slice(0, 4).map((s) => s.image).filter(Boolean) as string[];
    const done = () => {
      if (!cancelled) setHeroReady(true);
    };
    if (!first.length) {
      done();
      return;
    }
    let left = first.length;
    const one = () => {
      if (--left <= 0) done();
    };
    for (const src of first) {
      const img = new Image();
      img.onload = one;
      img.onerror = one;
      img.src = src;
    }
    // Never trap the page on a slow network — reveal after 5s regardless.
    const t = setTimeout(done, 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey]);

  // If a response came back empty (upstream unreachable), retry so the page
  // still fills in.
  const degraded =
    !!data && ((data as { degraded?: boolean }).degraded === true || autoHero.length === 0);
  useEffect(() => {
    if (!degraded) return;
    const t = setTimeout(() => void refetch(), 300);
    return () => clearTimeout(t);
  }, [degraded, refetch]);
  // Row titles arrive with emoji from upstream; strip them for a clean typographic look.
  const cleanTitle = (t: string) =>
    t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "").trim();
  const clean = <T extends { title: string; genre?: string | null }>(items: T[]) =>
    items.filter((i) => !isAdultItem(i));
  // The website's own home sections are used when available; the curated
  // search-built sections are only a fallback when the web home is down.
  const useWeb = !!data?.web;
  const sectionQueries = useQueries({
    queries: HOME_SECTIONS.map((section) =>
      queryOptions({
        queryKey: ["home-section", section.title],
        queryFn: () => getSection({ data: { title: section.title } }),
        enabled: !!data && !useWeb,
        staleTime: 30 * 1000,
        refetchInterval: 3 * 60 * 1000,
      }),
    ),
  });

  const sections: { title: string; items: CatalogItem[]; ranked?: boolean }[] = useWeb
    ? (data?.rows ?? []).map((r) => ({ title: cleanTitle(r.title), items: clean(r.items) }))
        .filter((s) => s.items.length >= 4)
    : HOME_SECTIONS.map((section, i) => ({
        ...section,
        items: clean(sectionQueries[i]?.data ?? []),
      })).filter((s) => s.items.length >= 4);

  // Real trending straight from the catalog's own trending rail.
  const rankedSection = sections.find((s) => s.ranked);
  const upstreamTrending = balanceTrending(
    clean([...(wideTrending.data ?? []), ...(data?.trending ?? []), ...(rankedSection?.items ?? [])]),
  );
  const trending = upstreamTrending.length >= 4 ? upstreamTrending : (rankedSection?.items ?? []);
  const comingSoon = clean(data?.comingSoon ?? []);
  const rails = sections.filter((s) => !s.ranked || s.items !== trending);


  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="relative">
          <TopBar />

          {(!heroReady || !slides.length) && (
            <div className="px-3 pt-[68px] sm:px-4 lg:px-8 lg:pt-20">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="aspect-[16/9] animate-pulse rounded-xl bg-muted/40" />
                ))}
              </div>
            </div>
          )}

          {heroReady && !!slides.length && (
            <section className="relative px-3 pt-[68px] [--card-w:calc((100vw-12px)/1.9)] sm:px-4 sm:[--card-w:calc((100vw-56px)/3)] lg:pt-20 lg:[--card-w:calc((100vw-260px)/3)] lg:px-8">
              {/* The hero never stops: cards in animated gradient holders pass
                  slowly across the page forever — 2 across on mobile, 3 bigger
                  ones on desktop. Hovering pauses the pass. */}
              <div className="hero-marquee overflow-hidden">
                <div
                  className="hero-marquee-track flex w-max"
                  style={
                    {
                      "--copies": copies,
                      animationDuration: `${marqueeDur}s`,
                    } as CSSProperties
                  }
                >
                  {Array.from({ length: copies }).map((_, c) => (
                    <div key={c} className="flex" aria-hidden={c > 0}>
                      {slides.map((s, i) => (
                        <div
                          key={`${c}-${s.id}`}
                          className="w-[calc(var(--card-w)+8px)] shrink-0 px-1"
                        >
                          <div className="hero-ring rounded-2xl p-[2px]">
                            <HeroLink
                              card={s}
                              tabIndex={c === 0 ? 0 : -1}
                              className="group relative block aspect-[16/9] overflow-hidden rounded-[calc(1rem-2px)] bg-card"
                            >
                              {s.vj && (
                                <span className="absolute left-2 top-2 z-10 rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary-foreground shadow sm:text-xs">
                                  VJ {s.vj}
                                </span>
                              )}
                              {s.promo && (
                                <span className="absolute left-2 top-2 z-10 rounded-md bg-background px-2 py-0.5 text-[10px] font-bold uppercase text-foreground shadow sm:text-xs">
                                  Promo
                                </span>
                              )}
                              {s.image ? (
                                <img
                                  src={s.image}
                                  alt={s.title}
                                  loading={c === 0 ? "eager" : "lazy"}
                                  fetchPriority={c === 0 && i === 0 ? "high" : "auto"}
                                  decoding="async"
                                  className="size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.04]"
                                />
                              ) : (
                                <div className="size-full bg-muted" />
                              )}

                              <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 p-2 sm:gap-1.5 sm:p-3 lg:p-4">
                                <h2 className="line-clamp-2 rounded-md bg-background px-2 py-1 text-[11px] font-bold leading-tight text-foreground sm:text-sm lg:text-base">
                                  {s.title}
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground sm:px-2.5 sm:py-1.5 sm:text-xs">
                                  <Play className="size-3 fill-current sm:size-3.5" />
                                  {s.promo ? "Open" : "Play"}
                                </span>
                                <p className="hidden max-w-[240px] truncate rounded-md bg-background px-2 py-1 text-[10px] text-foreground sm:block">
                                  {s.meta}
                                </p>
                              </div>
                            </HeroLink>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <div className="relative z-20 mt-4 mb-3 pl-3 sm:pl-4 lg:pl-8">
            <VjRail />
          </div>

          {!!trending.length && (
            <div className="relative z-10 pl-3 sm:pl-4 lg:pl-8">
              <Rail title="Trending now" items={trending} ranked priority />
            </div>
          )}
          <div className="relative z-10 pl-3 sm:pl-4 lg:pl-8">
            <ProviderTrending />
          </div>

        </div>

        <main className="pb-28 pl-3 sm:pl-4 lg:pb-16 lg:pl-8">
          {!data && (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )}
          {rails.map((row) => (
            <div key={row.title}>
              <Rail title={row.title} items={row.items} {...(row.ranked ? { ranked: true } : {})} />
              {row.title === "Gangster" && !!comingSoon.length && (
                <Rail title="Coming Soon" items={comingSoon} />
              )}
            </div>
          ))}
          {!rails.some((r) => r.title === "Gangster") && !!comingSoon.length && (
            <Rail title="Coming Soon" items={comingSoon} />
          )}
          {extraRows.map((row) => (
            <Rail key={row.title} title={cleanTitle(row.title)} items={clean(row.items)} />
          ))}
        </main>

      </div>
      <ReferralBanner />
      <MobileNav />
    </div>
  );
}

function HeroLink({ card, children, ...rest }: { card: HeroCard; children: ReactNode; tabIndex: number; className: string }) {
  if (card.watchId)
    return (
      <Link to="/watch/$id" params={{ id: card.watchId }} {...rest}>
        {children}
      </Link>
    );
  const external = /^https?:\/\//.test(card.href);
  return (
    <a href={card.href} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
