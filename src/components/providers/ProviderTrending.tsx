import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { providerHome } from "@/lib/providers.functions";
import { ProviderCard } from "./ProviderCard";
import type { PItem } from "@/lib/providers/types";

const SOURCES = ["4khdhub", "dramachi", "addons"] as const;

/** Trending titles pulled from every extra provider, mixed into one rail. */
export function ProviderTrending() {
  const home = useServerFn(providerHome);
  const q = useQuery({
    queryKey: ["provider-trending"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const lists = await Promise.all(
        SOURCES.map((p) => home({ data: { provider: p } }).then((r) => r.items).catch(() => [] as PItem[])),
      );
      // Interleave so every source shows up near the front.
      const out: PItem[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++)
        for (const l of lists) {
          const it = l[i];
          if (!it) continue;
          const k = it.title.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(it);
        }
      return out;
    },
  });
  if (!q.data?.length) return null;
  return (
    <section className="mt-6 pr-3 sm:pr-4 lg:pr-8">
      <h2 className="mb-3 text-[17px] font-bold text-foreground">Trending on all sources</h2>
      <div className="flex gap-2 overflow-x-auto pb-2 sm:gap-3 [scrollbar-width:none]">
        {q.data.map((it) => (
          <div key={`${it.provider}:${it.id}`} className="w-[30%] shrink-0 sm:w-[160px]">
            <ProviderCard item={it} />
          </div>
        ))}
      </div>
    </section>
  );
}
