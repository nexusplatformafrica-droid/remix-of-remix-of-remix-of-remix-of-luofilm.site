import { getFbAuth } from "./firebase";

export type UploadProgress = { loaded: number; total: number; percent: number };
const PART_SIZE = 16 * 1024 * 1024;
const MAX_RETRIES = 5;

async function request(action: string, body: BodyInit, headers: Record<string, string> = {}, method = "POST") {
  const user = getFbAuth().currentUser;
  if (!user) throw new Error("You must be signed in to upload.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/public/admin-upload?action=${action}`, {
    method, body, headers: { ...headers, Authorization: `Bearer ${token}` },
  });
  const payload = await response.json() as { error?: string; url?: string; key?: string; uploadId?: string; etag?: string };
  if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status})`);
  return payload;
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (attempt >= MAX_RETRIES || /unauthor|binding|invalid/i.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

export async function uploadToR2(folder: string, file: File, onProgress?: (p: UploadProgress) => void): Promise<string> {
  if (folder !== "media/admin") throw new Error("Invalid upload location");
  const report = (loaded: number) => onProgress?.({ loaded, total: file.size, percent: Math.round(100 * loaded / Math.max(1, file.size)) });
  if (file.size <= PART_SIZE) {
    const params = new URLSearchParams({ action: "single", filename: file.name });
    const user = getFbAuth().currentUser;
    if (!user) throw new Error("You must be signed in to upload.");
    const payload = await retry(async () => {
      const response = await fetch(`/api/public/admin-upload?${params}`, {
        method: "POST", body: file,
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": file.type || "application/octet-stream" },
      });
      const data = await response.json() as { error?: string; url?: string };
      if (!response.ok || !data.url) throw new Error(data.error || `Upload failed (${response.status})`);
      return data;
    });
    report(file.size);
    return payload.url ?? "";
  }
  const created = await request("create", JSON.stringify({ filename: file.name, contentType: file.type }), { "Content-Type": "application/json" });
  if (!created.key || !created.uploadId || !created.url) throw new Error("Could not start upload");
  const parts: { partNumber: number; etag: string }[] = [];
  let loaded = 0;
  try {
    for (let offset = 0, partNumber = 1; offset < file.size; offset += PART_SIZE, partNumber++) {
      const blob = file.slice(offset, Math.min(offset + PART_SIZE, file.size));
      const params = new URLSearchParams({ key: created.key, uploadId: created.uploadId, part: String(partNumber) });
      const result = await retry(async () => {
        const user = getFbAuth().currentUser;
        if (!user) throw new Error("You must be signed in to upload.");
        const response = await fetch(`/api/public/admin-upload?${params}`, {
          method: "PUT", body: blob, headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        const payload = await response.json() as { etag?: string; error?: string };
        if (!response.ok || !payload.etag) throw new Error(payload.error || `Part ${partNumber} failed`);
        return payload;
      });
      parts.push({ partNumber, etag: result.etag ?? "" });
      loaded += blob.size;
      report(loaded);
    }
    await request("complete", JSON.stringify({ key: created.key, uploadId: created.uploadId, parts }), { "Content-Type": "application/json" });
    return created.url;
  } catch (error) {
    void request("abort", JSON.stringify({ key: created.key, uploadId: created.uploadId }), { "Content-Type": "application/json" }).catch(() => {});
    throw error;
  }
}