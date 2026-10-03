import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { searchTitles, getTrending } from "@/lib/catalog.functions";
import { listAllLuoTitles } from "@/lib/luo";
import { uploadMedia } from "@/lib/admin";
import { loadHeroSlides, saveHeroSlides, type HeroSlide } from "@/lib/hero";
import { Empty, Panel, ghostBtn, goldBtn, softField } from "./ui";

const uid = () => Math.random().toString(36).slice(2, 10);

export function HeroTab() {
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["hero_slides"], queryFn: loadHeroSlides });
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (saved.data) setSlides(saved.data);
  }, [saved.data]);

  const add = (s: HeroSlide) => {
    if (slides.some((x) => x.kind === s.kind && x.refId && x.refId === s.refId))
      return void toast.info("Already in the hero");
    setSlides((p) => [...p, s]);
  };
  const move = (i: number, d: number) =>
    setSlides((p) => {
      const n = [...p];
      const j = i + d;
      if (j < 0 || j >= n.length) return p;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const save = async () => {
    setSaving(true);
    try {
      await saveHeroSlides(slides);
      qc.invalidateQueries({ queryKey: ["hero_slides"] });
      toast.success("Hero saved — live on the home page");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Panel
        title={`Hero slides (${slides.length})`}
        action={
          <button className={goldBtn} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save hero"}
          </button>
        }
      >
        <p className="mb-3 text-xs opacity-60">
          Leave empty to use the automatic hero. Order here is the order on the home page.
        </p>
        {!slides.length ? (
          <Empty>No slides picked yet.</Empty>
        ) : (
          <ul className="grid gap-2">
            {slides.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 rounded-2xl bg-white/60 p-2">
                <img src={s.image} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <p className="text-[11px] opacity-60">
                    {s.kind === "api" ? "Movie (API)" : s.kind === "upload" ? `Uploaded · VJ ${s.vj || "—"}` : `Promo · ${s.link || "no link"}`}
                  </p>
                </div>
                <button onClick={() => move(i, -1)} className="p-1 opacity-60 hover:opacity-100" aria-label="Move up"><ArrowUp className="size-4" /></button>
                <button onClick={() => move(i, 1)} className="p-1 opacity-60 hover:opacity-100" aria-label="Move down"><ArrowDown className="size-4" /></button>
                <button onClick={() => setSlides((p) => p.filter((x) => x.key !== s.key))} className="p-1 text-red-500" aria-label="Remove"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ApiPicker onAdd={add} />
      <UploadPicker onAdd={add} />
      <PromoForm onAdd={add} />
    </div>
  );
}

function PickGrid({ items, onPick }: { items: { id: string; title: string; image: string | null; sub?: string }[]; onPick: (id: string) => void }) {
  if (!items.length) return <Empty>Nothing to show.</Empty>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it.id)} className="group overflow-hidden rounded-2xl bg-white/60 text-left ring-1 ring-black/5">
          <div className="relative aspect-video bg-black/10">
            {it.image && <img src={it.image} alt="" loading="lazy" className="size-full object-cover" />}
            <span className="absolute right-1 top-1 rounded-full bg-white/90 p-1 opacity-0 transition group-hover:opacity-100"><Plus className="size-4" /></span>
          </div>
          <p className="truncate px-2 pt-1 text-xs font-semibold">{it.title}</p>
          {it.sub && <p className="truncate px-2 pb-1 text-[10px] opacity-60">{it.sub}</p>}
        </button>
      ))}
    </div>
  );
}

function ApiPicker({ onAdd }: { onAdd: (s: HeroSlide) => void }) {
  const search = useServerFn(searchTitles);
  const trendingFn = useServerFn(getTrending);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const res = useQuery({
    queryKey: ["hero-api", term],
    queryFn: async () => (term ? search({ data: { q: term } }) : ((await trendingFn()) as Awaited<ReturnType<typeof search>>)),
  });
  const items = (res.data ?? []).slice(0, 24);
  return (
    <Panel title="Latest / best / trending movies (API)">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q.trim());
        }}
      >
        <input className={softField} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies, or leave empty for trending" />
        <button className={ghostBtn}><Search className="size-4" /></button>
      </form>
      {res.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <PickGrid
          items={items.map((m) => ({ id: m.id, title: m.title, image: m.backdrop || m.poster, sub: [m.year, m.rating && `IMDb ${m.rating}`].filter(Boolean).join(" · ") }))}
          onPick={(id) => {
            const m = items.find((x) => x.id === id)!;
            onAdd({ key: uid(), kind: "api", refId: m.id, title: m.title, image: m.backdrop || m.poster || "", subtitle: [m.year, m.genre].filter(Boolean).join(" · ") });
          }}
        />
      )}
    </Panel>
  );
}

function UploadPicker({ onAdd }: { onAdd: (s: HeroSlide) => void }) {
  const res = useQuery({ queryKey: ["hero-uploads"], queryFn: listAllLuoTitles });
  const items = (res.data ?? []).filter((t) => t.published);
  return (
    <Panel title="Uploaded movies (with VJ tag)">
      {res.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <PickGrid
          items={items.map((t) => ({ id: t.id, title: t.title, image: t.backdrop_url || t.poster_url, sub: `VJ ${t.vj || "—"} · ${t.language}` }))}
          onPick={(id) => {
            const t = items.find((x) => x.id === id)!;
            onAdd({ key: uid(), kind: "upload", refId: t.id, language: t.language, title: t.title, image: t.backdrop_url || t.poster_url || "", vj: t.vj, subtitle: [t.year, t.genre].filter(Boolean).join(" · ") });
          }}
        />
      )}
    </Panel>
  );
}

function PromoForm({ onAdd }: { onAdd: (s: HeroSlide) => void }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [link, setLink] = useState("");
  const [image, setImage] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  const upload = async (f: File) => {
    setPct(0);
    try {
      const { url } = await uploadMedia(f, setPct);
      setImage(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPct(null);
    }
  };

  return (
    <Panel title="Promotion slide (manual banner)">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={softField} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input className={softField} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Short text (optional)" />
        <input className={softField} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link when clicked (e.g. /luo or https://…)" />
        <div className="flex gap-2">
          <input className={softField} value={image} onChange={(e) => setImage(e.target.value)} placeholder="Image URL" />
          <label className={`${ghostBtn} flex cursor-pointer items-center gap-1`}>
            <UploadCloud className="size-4" />
            {pct !== null ? `${Math.round(pct)}%` : "Upload"}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
      </div>
      {image && <img src={image} alt="" className="mt-3 aspect-video w-60 rounded-xl object-cover" />}
      <button
        className={`${goldBtn} mt-3`}
        disabled={!title.trim() || !image.trim()}
        onClick={() => {
          onAdd({ key: uid(), kind: "promo", title: title.trim(), image: image.trim(), link: link.trim() || null, subtitle: subtitle.trim() || null });
          setTitle("");
          setSubtitle("");
          setLink("");
          setImage("");
        }}
      >
        Add promo slide
      </button>
    </Panel>
  );
}
