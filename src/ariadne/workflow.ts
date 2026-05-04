import { roadbookGraph, journeyGraph } from "./graph.js";
import type { SkillNode, ProgressCallback } from "./types.js";

export interface ModelOverride {
  provider: string;
  modelName: string;
}

export interface GenerationOutput {
  markdown: string;
  skillTree: SkillNode[];
  failedSkills: string[];
}

export interface GenerationOptions {
  onProgress?: ProgressCallback;
  modelOverride?: ModelOverride;
  signal?: AbortSignal;
  /** Wall-clock budget for the whole graph invocation. Default 180s. */
  timeoutMs?: number;
}

const DEFAULT_WORKFLOW_TIMEOUT_MS = 180_000;

function withTimeoutAndSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Workflow timed out after ${timeoutMs}ms`)), timeoutMs);
    const onAbort = () => { clearTimeout(timer); reject(new Error("Workflow aborted")); };
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); reject(new Error("Workflow aborted")); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    promise.then(
      (v) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

export async function generateRoadbook(
  input: string,
  language = "English",
  onProgressOrOpts?: ProgressCallback | GenerationOptions,
  modelOverride?: ModelOverride,
): Promise<GenerationOutput> {
  const opts: GenerationOptions = typeof onProgressOrOpts === "function"
    ? { onProgress: onProgressOrOpts, modelOverride }
    : { ...(onProgressOrOpts ?? {}), modelOverride: onProgressOrOpts?.modelOverride ?? modelOverride };

  const invocation = roadbookGraph.invoke(
    { input, language, onProgress: opts.onProgress, modelOverride: opts.modelOverride },
    opts.signal ? { signal: opts.signal } : undefined,
  );
  const finalState = await withTimeoutAndSignal(invocation, opts.signal, opts.timeoutMs ?? DEFAULT_WORKFLOW_TIMEOUT_MS);

  return {
    markdown: finalState.roadbookMarkdown,
    skillTree: finalState.skillTree,
    failedSkills: finalState.failedSkills,
  };
}

/**
 * Generate a journey roadmap by merging skill trees from multiple snapshots.
 * Each snapshot is processed in parallel through extractSkillTree,
 * then merged and passed through research + generate.
 */
export async function generateJourneyRoadbook(
  snapshots: { text: string; language: string }[],
  onProgressOrOpts?: ProgressCallback | GenerationOptions,
  modelOverride?: ModelOverride,
): Promise<GenerationOutput> {
  if (snapshots.length === 0) throw new Error("No snapshots provided");

  const opts: GenerationOptions = typeof onProgressOrOpts === "function"
    ? { onProgress: onProgressOrOpts, modelOverride }
    : { ...(onProgressOrOpts ?? {}), modelOverride: onProgressOrOpts?.modelOverride ?? modelOverride };

  const invocation = journeyGraph.invoke(
    { snapshots, language: snapshots[0].language, onProgress: opts.onProgress, modelOverride: opts.modelOverride },
    opts.signal ? { signal: opts.signal } : undefined,
  );
  const finalState = await withTimeoutAndSignal(invocation, opts.signal, opts.timeoutMs ?? DEFAULT_WORKFLOW_TIMEOUT_MS);

  return {
    markdown: finalState.roadbookMarkdown,
    skillTree: finalState.skillTree,
    failedSkills: finalState.failedSkills,
  };
}
