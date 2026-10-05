import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { z } from "zod";
import { Sidebar } from "@/components/youku/Sidebar";
import { TopBar } from "@/components/youku/TopBar";
import { MobileNav } from "@/components/youku/MobileNav";
import { GridSkeleton } from "@/components/youku/Skeletons";
import { ProviderCard, providerGrid } from "@/components/providers/ProviderCard";
import { providerHome, providerSearch } from "@/lib/providers.functions";
import { PROVIDERS, type ProviderId } from "@/lib/providers/types";

export const Route = createFileRoute("/p/$provider/")({
  validateSearch: z.object({ q: z.string().optional() }),
  beforeLoad: ({ params }) => {
    if (!PROVIDERS.some((p) => p.id === params.provider)) throw notFound();
  },
  head: ({ params }) => {
    const p = PROVIDERS.find((x) => x.id === params.provider);
    const title = `${p?.name ?? "Provider"} Movies & Series — MOVIE MAX`;
    const description = `Browse, stream and download ${p?.name ?? ""} titles in every quality on MOVIE MAX: ${p?.blurb ?? ""}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProviderPage,
});

function ProviderPage() {
  const { provider } = Route.useParams();
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [term, setTerm] = useState(q ?? "");
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const id = provider as ProviderId;

  const list = useQuery({
    queryKey: ["provider", id, q ?? ""],
    queryFn: () => (q ? providerSearch({ data: { provider: id, q } }) : providerHome({ data: { provider: id } })),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="relative h-[56px] lg:h-14">
          <TopBar />
        </div>
        <main className="px-3 pb-28 pt-4 sm:px-4 lg:px-8 lg:pb-16">
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <Link
                key={p.id}
                to="/p/$provider"
                params={{ provider: p.id }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ring-1 ring-border ${
                  p.id === provider ? "bg-brand text-brand-foreground" : "text-foreground/80 hover:bg-foreground/10"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">{meta.name}</h1>
          <p className="text-sm text-muted-foreground">{meta.blurb}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ search: { q: term.trim() || undefined } });
            }}
            className="mt-4 flex h-12 max-w-xl items-center gap-2 rounded-2xl bg-foreground/10 px-4 ring-1 ring-border"
          >
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label={`Search ${meta.name}`}
              placeholder={`Search ${meta.name}`}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/50"
            />
          </form>
          <div className="mt-6">
            {list.isPending ? (
              <GridSkeleton />
            ) : list.data?.items.length ? (
              q ? (
                <div className={providerGrid}>
                  {list.data.items.map((item) => <ProviderCard key={item.id} item={item} />)}
                </div>
              ) : (
                <div className="space-y-8">
                  {([["Movies", "movie"], ["Series", "series"]] as const).map(([label, type]) => {
                    const items = list.data!.items.filter((i) => i.type === type);
                    if (!items.length) return null;
                    return (
                      <section key={type}>
                        <h2 className="mb-3 flex items-baseline gap-2 text-lg font-black text-foreground">
                          {label} <span className="text-xs font-bold text-muted-foreground">{items.length}</span>
                        </h2>
                        <div className={providerGrid}>
                          {items.map((item) => <ProviderCard key={item.id} item={item} />)}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="card-soft p-8 text-center text-sm text-muted-foreground">
                {list.data?.error ? `${meta.name} is not reachable right now: ${list.data.error}` : "Nothing found."}
              </div>
            )}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
