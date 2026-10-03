export type CatalogDownloadProgress = {
  downloaded: number;
  total: number;
  percent: number;
  status: "preparing" | "downloading" | "saving";
};

export type CatalogDownloadInput = {
  id: string;
  url: string;
  probeUrl: string;
  filename: string;
  subjectId: string;
  subjectName: string;
  season: number;
  episode: number;
  resourceId: string;
  resolution: number;
  captions: { label: string; url: string }[];
};

export type DownloadRecord = CatalogDownloadInput & {
  size: number;
  bytesDownloaded: number;
  status: "downloading" | "paused" | "complete" | "failed";
  updatedAt: number;
  errorCount: number;
  subtitleFiles: { label: string; text: string }[];
};

type StoredChunk = { key: string; downloadId: string; start: number; blob: Blob };

const DB_NAME = "luofilm-catalog-downloads";
const DB_VERSION = 1;
const CHUNK_SIZE = 4 * 1024 * 1024;
/** How many byte ranges download at the same time. */
const PARALLEL = 6;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage was stopped."));
  });
}

async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("records")) {
        database.createObjectStore("records", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("chunks")) {
        const chunks = database.createObjectStore("chunks", { keyPath: "key" });
        chunks.createIndex("downloadId", "downloadId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Download storage could not open."));
  });
}

async function readRecord(database: IDBDatabase, id: string) {
  const transaction = database.transaction("records", "readonly");
  return requestResult(transaction.objectStore("records").get(id)) as Promise<
    DownloadRecord | undefined
  >;
}

async function writeRecord(database: IDBDatabase, record: DownloadRecord) {
  const transaction = database.transaction("records", "readwrite");
  transaction.objectStore("records").put(record);
  await transactionDone(transaction);
}

async function writeChunk(database: IDBDatabase, chunk: StoredChunk) {
  const transaction = database.transaction("chunks", "readwrite");
  transaction.objectStore("chunks").put(chunk);
  await transactionDone(transaction);
}

async function readChunks(database: IDBDatabase, id: string) {
  const transaction = database.transaction("chunks", "readonly");
  const chunks = (await requestResult(
    transaction.objectStore("chunks").index("downloadId").getAll(id),
  )) as StoredChunk[];
  return chunks.sort((a, b) => a.start - b.start);
}

async function clearChunks(database: IDBDatabase, id: string) {
  const transaction = database.transaction("chunks", "readwrite");
  const store = transaction.objectStore("chunks");
  const keys = await requestResult(store.index("downloadId").getAllKeys(id));
  for (const key of keys) store.delete(key);
  await transactionDone(transaction);
}

function parseContentRange(value: string | null) {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

async function fetchSubtitles(captions: CatalogDownloadInput["captions"]) {
  const files: DownloadRecord["subtitleFiles"] = [];
  for (const caption of captions) {
    try {
      const response = await fetch(caption.url, { credentials: "include" });
      if (response.ok) files.push({ label: caption.label, text: await response.text() });
    } catch {
      // A subtitle failure must not invalidate a verified movie file.
    }
  }
  return files;
}

export class DownloadAborted extends Error {}

/** In-page range fetching is blocked (e.g. the host redirected to a CDN without CORS). */
export class NeedsNativeDownload extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(t);
      reject(new DownloadAborted("paused"));
    }, { once: true });
  });

/** Wait until the browser is back online (network lost). */
async function waitOnline(signal?: AbortSignal) {
  while (!navigator.onLine) await sleep(2000, signal);
}

/** Retry transient failures (network lost, server hiccup, expired link) with backoff. */
async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, onWait?: () => void): Promise<T> {
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) throw new DownloadAborted("paused");
    try {
      await waitOnline(signal);
      return await fn();
    } catch (error) {
      if (signal?.aborted || error instanceof DownloadAborted) throw new DownloadAborted("paused");
      if (error instanceof NeedsNativeDownload) throw error;
      attempt += 1;
      if (attempt > 30) throw error;
      onWait?.();
      await sleep(Math.min(30_000, 1500 * attempt), signal);
    }
  }
}

export async function listDownloadRecords() {
  const database = await openDatabase();
  const tx = database.transaction("records", "readonly");
  const all = (await requestResult(tx.objectStore("records").getAll())) as DownloadRecord[];
  database.close();
  return all;
}

export async function deleteDownloadRecord(id: string) {
  const database = await openDatabase();
  await clearChunks(database, id);
  const tx = database.transaction("records", "readwrite");
  tx.objectStore("records").delete(id);
  await transactionDone(tx);
  database.close();
}

export async function setDownloadStatus(id: string, status: DownloadRecord["status"]) {
  const database = await openDatabase();
  const record = await readRecord(database, id);
  if (record) await writeRecord(database, { ...record, status, updatedAt: Date.now() });
  database.close();
}

