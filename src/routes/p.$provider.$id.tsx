import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/youku/Sidebar";
import { TopBar } from "@/components/youku/TopBar";
import { MobileNav } from "@/components/youku/MobileNav";
import { Player } from "@/components/youku/Player";
import { MoviVideo, needsMovi } from "@/components/youku/MoviVideo";
import { ProviderCard, providerGrid } from "@/components/providers/ProviderCard";
import { providerDetails, providerHome, providerSearch, resolveSource } from "@/lib/providers.functions";
import { providerName, qualityRank, type PMirror, type PSource, type ProviderId } from "@/lib/providers/types";
import { startWorkerDownload, streamUrl } from "@/lib/download";

export const Route = createFileRoute("/p/$provider/$id")({
  head: ({ params }) => {
    const title = `Watch & Download on ${providerName(params.provider)} — LUOFILM`;
    const description = `Stream or download this title from ${providerName(params.provider)} in every available quality, up to 4K and 8K.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "video.movie" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProviderWatch,
});

const relay = (url: string) => (url.startsWith("https://") ? streamUrl(url) : url);
const dlName = (s: PSource) => {
  const base = s.filename.replace(/\.(mkv|mp4|webm|avi|m4v)$/i, "").replace(/[^\w.\- ]+/g, "_").slice(0, 110);
  return `${base}.${s.ext}`;
};

function ProviderWatch() {
  const { provider, id } = Route.useParams();
  const q = useQuery({
    queryKey: ["provider-details", provider, id],
    queryFn: () => providerDetails({ data: { provider: provider as ProviderId, id } }),
    staleTime: 10 * 60 * 1000,
  });
  const [playing, setPlaying] = useState<{ src: PSource; url: string } | null>(null);
  const [mirrors, setMirrors] = useState<Record<string, PMirror[]>>({});

  const resolve = useMutation({
    mutationFn: async (s: PSource): Promise<PMirror[]> => {
      const cached = mirrors[s.token];
      if (cached) return cached;
      const m = await resolveSource({ data: { token: s.token } });
      setMirrors((prev) => ({ ...prev, [s.token]: m }));
      return m;
    },
  });

  const play = async (s: PSource) => {
    try {
      const m = await resolve.mutateAsync(s);
      if (!m[0]) throw new Error("No file"); setPlaying({ src: s, url: relay(m[0].url) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This source is unavailable");
    }
  };
  const download = async (s: PSource, mirror?: PMirror) => {
    try {
      const m = mirror ? [mirror] : await resolve.mutateAsync(s);
      const url = m[0]?.url; if (!url) throw new Error("No file");
      const name = dlName(s);
      await startWorkerDownload(url.startsWith("https://") ? `${streamUrl(url)}&dl=${encodeURIComponent(name)}` : url, name);
      toast.success("Download started — check your browser downloads");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This source is unavailable");
    }
  };

  const groups = useMemo(() => {
    const sorted = [...(q.data?.sources ?? [])].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality));
    const map = new Map<string, PSource[]>();
    for (const s of sorted) {
      const key = s.group ?? "Files";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [q.data]);

  const d = q.data?.details;
  const rel = useQuery({
    queryKey: ["provider-related", provider, d?.title],
    enabled: !!d?.title,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const word = (d?.title ?? "").split(/\s+/).find((w) => w.length > 3) ?? "";
      const a = word ? await providerSearch({ data: { provider: provider as ProviderId, q: word } }).catch(() => null) : null;
      const b = await providerHome({ data: { provider: provider as ProviderId } }).catch(() => null);
      const seen = new Set([id]);
      return [...(a?.items ?? []), ...(b?.items ?? [])].filter((it) => !seen.has(it.id) && seen.add(it.id)).slice(0, 18);
    },
  });
  const related = rel.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="relative h-[56px] lg:h-14">
          <TopBar />
        </div>
        <main className="px-3 pb-28 pt-4 sm:px-4 lg:px-8 lg:pb-16">
          <Link to="/p/$provider" params={{ provider }} className="text-xs font-bold uppercase text-brand">
            ← {providerName(provider)}
          </Link>
          {q.isPending ? (
            <div className="mt-10 grid place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
          ) : q.isError || !d ? (
            <div className="card-soft mt-6 p-8 text-center text-sm text-muted-foreground">
              {q.error instanceof Error ? q.error.message : "Title not available."}
            </div>
          ) : (
            <>
              {playing && (
                <div className="mt-3 overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                  {needsMovi(`${playing.src.filename ?? ""} ${playing.src.quality ?? ""}`) ? (
                    <MoviVideo key={playing.url} src={playing.url} poster={d.backdrop ?? d.poster ?? undefined} className="aspect-video w-full" />
                  ) : (
                    <Player key={playing.url} src={playing.url} kind="mp4" poster={d.backdrop ?? d.poster ?? undefined} title={d.title} className="aspect-video w-full" />
                  )}
                  <p className="p-2 text-[11px] text-muted-foreground">
                    {playing.src.quality} · {playing.src.filename} — if it doesn't play, use Download.
                  </p>
                </div>
              )}
              <div className="mt-4 flex gap-4">
                {d.poster && <img src={d.poster} alt={d.title} className="hidden w-40 shrink-0 rounded-xl object-cover ring-1 ring-border sm:block" />}
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{d.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[d.year, d.type === "series" ? "Series" : "Movie", d.genres].filter(Boolean).join(" · ")}
                  </p>
                  {d.overview && <p className="mt-3 max-w-3xl text-sm text-foreground/80">{d.overview}</p>}
                </div>
              </div>

              <h2 className="mt-6 text-lg font-black text-foreground">Sources ({q.data.sources.length})</h2>
              {!groups.length && <p className="mt-2 text-sm text-muted-foreground">No video files were found for this title.</p>}
              {groups.map(([group, list]) => (
                <section key={group} className="mt-3">
                  {groups.length > 1 && <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{group}</h3>}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {list.map((s) => {
                      const busy = resolve.isPending && resolve.variables?.token === s.token;
                      const active = playing?.src.token === s.token;
                      return (
                        <div key={s.token} title={s.filename} className={`relative flex h-[58px] items-stretch overflow-hidden rounded-lg ring-1 transition ${active ? "bg-brand/15 ring-brand" : "bg-card ring-border hover:ring-brand"}`}>
                          <button type="button" disabled={busy} onClick={() => (s.playable ? play(s) : download(s))} className="min-w-0 flex-1 px-2 text-left disabled:opacity-60">
                            <span className="flex items-center gap-1">
                              <span className="text-[12px] font-black text-foreground">{s.quality}</span>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground">{s.ext}</span>
                              {busy && <Loader2 className="size-3 animate-spin text-brand" />}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {[s.size, s.playable ? null : "Download only"].filter(Boolean).join(" · ") || providerName(s.provider)}
                            </span>
                          </button>
                          <button type="button" aria-label="Download" disabled={busy} onClick={() => download(s)} className="grid w-9 shrink-0 place-items-center border-l border-border text-foreground hover:bg-foreground/10 disabled:opacity-60">
                            <Download className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {!!related.length && (
                <section className="mt-8">
                  <h2 className="mb-3 text-lg font-black text-foreground">Related</h2>
                  <div className={providerGrid}>
                    {related.map((it) => <ProviderCard key={`${it.provider}:${it.id}`} item={it} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
