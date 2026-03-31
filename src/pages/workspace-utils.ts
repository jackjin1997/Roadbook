import JSZip from "jszip";
import { marked } from "marked";
import type { SkillNode } from "../types";

export function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_");
}

export function downloadMarkdown(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(filename) + ".md";
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadObsidianVault(title: string, markdown: string, skillTree?: SkillNode[]) {
  const zip = new JSZip();
  const safeName = (s: string) => s.replace(/[/\\:*?"<>|]/g, "_");

  // Main index file
  zip.file(`${safeName(title)}.md`, markdown);

  // One file per skill node with wikilinks
  if (skillTree?.length) {
    for (const node of skillTree) {
      const lines: string[] = [];
      lines.push(`# ${node.name}`);
      lines.push("");
      lines.push(`**Category:** ${node.category}  `);
      lines.push(`**Priority:** ${node.priority}`);
      lines.push("");
      if (node.description) {
        lines.push(node.description);
        lines.push("");
      }
      if (node.subSkills.length) {
        lines.push("## Sub-skills");
        for (const s of node.subSkills) lines.push(`- ${s}`);
        lines.push("");
      }
      if (node.relatedConcepts.length) {
        lines.push("## Related");
        const nodeNames = new Set(skillTree.map((n) => n.name));
        for (const r of node.relatedConcepts) {
          lines.push(`- ${nodeNames.has(r) ? `[[${r}]]` : r}`);
        }
        lines.push("");
      }
      lines.push(`---`);
      lines.push(`Back to [[${safeName(title)}]]`);
      zip.file(`${safeName(node.name)}.md`, lines.join("\n"));
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(title) + "_vault.zip";
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(markdown: string, filename: string) {
  const html2pdf = (await import("html2pdf.js")).default;
  const htmlContent = await marked.parse(markdown);
  const container = document.createElement("div");
  container.innerHTML = htmlContent;
  container.style.cssText = "padding:40px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1a1a1a;line-height:1.7;max-width:700px";
  // Style headings and code blocks for print
  container.querySelectorAll("h1,h2,h3").forEach((el) => {
    (el as HTMLElement).style.cssText = "margin-top:1.5em;margin-bottom:0.5em;font-weight:700";
  });
  container.querySelectorAll("code").forEach((el) => {
    (el as HTMLElement).style.cssText = "font-family:'JetBrains Mono',monospace;font-size:0.9em;background:#f4f4f4;padding:1px 4px;border-radius:3px";
  });
  container.querySelectorAll("pre").forEach((el) => {
    (el as HTMLElement).style.cssText = "background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto";
  });
  const safeName = sanitizeFilename(filename);
  await html2pdf().from(container).set({
    margin: [10, 10, 10, 10],
    filename: safeName + ".pdf",
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  }).save();
}

export function parseMarkdownSections(md: string): { id: string; heading: string; content: string; level: number }[] {
  const lines = md.split("\n");
  const sections: { id: string; heading: string; content: string; level: number }[] = [];
  let current: { heading: string; lines: string[]; level: number } | null = null;

  for (const line of lines) {
    const h2 = line.startsWith("## ") && !line.startsWith("### ");
    const h3 = line.startsWith("### ");
    if (h2 || h3) {
      if (current) sections.push({ id: current.heading, heading: current.heading, content: current.lines.join("\n").trim(), level: current.level });
      const level = h3 ? 3 : 2;
      const heading = line.replace(/^#{2,3}\s+/, "").trim();
      current = { heading, lines: [line], level };
    } else {
      current?.lines.push(line);
    }
  }
  if (current) sections.push({ id: current.heading, heading: current.heading, content: current.lines.join("\n").trim(), level: current.level });
  return sections;
}
