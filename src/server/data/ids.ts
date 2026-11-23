import { randomUUID } from "node:crypto";

/** A new random record id (32 hex characters, unguessable). */
export function newId(): string {
  return randomUUID().replaceAll("-", "");
}
