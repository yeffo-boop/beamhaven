import { notFound } from "next/navigation";

import { NotFoundError } from "@/server/services/errors";

/** Awaits a lookup, and answers 404 if the record isn't in this household. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
