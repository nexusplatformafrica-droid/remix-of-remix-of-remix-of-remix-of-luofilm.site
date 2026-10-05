import { Link, useRouterState } from "@tanstack/react-router";
import homeIcon from "@/assets/home.svg.asset.json";
import moviesIcon from "@/assets/movies.svg.asset.json";
import seriesIcon from "@/assets/series.svg.asset.json";
import animationIcon from "@/assets/animation.svg.asset.json";
import tvIcon from "@/assets/tv.svg.asset.json";

const items = [
  { slug: "home", label: "Home", icon: homeIcon.url },
  { slug: "movies", label: "Movies", icon: moviesIcon.url },
  { slug: "drama", label: "Series", icon: seriesIcon.url },
  { slug: "animation", label: "Animation", icon: animationIcon.url },
  { slug: "tv", label: "TV", icon: tvIcon.url },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const itemClass = (active: boolean) =>
    `relative flex size-14 items-center justify-center transition-colors ${
      active
        ? "bg-sidebar-accent"
        : "hover:bg-sidebar-accent"
    }`;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <nav aria-label="Categories" className="scrollbar-none flex-1 overflow-y-auto pt-16 pb-4">
        {items.map(({ slug, label, icon }) => {
          const active = slug === "home" ? pathname === "/" : pathname === `/category/${slug}`;
          const inner = (
            <>
              {active && (
                <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary" />
              )}
              <img src={icon} alt="" className={`size-7 shrink-0 object-contain brightness-0 invert ${active ? "opacity-100" : "opacity-75"}`} />
            </>
          );
          return slug === "home" ? (
              <Link key={slug} to="/" className={itemClass(active)} title={label} aria-label={label} aria-current={active ? "page" : undefined}>
              {inner}
            </Link>
          ) : (
              <Link key={slug} to="/category/$slug" params={{ slug }} className={itemClass(active)} title={label} aria-label={label} aria-current={active ? "page" : undefined}>
              {inner}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
