import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/admin";

const CLICKABLE = "a,button,[role='button'],[role='link'],[role='menuitem'],[role='tab'],summary";

function safeLabel(element: HTMLElement) {
  const raw =
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.textContent ??
    element.tagName.toLowerCase();
  return raw.replace(/\s+/g, " ").trim().slice(0, 80) || element.tagName.toLowerCase();
}

function safeTarget(element: HTMLElement) {
  if (!(element instanceof HTMLAnchorElement)) return null;
  try {
    const url = new URL(element.href, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : url.hostname;
  } catch {
    return null;
  }
}

/** Records signed-in users' meaningful clicks without collecting typed values. */
export function ActivityTracker() {
  const { user } = useAuth();
  const last = useRef("");

  useEffect(() => {
    if (!user) return;
    const onClick = (event: MouseEvent) => {
      const source = event.target;
      if (!(source instanceof Element)) return;
      const element = source.closest<HTMLElement>(CLICKABLE);
      if (!element || element.closest("[data-no-activity]")) return;
      const label = safeLabel(element);
      const target = safeTarget(element);
      const fingerprint = `${location.pathname}|${label}|${target ?? ""}`;
      if (last.current === fingerprint) return;
      last.current = fingerprint;
      window.setTimeout(() => {
        if (last.current === fingerprint) last.current = "";
      }, 700);
      void logActivity("Clicked", label, {
        page: location.pathname,
        destination: target,
        control: element.tagName.toLowerCase(),
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [user]);

  return null;
}