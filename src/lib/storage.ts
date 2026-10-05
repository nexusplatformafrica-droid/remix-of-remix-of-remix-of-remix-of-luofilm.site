import { getFbAuth } from "./firebase";
import { uploadToR2, type UploadProgress } from "./r2-upload";

export type { UploadProgress };

export function formatBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Keeps long uploads alive when the screen dims or the tab is switched. */
async function keepAwake() {
  const guard = (e: BeforeUnloadEvent) => {
    e.preventDefault();
  };
  window.addEventListener("beforeunload", guard);

  type WakeLock = { release: () => Promise<void> };
  let lock: WakeLock | null = null;
  const request = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLock> } };
      lock = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      /* wake lock is optional */
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void request();
  };
  await request();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.removeEventListener("beforeunload", guard);
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
  };
}

/** Admin uploads go through this site's Worker and its bound R2 bucket. */
export async function uploadFile(
  folder: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  if (!getFbAuth().currentUser) throw new Error("You must be signed in to upload.");
  const release = await keepAwake();
  try {
    return await uploadToR2(`media/${folder}`, file, onProgress);
  } finally {
    release();
  }
}

/** Uploaded objects are served by the same site. */
export const fileUrl = (path: string) => path;
