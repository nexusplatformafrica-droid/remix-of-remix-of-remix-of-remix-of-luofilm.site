import { Link } from "@tanstack/react-router";
import { providerName, type PItem } from "@/lib/providers/types";

export function ProviderCard({ item }: { item: PItem }) {
  return (
    <Link
      to="/p/$provider/$id"
      params={{ provider: item.provider, id: item.id }}
      aria-label={item.title}
      className="group block w-full"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted ring-1 ring-border transition-transform duration-200 group-hover:-translate-y-1 group-hover:ring-brand">
        {item.poster ? (
          <img src={item.poster} alt={item.title} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center px-2 text-center text-sm text-muted-foreground">{item.title}</div>
        )}
        <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-brand-foreground shadow">
          {providerName(item.provider)}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-1 text-[13px] font-semibold text-foreground">{item.title}</p>
      <p className="text-[11px] text-muted-foreground">
        {[item.year, item.type === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

export const providerGrid =
  "grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-5 md:grid-cols-5 xl:grid-cols-6";
