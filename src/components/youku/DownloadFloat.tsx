import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileText, Film, Pause, Play, RotateCw, Trash2 } from "lucide-react";
import {
  clearFinishedDownloads,
  pauseDownload,
  removeDownload,
  restoreDownloads,
  resumeDownload,
  useDownloadQueue,
} from "@/lib/download-queue";
import { formatBytes } from "@/lib/download";

const STATUS: Record<string, string> = {
  preparing: "Preparing…",
  downloading: "Downloading",
  saving: "Saving file…",
  done: "Saved to your device",
  failed: "Failed",
  paused: "Paused",
  retrying: "Connection lost — retrying…",
};

export function DownloadFloat() {
  const items = useDownloadQueue();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    void restoreDownloads();
  }, []);
  if (!items.length) return null;
  const running = items.filter((i) => !["done", "failed", "paused"].includes(i.status)).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Download className="h-4 w-4 text-primary" />
        <p className="flex-1 text-sm font-semibold">
          {running ? `Downloading ${running} file${running > 1 ? "s" : ""}` : "Downloads"}
        </p>
        {!running && (
          <button onClick={clearFinishedDownloads} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-label="Toggle downloads" className="text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {items.map((item) => {
            const done = formatBytes(item.downloaded) ?? "0 B";
            const total = formatBytes(item.total);
            return (
              <li key={item.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {item.kind === "movie" ? (
                    <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <p className="flex-1 truncate text-sm font-medium" title={item.name}>{item.name}</p>
                  {item.kind === "movie" && ["preparing", "downloading", "retrying"].includes(item.status) && (
                    <button onClick={() => pauseDownload(item.id)} aria-label="Pause" title="Pause" className="text-muted-foreground hover:text-foreground">
                      <Pause className="h-4 w-4" />
                    </button>
                  )}
                  {item.status === "paused" && (
                    <button onClick={() => resumeDownload(item.id)} aria-label="Resume" title="Resume" className="text-muted-foreground hover:text-foreground">
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  {item.status === "failed" && (
                    <button onClick={() => resumeDownload(item.id)} aria-label="Retry" title="Retry" className="text-muted-foreground hover:text-foreground">
                      <RotateCw className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => removeDownload(item.id)} aria-label="Remove" title="Remove" className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${item.status === "failed" ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span className={item.status === "failed" ? "text-destructive" : ""}>
                    {item.status === "failed" ? item.error || STATUS["failed"] : STATUS[item.status]}
                  </span>
                  <span>
                    {total ? `${done} / ${total}` : done} · {item.percent}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
