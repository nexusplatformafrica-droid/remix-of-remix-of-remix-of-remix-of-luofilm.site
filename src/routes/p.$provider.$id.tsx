import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Play } from "lucide-react";
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

  const episodes = useMemo(() => {
    const sorted = [...(q.data?.sources ?? [])].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality));
    const map = new Map<string, { label: string; order: number; list: PSource[] }>();
    for (const s of sorted) {
      const t = `${s.group ?? ""} ${s.filename}`;
      const se = t.match(/S(\d{1,2})[ ._-]?E(\d{1,3})/i) ?? t.match(/Season[ ._-]?(\d+).*?Episode[ ._-]?(\d+)/i);
      const ep = se ? null : t.match(/\b(?:EP?|Episode)[ ._-]?(\d{1,3})\b/i);
      const key = se ? `S${+se[1]!}E${+se[2]!}` : ep ? `E${+ep[1]!}` : (s.group ?? "Full");
      const label = se ? `S${String(+se[1]!).padStart(2, "0")} · E${String(+se[2]!).padStart(2, "0")}` : ep ? `Episode ${+ep[1]!}` : (s.group ?? "Full title");
      const order = se ? +se[1]! * 1000 + +se[2]! : ep ? +ep[1]! : 1e6;
      const cur = map.get(key) ?? { label, order, list: [] };
      cur.list.push(s);
      map.set(key, cur);
    }
    return [...map.entries()].sort((x, y) => x[1].order - y[1].order);
  }, [q.data]);
  const [epKey, setEpKey] = useState<string | null>(null);
  const curEp = episodes.find(([k]) => k === epKey) ?? episodes[0];
  const isSeries = q.data?.details?.type === "series" || episodes.length > 1;

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
              <div className={`mt-3 grid gap-4 ${isSeries ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                <div className="min-w-0">
                  <div className="overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                    {playing ? (
                      needsMovi(`${playing.src.filename ?? ""} ${playing.src.quality ?? ""}`) || !playing.src.playable ? (
                        <MoviVideo key={playing.url} src={playing.url} poster={d.backdrop ?? d.poster ?? undefined} className="aspect-video w-full" />
                      ) : (
                        <Player key={playing.url} src={playing.url} kind="mp4" poster={d.backdrop ?? d.poster ?? undefined} title={d.title} className="aspect-video w-full" />
                      )
                    ) : (
                      <button type="button" onClick={() => curEp?.[1].list[0] && play(curEp[1].list[0])} className="relative grid aspect-video w-full place-items-center bg-cover bg-center" style={{ backgroundImage: d.backdrop || d.poster ? `url(${d.backdrop ?? d.poster})` : undefined }}>
                        <span className="grid size-16 place-items-center rounded-full bg-brand text-primary-foreground shadow-lg ring-4 ring-background/40">
                          {resolve.isPending ? <Loader2 className="size-7 animate-spin" /> : <Play className="size-7 fill-current" />}
                        </span>
                      </button>
                    )}
                  </div>
                  {playing && (
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">Now playing: {playing.src.quality} · {playing.src.filename}</p>
                  )}

                  <div className="mt-4 rounded-2xl bg-card p-3 ring-1 ring-border">
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-sm font-black text-foreground">
                        Sources {isSeries && curEp ? <span className="text-brand">· {curEp[1].label}</span> : null}
                      </h2>
                      <span className="text-[11px] text-muted-foreground">{curEp?.[1].list.length ?? 0} available</span>
                    </div>
                    {!curEp && <p className="text-sm text-muted-foreground">No video files were found for this title.</p>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {curEp?.[1].list.map((s) => {
                        const busy = resolve.isPending && resolve.variables?.token === s.token;
                        const active = playing?.src.token === s.token;
                        return (
                          <div key={s.token} title={s.filename} className={`relative flex h-[58px] items-stretch overflow-hidden rounded-lg ring-1 transition ${active ? "bg-brand/15 ring-brand" : "bg-background ring-border hover:ring-brand"}`}>
                            <button type="button" disabled={busy} onClick={() => play(s)} className="min-w-0 flex-1 px-2 text-left disabled:opacity-60">
                              <span className="flex items-center gap-1">
                                <span className="text-[12px] font-black text-foreground">{s.quality}</span>
                                <span className="rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">{s.ext}</span>
                                {busy && <Loader2 className="size-3 animate-spin text-brand" />}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">{[s.size, providerName(s.provider)].filter(Boolean).join(" · ")}</span>
                            </button>
                            <button type="button" aria-label="Download" disabled={busy} onClick={() => download(s)} className="grid w-9 shrink-0 place-items-center border-l border-border text-foreground hover:bg-foreground/10 disabled:opacity-60">
                              <Download className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-4">
                    {d.poster && <img src={d.poster} alt={d.title} className="hidden w-32 shrink-0 rounded-xl object-cover ring-1 ring-border sm:block" />}
                    <div className="min-w-0">
                      <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{d.title}</h1>
                      <p className="mt-1 text-sm text-muted-foreground">{[d.year, isSeries ? "Series" : "Movie", d.genres].filter(Boolean).join(" · ")}</p>
                      {d.overview && <p className="mt-3 max-w-3xl text-sm text-foreground/80">{d.overview}</p>}
                    </div>
                  </div>
                </div>

                {isSeries && (
                  <aside className="rounded-2xl bg-card p-3 ring-1 ring-border lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
                    <h2 className="mb-2 text-sm font-black text-foreground">Episodes ({episodes.length})</h2>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-1">
                      {episodes.map(([k, ep]) => {
                        const on = curEp?.[0] === k;
                        return (
                          <button key={k} type="button" onClick={() => { setEpKey(k); if (ep.list[0]) play(ep.list[0]); }} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold ring-1 transition ${on ? "bg-brand text-primary-foreground ring-brand" : "bg-background text-foreground ring-border hover:ring-brand"}`}>
                            <span className="truncate">{ep.label}</span>
                            <span className={`hidden text-[10px] font-medium lg:inline ${on ? "opacity-90" : "text-muted-foreground"}`}>{ep.list.length} src</span>
                          </button>
                        );
                      })}
                    </div>
                  </aside>
                )}
              </div>

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
