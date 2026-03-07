import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isTracingEnabled, getTracingStatus } from "../tracing.js";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

beforeEach(() => {
  delete process.env.LANGSMITH_TRACING;
  delete process.env.LANGSMITH_API_KEY;
  delete process.env.LANGSMITH_PROJECT;
});

afterEach(() => {
  // restore original env
  for (const key of ["LANGSMITH_TRACING", "LANGSMITH_API_KEY", "LANGSMITH_PROJECT"]) {
    if (ORIGINAL_ENV[key] !== undefined) {
      process.env[key] = ORIGINAL_ENV[key];
    } else {
      delete process.env[key];
    }
  }
});

describe("isTracingEnabled", () => {
  it("returns false when no env vars set", () => {
    expect(isTracingEnabled()).toBe(false);
  });

  it("returns false when only LANGSMITH_API_KEY is set", () => {
    setEnv({ LANGSMITH_API_KEY: "ls-test-key" });
    expect(isTracingEnabled()).toBe(false);
  });

  it("returns false when only LANGSMITH_TRACING=true without API key", () => {
    setEnv({ LANGSMITH_TRACING: "true" });
    expect(isTracingEnabled()).toBe(false);
  });

  it("returns true when both LANGSMITH_TRACING=true and API key are set", () => {
    setEnv({ LANGSMITH_TRACING: "true", LANGSMITH_API_KEY: "ls-test-key" });
    expect(isTracingEnabled()).toBe(true);
  });

  it("returns false when LANGSMITH_TRACING is not exactly 'true'", () => {
    setEnv({ LANGSMITH_TRACING: "1", LANGSMITH_API_KEY: "ls-test-key" });
    expect(isTracingEnabled()).toBe(false);
  });
});

describe("getTracingStatus", () => {
  it("returns disabled status with defaults when no env vars", () => {
    const status = getTracingStatus();
    expect(status.enabled).toBe(false);
    expect(status.hasApiKey).toBe(false);
    expect(status.project).toBe("default");
  });

  it("reflects custom project name", () => {
    setEnv({ LANGSMITH_PROJECT: "roadbook" });
    const status = getTracingStatus();
    expect(status.project).toBe("roadbook");
  });

  it("reports hasApiKey=true when API key is set", () => {
    setEnv({ LANGSMITH_API_KEY: "ls-key-123" });
    const status = getTracingStatus();
    expect(status.hasApiKey).toBe(true);
    expect(status.enabled).toBe(false);
  });

  it("reports fully enabled status", () => {
    setEnv({
      LANGSMITH_TRACING: "true",
      LANGSMITH_API_KEY: "ls-key-456",
      LANGSMITH_PROJECT: "my-project",
    });
    const status = getTracingStatus();
    expect(status.enabled).toBe(true);
    expect(status.hasApiKey).toBe(true);
    expect(status.project).toBe("my-project");
  });
});
