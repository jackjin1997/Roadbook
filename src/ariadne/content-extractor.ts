/**
 * Content extraction utilities — URL fetching, file text extraction.
 * Extracted from server.ts for independent testability.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createRequire } from "module";
import mammoth from "mammoth";
import dns from "dns/promises";
import net from "net";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

// ── Constants ────────────────────────────────────────────────────────────────

const JINA_TIMEOUT_MS = 30_000;
const READABILITY_TIMEOUT_MS = 15_000;
const MIN_CONTENT_LENGTH = 200;

// ── SSRF guard ───────────────────────────────────────────────────────────────

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0 ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:") // IPv4-mapped — resolve separately
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  // If hostname is an IP literal, check directly
  const ipVer = net.isIP(host);
  if (ipVer === 4 && isPrivateIPv4(host)) throw new Error("Refusing to fetch private IP");
  if (ipVer === 6 && isPrivateIPv6(host)) throw new Error("Refusing to fetch private IP");
  if (ipVer !== 0) return parsed;
  // Hostname: resolve and block if any resolved address is private
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  for (const r of records) {
    if (r.family === 4 && isPrivateIPv4(r.address)) throw new Error(`Refusing to fetch private host (${r.address})`);
    if (r.family === 6 && isPrivateIPv6(r.address)) throw new Error(`Refusing to fetch private host (${r.address})`);
  }
  return parsed;
}

/** Job boards and SPAs that require a headless renderer to extract content */
const SPA_PATTERNS = [
  /zhipin\.com/,       // BOSS直聘
  /linkedin\.com/,     // LinkedIn
  /lagou\.com/,        // 拉勾
  /maimai\.cn/,        // 脉脉
  /liepin\.com/,       // 猎聘
  /51job\.com/,        // 前程无忧
  /zhaopin\.com/,      // 智联招聘
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function fetchViaJina(url: string): Promise<string> {
  // Jina Reader itself runs on a public IP, but its `/${url}` path forwards our
  // target URL — so we still need to gate the target against private networks.
  await assertPublicUrl(url);
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      "Accept": "text/plain",
      "User-Agent": "Mozilla/5.0 (compatible; Ariadne/1.0)",
    },
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Jina Reader failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("Could not extract content via Jina Reader");
  return text.replace(/\s+/g, " ").trim();
}

export async function fetchUrlSnapshot(url: string): Promise<string> {
  await assertPublicUrl(url);

  // Route known SPA / job-board URLs directly through Jina Reader
  if (SPA_PATTERNS.some((p) => p.test(url))) {
    return fetchViaJina(url);
  }

  // Standard fetch + Readability for regular pages
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Ariadne/1.0)" },
    signal: AbortSignal.timeout(READABILITY_TIMEOUT_MS),
    redirect: "manual",
  });
  // Block redirects — a 3xx Location header could point to an internal host
  if (res.status >= 300 && res.status < 400) {
    throw new Error("Refusing to follow redirect (SSRF guard)");
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  // Fallback to Jina if content is suspiciously thin (likely an SPA)
  if (text.length < MIN_CONTENT_LENGTH) {
    return fetchViaJina(url);
  }

  return text;
}

export async function extractFileText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  // Plain text
  if (mimeType === "text/plain" || filename.endsWith(".txt") || filename.endsWith(".md")) {
    return buffer.toString("utf-8").trim();
  }
  // PDF
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    if (!data.text.trim()) throw new Error("Could not extract text from PDF");
    return data.text.trim();
  }
  // DOCX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) throw new Error("Could not extract text from DOCX");
    return result.value.trim();
  }
  // Image → Claude OCR
  if (mimeType.startsWith("image/")) {
    const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001", maxTokens: 4096 });
    const b64 = buffer.toString("base64");
    const res = await model.invoke([
      new HumanMessage({
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
          { type: "text", text: "Extract all text from this image verbatim. Return only the extracted text, no commentary." },
        ],
      }),
    ]);
    return (res.content as string).trim();
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}