export async function downloadCatalogFile(
  input: CatalogDownloadInput,
  onProgress: (progress: CatalogDownloadProgress) => void,
  signal?: AbortSignal,
  onRetrying?: () => void,
) {
  const database = await openDatabase();
  const existing = await readRecord(database, input.id);
  onProgress({
    downloaded: existing?.bytesDownloaded ?? 0,
    total: existing?.size ?? 0,
    percent: existing?.size ? Math.round(((existing.bytesDownloaded ?? 0) / existing.size) * 100) : 0,
    status: "preparing",
  });
  const total = await withRetry(async () => {
    const probe = await fetch(input.probeUrl, { credentials: "include", signal: signal ?? null });
    if (!probe.ok) throw new Error("The full movie size could not be verified.");
    const probeData = (await probe.json()) as { size?: number };
    const size = Number(probeData.size) || 0;
    if (size <= 0) throw new Error("The full movie size is unavailable.");
    return size;
  }, signal, onRetrying);

  if (existing && existing.size !== total) await clearChunks(database, input.id);
  // Work out exactly which chunks are already stored, so resume never re-downloads them.
  const stored = existing?.size === total ? await readChunks(database, input.id) : [];
  const done = new Set<number>();
  let downloaded = 0;
  for (const c of stored) {
    const expected = Math.min(CHUNK_SIZE, total - c.start);
    if (c.start % CHUNK_SIZE === 0 && c.blob.size === expected && !done.has(c.start)) {
      done.add(c.start);
      downloaded += c.blob.size;
    }
  }

  let record: DownloadRecord = {
    id: input.id,
    url: input.url,
    probeUrl: input.probeUrl,
    filename: input.filename,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    season: input.season,
    episode: input.episode,
    resourceId: input.resourceId,
    resolution: input.resolution,
    captions: input.captions,
    size: total,
    bytesDownloaded: downloaded,
    status: "downloading",
    updatedAt: Date.now(),
    errorCount: existing?.errorCount ?? 0,
    subtitleFiles: existing?.subtitleFiles ?? [],
  };
  await writeRecord(database, record);

  try {
    const pending: number[] = [];
    for (let s = 0; s < total; s += CHUNK_SIZE) if (!done.has(s)) pending.push(s);
    // Live progress also counts bytes still arriving inside in-flight chunks.
    const inflight = new Map<number, number>();
    let lastEmit = 0;
    const emitProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < 250) return;
      lastEmit = now;
      let live = downloaded;
      for (const v of inflight.values()) live += v;
      onProgress({
        downloaded: Math.min(live, total),
        total,
        percent: Math.min(100, Math.round((live / total) * 100)),
        status: "downloading",
      });
    };
    emitProgress(true);

    const fetchChunk = (start: number) => {
      const end = Math.min(start + CHUNK_SIZE - 1, total - 1);
      // Each range request re-resolves a fresh signed URL on the server,
      // so an expired link is refreshed automatically on retry.
      return withRetry(async () => {
        inflight.set(start, 0);
        let response: Response;
        try {
          response = await fetch(input.url, {
            credentials: "include",
            signal: signal ?? null,
            headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" },
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          if (navigator.onLine && downloaded === 0) throw new NeedsNativeDownload("blocked");
          throw error;
        }
        if (response.status !== 206 && downloaded === 0 && (response.type === "opaqueredirect" || response.redirected || response.status >= 500)) {
          throw new NeedsNativeDownload("blocked");
        }
        if (response.status !== 206) {
          throw new Error(`The movie server did not accept resume range ${start}-${end}.`);
        }
        const range = parseContentRange(response.headers.get("content-range"));
        if (!range || range.start !== start || range.end !== end || range.total !== total) {
          throw new Error("The movie server returned an invalid byte range.");
        }
        const parts: Uint8Array[] = [];
        let got = 0;
        const reader = response.body!.getReader();
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          parts.push(value);
          got += value.byteLength;
          inflight.set(start, got);
          emitProgress();
        }
        const b = new Blob(parts as BlobPart[]);
        if (b.size !== end - start + 1) throw new Error("A downloaded movie range was incomplete.");
        return b;
      }, signal, onRetrying).finally(() => inflight.delete(start));
    };

    // Several ranges download at the same time — much faster than one by one.
    const worker = async () => {
      for (;;) {
        const start = pending.shift();
        if (start === undefined) return;
        const blob = await fetchChunk(start);
        await writeChunk(database, { key: `${input.id}:${start}`, downloadId: input.id, start, blob });
        downloaded += blob.size;
        record = { ...record, bytesDownloaded: downloaded, updatedAt: Date.now() };
        await writeRecord(database, record);
        emitProgress(true);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    onProgress({ downloaded, total, percent: 100, status: "saving" });
    const seen = new Set<number>();
    const chunks = (await readChunks(database, input.id)).filter((c) => {
      const ok = c.start % CHUNK_SIZE === 0 && c.blob.size === Math.min(CHUNK_SIZE, total - c.start) && !seen.has(c.start);
      if (ok) seen.add(c.start);
      return ok;
    });
    const assembledSize = chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0);
    if (assembledSize !== total) throw new Error("The completed movie size did not match.");
    record = {
      ...record,
      status: "complete",
      subtitleFiles: await fetchSubtitles(input.captions),
      updatedAt: Date.now(),
    };
    await writeRecord(database, record);

    const objectUrl = URL.createObjectURL(new Blob(chunks.map((chunk) => chunk.blob), { type: "video/mp4" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = input.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      void clearChunks(database, input.id).finally(() => database.close());
    }, 60_000);
    return { total, resumed: (existing?.bytesDownloaded ?? 0) > 0 };
  } catch (error) {
    const paused = error instanceof DownloadAborted || signal?.aborted;
    record = {
      ...record,
      status: paused ? "paused" : "failed",
      errorCount: record.errorCount + 1,
      updatedAt: Date.now(),
    };
    await writeRecord(database, record).catch(() => undefined);
    database.close();
    throw paused ? new DownloadAborted("paused") : error;
  }
}