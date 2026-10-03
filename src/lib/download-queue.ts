/**
 * In-app download queue shown in the floating download panel.
 * Lives outside React so page navigation never stops a download; progress is
 * stored in the browser, so after a refresh unfinished movies resume from the
 * last saved byte range. Network loss/errors are retried automatically.
 */
import { useSyncExternalStore } from "react";
import {
  deleteDownloadRecord,
  downloadCatalogFile,
  DownloadAborted,
  NeedsNativeDownload,
  listDownloadRecords,
  setDownloadStatus,
  type CatalogDownloadInput,
} from "@/lib/catalog-download-manager";

export type QueueItem = {
  id: string;
  kind: "movie" | "subtitle";
  name: string;
  downloaded: number;
  total: number;
  percent: number;
  status: "preparing" | "downloading" | "saving" | "paused" | "retrying" | "done" | "failed";
  error?: string | undefined;
};

let items: QueueItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function upsert(item: Partial<QueueItem> & { id: string }) {
  const index = items.findIndex((i) => i.id === item.id);
  if (index === -1) items = [item as QueueItem, ...items];
  else items = items.map((i) => (i.id === item.id ? { ...i, ...item } : i));
  emit();
}

export function useDownloadQueue() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}

const inputs = new Map<string, CatalogDownloadInput>();
const controllers = new Map<string, AbortController>();
const subtitleJobs = new Map<string, () => void>();

function runMovie(input: CatalogDownloadInput) {
  if (controllers.has(input.id)) return;
  const controller = new AbortController();
  controllers.set(input.id, controller);
  inputs.set(input.id, input);
  upsert({ id: input.id, kind: "movie", name: input.filename, status: "preparing", error: undefined });
  void downloadCatalogFile(
    input,
    (p) => upsert({ id: input.id, ...p }),
    controller.signal,
    () => upsert({ id: input.id, status: "retrying" }),
  )
    .then(() => upsert({ id: input.id, status: "done", percent: 100 }))
    .catch((e: unknown) => {
      if (e instanceof NeedsNativeDownload) {
        // Hand the file to the browser's own download manager instead.
        const a = document.createElement("a");
        a.href = `${input.url}&dl=${encodeURIComponent(input.filename)}`;
        a.download = input.filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        upsert({ id: input.id, status: "done", percent: 100, error: undefined });
        return;
      }
      if (e instanceof DownloadAborted || controller.signal.aborted) {
        if (items.some((i) => i.id === input.id)) upsert({ id: input.id, status: "paused" });
      } else {
        upsert({ id: input.id, status: "failed", error: e instanceof Error ? e.message : "Download failed" });
      }
    })
    .finally(() => {
      if (controllers.get(input.id) === controller) controllers.delete(input.id);
    });
}

export function queueMovieDownload(input: CatalogDownloadInput) {
  if (!items.some((i) => i.id === input.id)) {
    upsert({ id: input.id, kind: "movie", name: input.filename, downloaded: 0, total: 0, percent: 0, status: "preparing" });
  }
  runMovie(input);
}

export function pauseDownload(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  upsert({ id, status: "paused" });
  void setDownloadStatus(id, "paused").catch(() => {});
}

export function resumeDownload(id: string) {
  const input = inputs.get(id);
  if (input) runMovie(input);
  else subtitleJobs.get(id)?.();
}

export function removeDownload(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  inputs.delete(id);
  subtitleJobs.delete(id);
  items = items.filter((i) => i.id !== id);
  emit();
  void deleteDownloadRecord(id).catch(() => {});
}

export function clearFinishedDownloads() {
  for (const i of items) if (i.status === "done") removeDownload(i.id);
}

export function queueSubtitleDownload(url: string, filename: string) {
  const id = `sub:${url}`;
  const run = () => {
    upsert({ id, kind: "subtitle", name: filename, downloaded: 0, total: 0, percent: 0, status: "downloading", error: undefined });
    void (async () => {
      let attempt = 0;
      for (;;) {
        try {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) throw new Error("Subtitle not available");
          return await response.blob();
        } catch (e) {
          if (++attempt > 5) throw e;
          upsert({ id, status: "retrying" });
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    })()
      .then((blob) => {
        const objectUrl = URL.createObjectURL(new Blob([blob], { type: "text/vtt" }));
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        upsert({ id, downloaded: blob.size, total: blob.size, percent: 100, status: "done" });
      })
      .catch((e: unknown) => upsert({ id, status: "failed", error: e instanceof Error ? e.message : "Download failed" }));
  };
  subtitleJobs.set(id, run);
  run();
}

let restored = false;
/** After a page refresh, bring back unfinished movie downloads and continue them. */
export async function restoreDownloads() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  const records = await listDownloadRecords().catch(() => []);
  for (const r of records) {
    if (r.status === "complete" || !r.url || !r.probeUrl) continue;
    const input: CatalogDownloadInput = {
      id: r.id, url: r.url, probeUrl: r.probeUrl, filename: r.filename, subjectId: r.subjectId,
      subjectName: r.subjectName, season: r.season, episode: r.episode, resourceId: r.resourceId,
      resolution: r.resolution, captions: r.captions,
    };
    inputs.set(r.id, input);
    const percent = r.size ? Math.round((r.bytesDownloaded / r.size) * 100) : 0;
    upsert({ id: r.id, kind: "movie", name: r.filename, downloaded: r.bytesDownloaded, total: r.size, percent, status: "paused" });
    if (r.status !== "paused") runMovie(input);
  }
  // Resume anything waiting as soon as the network comes back.
  window.addEventListener("online", () => {
    for (const i of items) if (i.status === "failed" && inputs.has(i.id)) runMovie(inputs.get(i.id)!);
  });
}
