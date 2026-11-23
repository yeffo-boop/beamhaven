/**
 * The record doesn't exist, or belongs to another household. Both look the
 * same on purpose, so nobody learns what exists elsewhere (pages answer 404).
 */
export class NotFoundError extends Error {
  constructor(what = "record") {
    super(`Not found: ${what}`);
  }
}
