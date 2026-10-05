import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Sidebar } from "@/components/youku/Sidebar";
import { TopBar } from "@/components/youku/TopBar";
import { MobileNav } from "@/components/youku/MobileNav";
import { LuoLibrary } from "@/components/luo/LuoLibrary";

export const Route = createFileRoute("/teso/")({
  head: () => {
    const title =
      "MOVIE MAX Watch and Download Teso Translated Movies by Your Favourite VJ — Movies and Series from All Teso VJs";
    const description =
      "Watch and download Teso translated movies and series from your favourite Teso VJs. Movies, series, animation, comedy, action and every genre, free in HD.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "/teso" },
        { property: "og:site_name", content: "MOVIE MAX" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "/teso" }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            inLanguage: "teo",
          }),
        },
      ],
    };
  },
  validateSearch: (search: Record<string, unknown>): { vj?: string } =>
    typeof search["vj"] === "string" && search["vj"] ? { vj: search["vj"] } : {},
  component: TesoPage,
});

function TesoPage() {
  const { vj = "" } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="relative h-[56px] lg:h-14">
          <TopBar />
        </div>
        <main className="px-3 pb-28 sm:px-4 lg:px-8 lg:pb-16">
          <Link
            to="/tutorial"
            className="mt-4 flex items-center gap-3 rounded-2xl bg-card/70 px-4 py-3 ring-1 ring-border transition hover:ring-brand"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
              <GraduationCap className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-foreground">
                New here? See how to find translated movies
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                A quick 4-step tutorial — find, watch and download in Luo, Luganda & Teso.
              </span>
            </span>
          </Link>
          <div className="mt-4">
            <LuoLibrary language="teso" vj={vj} />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
