import { useEffect, useState } from "react";
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
import { getHome, getTrending, getSection } from "@/lib/catalog.functions";
import { balanceTrending } from "@/lib/trending-filter";
import { HOME_SECTIONS } from "@/lib/home-sections";

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
          "LUOFILM.SITE — Watch and Download Free Movies, Series, Animations, Episodes with Multiple Subtitles, Luo Translated Movies and Lugandan Translated Movies",
      },
      {
        name: "description",
        content:
          "LUOFILM.SITE — watch and download free movies, series, animations and episodes with multiple subtitles, plus Luo translated movies and Lugandan translated movies in HD.",
      },
      {
        property: "og:title",
        content:
          "LUOFILM.SITE — Watch and Download Free Movies, Series, Animations, Episodes with Multiple Subtitles, Luo & Lugandan Translated Movies",
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
  const slides = data?.hero ?? [];
  const [index, setIndex] = useState(0);
  // Hero cards pass together as a grid: 2 per page on mobile, 4 on desktop.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const perPage = isWide ? 4 : 2;
  const pageCount = Math.max(1, Math.ceil(slides.length / perPage));
  const heroPages = Array.from({ length: pageCount }, (_, p) =>
    slides.slice(p * perPage, (p + 1) * perPage),
  );

  // If a response came back empty (upstream unreachable), retry so the page
  // still fills in.
  const degraded =
    !!data && ((data as { degraded?: boolean }).degraded === true || slides.length === 0);
  useEffect(() => {
    if (!degraded) return;
    const t = setTimeout(() => void refetch(), 300);
    return () => clearTimeout(t);
  }, [degraded, refetch]);

  useEffect(() => {
    if (pageCount < 2) return;
    setIndex((i) => Math.min(i, pageCount - 1));
    const t = setInterval(() => setIndex((i) => (i + 1) % pageCount), 6000);
    return () => clearInterval(t);
  }, [pageCount]);


  const slide = slides[Math.min(index, Math.max(slides.length - 1, 0))];
  // Row titles arrive with emoji from upstream; strip them for a clean typographic look.
  const cleanTitle = (t: string) =>
    t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "").trim();
  const clean = <T extends { title: string; genre?: string | null }>(items: T[]) =>
    items.filter((i) => !isAdultItem(i));
  // Curated sections (Popular Series, Most trending, K-Drama, …) filled live.
  const sectionQueries = useQueries({
    queries: HOME_SECTIONS.map((section) =>
      queryOptions({
        queryKey: ["home-section", section.title],
        queryFn: () => getSection({ data: { title: section.title } }),
        // Every rail refreshes itself from the live catalog instead of serving
        // whatever was cached the first time the page opened.
        staleTime: 30 * 1000,
        refetchInterval: 3 * 60 * 1000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
        refetchOnMount: "always",
      }),
    ),
  });


  const sections = HOME_SECTIONS.map((section, i) => ({
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
  // Any extra upstream rows we don't already cover.
  const extraRows = (data?.rows ?? [])
    .slice(1)
    .filter(
      (r) =>
        !/trending|coming soon/i.test(r.title) &&
        !HOME_SECTIONS.some((s) => cleanTitle(r.title).toLowerCase() === s.title.toLowerCase()),
    );


  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="relative">
          <TopBar />

          {!data && (
            <div className="px-3 pt-4 sm:px-4 lg:px-8">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[16/9] animate-pulse rounded-xl bg-muted/40" />
                ))}
              </div>
            </div>
          )}

          {!!data && !slide && <div className="h-16" />}

          {slide && (
            <section className="relative px-3 pt-4 sm:px-4 lg:px-8">
              {/* Sliding track: cards pass together as a grid — 2 per page on
                  mobile, 4 per page on desktop — each in its own holder. */}
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-700 ease-out"
                  style={{ transform: `translateX(-${index * 100}%)` }}
                >
                  {heroPages.map((pageSlides, p) => (
                    <div
                      key={p}
                      className="grid w-full shrink-0 grid-cols-2 gap-2 px-0.5 sm:grid-cols-4 sm:gap-3"
                      aria-hidden={p !== index}
                    >
                      {pageSlides.map((s, i) => (
                        <Link
                          key={s.id}
                          to="/watch/$id"
                          params={{ id: s.id }}
                          className="group relative block aspect-[16/9] overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-foreground/10 sm:rounded-2xl"
                          tabIndex={p === index ? 0 : -1}
                        >
                          {s.backdrop ? (
                            <img
                              src={s.backdrop}
                              alt={s.title}
                              loading={p === 0 ? "eager" : "lazy"}
                              fetchPriority={p === 0 ? "high" : "auto"}
                              decoding="async"
                              className="size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="size-full bg-muted" />
                          )}

                          {/* Bottom fade inside the card for readable text. */}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                          <div className="absolute bottom-0 left-0 flex flex-col gap-1 p-2 sm:gap-1.5 sm:p-3 lg:p-4">
                            <h2 className="line-clamp-2 text-[11px] font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-sm lg:text-base">
                              {s.title}
                            </h2>
                            <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded bg-white/20 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/30 sm:px-2.5 sm:py-1.5 sm:text-xs">
                              <Play className="size-3 fill-current sm:size-3.5" />
                              Play
                            </span>
                            <p className="hidden max-w-[200px] truncate text-[10px] text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:block">
                              {[s.year, s.genre, s.rating ? `IMDb ${s.rating}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {pageCount > 1 && (
                <div className="mt-3 flex justify-center gap-2">
                  {heroPages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Show page ${i + 1}`}
                      onClick={() => setIndex(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === index ? "w-6 bg-brand" : "w-2 bg-foreground/40"
                      }`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="relative z-20 -mt-4 mb-3 pl-3 sm:pl-4 lg:pl-8">
            <VjRail />
          </div>

          {!!trending.length && (
            <div className="relative z-10 pl-3 sm:pl-4 lg:pl-8">
              <Rail title="Trending now" items={trending} ranked priority />
            </div>
          )}

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
