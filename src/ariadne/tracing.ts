/**
 * LangSmith tracing configuration.
 *
 * For LangGraph.js, tracing is automatic when these env vars are set:
 *   LANGSMITH_TRACING=true
 *   LANGSMITH_API_KEY=<key>
 *   LANGSMITH_PROJECT=roadbook  (optional, defaults to "default")
 *
 * This module provides helpers for verifying and logging tracing status.
 */

export function isTracingEnabled(): boolean {
  try {
    return process.env.LANGSMITH_TRACING === "true" && !!process.env.LANGSMITH_API_KEY;
  } catch {
    return false;
  }
}

export function getTracingStatus(): {
  enabled: boolean;
  project: string;
  hasApiKey: boolean;
} {
  let hasApiKey = false;
  let project = "default";

  try {
    hasApiKey = !!process.env.LANGSMITH_API_KEY;
    project = process.env.LANGSMITH_PROJECT || "default";
  } catch {
    // browser without process.env polyfill
  }

  return {
    enabled: isTracingEnabled(),
    project,
    hasApiKey,
  };
}

export function logTracingStatus(): void {
  const status = getTracingStatus();
  if (status.enabled) {
    console.log(`🔍 LangSmith tracing enabled → project: ${status.project}`);
  } else if (status.hasApiKey) {
    console.log("⚠️  LangSmith API key set but LANGSMITH_TRACING !== 'true'");
  } else {
    console.log("ℹ️  LangSmith tracing disabled (no API key)");
  }
}
