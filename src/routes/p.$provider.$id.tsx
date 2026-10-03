import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/youku/Sidebar";
import { TopBar } from "@/components/youku/TopBar";
import { MobileNav } from "@/components/youku/MobileNav";
import { providerDetails, resolveSource } from "@/lib/providers.functions";
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
                  <video key={playing.url} src={playing.url} controls autoPlay playsInline className="aspect-video w-full bg-background" />
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

              <h2 className="mt-8 text-lg font-black text-foreground">All sources & qualities ({q.data.sources.length})</h2>
              {!groups.length && <p className="mt-2 text-sm text-muted-foreground">No video files were found for this title.</p>}
              {groups.map(([group, list]) => (
                <section key={group} className="mt-4">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{group}</h3>
                  <div className="space-y-2">
                    {list.map((s) => {
                      const busy = resolve.isPending && resolve.variables?.token === s.token;
                      return (
                        <div key={s.token} className="card-soft flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-black text-brand-foreground">{s.quality}</span>
                              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-foreground">{s.ext}</span>
                              {s.size && <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[11px] font-bold text-foreground">{s.size}</span>}
                              <span className="text-[11px] text-muted-foreground">{providerName(s.provider)}</span>
                              {!s.playable && <span className="text-[11px] font-semibold text-muted-foreground">· Download only</span>}
                            </div>
                            <p className="mt-1 break-words text-xs text-foreground/80">{s.filename}</p>
                            {(mirrors[s.token]?.length ?? 0) > 1 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(mirrors[s.token] ?? []).map((m) => (
                                  <button key={m.url} type="button" onClick={() => download(s, m)} className="rounded bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground hover:bg-foreground/20">
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {s.playable && (
                              <button type="button" disabled={busy} onClick={() => play(s)} className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-xs font-bold text-brand-foreground disabled:opacity-60">
                                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Play
                              </button>
                            )}
                            <button type="button" disabled={busy} onClick={() => download(s)} className="flex items-center gap-1 rounded-full bg-foreground/15 px-4 py-2 text-xs font-bold text-foreground hover:bg-foreground/25 disabled:opacity-60">
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
