/**
 * Shared utility: retry with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
