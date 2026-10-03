/**
 * Movi Player wrapper — plays MKV / HEVC / AV1 / 4K files the browser's
 * native <video> can't. Loaded only in the browser (WASM + custom element).
 */
import { createElement, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function MoviVideo({ src, poster, className }: { src: string; poster?: string | undefined; className?: string | undefined }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import("movi-player/element").then(() => alive && setReady(true)).catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  if (!ready)
    return (
      <div className={`grid place-items-center bg-muted ${className ?? ""}`}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  return createElement("movi-player", {
    src,
    poster,
    controls: true,
    autoplay: true,
    class: className,
    style: { display: "block" },
  });
}

export const needsMovi = (name: string) => /\.(mkv|avi|ts|m2ts|webm|mov|flv|wmv)(\?|$)/i.test(name) || /\b(hevc|x265|h265|av1|10bit)\b/i.test(name);
