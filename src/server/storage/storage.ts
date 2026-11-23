import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/config/env";

/**
 * Where uploaded files' bytes live (ADR-012). The app only ever talks to
 * this interface, so S3-compatible storage can be added later without
 * touching anything else.
 */
export interface StorageProvider {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

/** Keys look like "<household id>/<64 random hex>": never built from a file name. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[a-f0-9]{64}$/;

export function newStorageKey(workspaceId: string): string {
  return `${workspaceId}/${randomBytes(32).toString("hex")}`;
}

function assertKey(key: string): void {
  // Also rules out "..", "/" at the start and anything else surprising.
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
}

/** Files on the server's disk (the uploads Docker volume in production). */
export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertKey(key);
    return path.join(path.resolve(this.root), key);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    // Write to a temporary name, then rename, so a half-written file is never served.
    const temporary = `${target}.partial`;
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** For tests: whether the bytes are on disk. */
  async exists(key: string): Promise<boolean> {
    return stat(this.pathFor(key)).then(
      () => true,
      () => false,
    );
  }
}

let storage: LocalDiskStorage | undefined;

export function getStorage(): LocalDiskStorage {
  storage ??= new LocalDiskStorage(getEnv().STORAGE_LOCAL_PATH);
  return storage;
}
