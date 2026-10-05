import { Link, useRouterState } from "@tanstack/react-router";
import { Icon3D } from "@/components/Icon3D";
import { CATEGORIES } from "@/lib/categories";

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const itemClass = (active: boolean) =>
    `relative flex size-14 items-center justify-center transition-colors ${
      active
        ? "text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
    }`;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col bg-sidebar lg:flex">
      <nav aria-label="Categories" className="scrollbar-none flex-1 overflow-y-auto pt-16 pb-4">
        {CATEGORIES.map(({ slug, short, icon }) => {
          const active = slug === "home" ? pathname === "/" : pathname === `/category/${slug}`;
          const inner = (
            <>
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary" />
              )}
              <Icon3D name={icon} className="size-8 shrink-0" />
            </>
          );
          return slug === "home" ? (
             <Link key={slug} to="/" className={itemClass(active)} title={short} aria-label={short}>
              {inner}
            </Link>
          ) : (
             <Link key={slug} to="/category/$slug" params={{ slug }} className={itemClass(active)} title={short} aria-label={short}>
              {inner}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
