import type { RoadbookState, SkillNode } from "../types.js";

function buildMermaidMindmap(title: string, skills: SkillNode[]): string {
  const lines: string[] = ["```mermaid", "mindmap", `  root((${title}))`];

  const grouped = new Map<string, SkillNode[]>();
  for (const skill of skills) {
    const list = grouped.get(skill.category) ?? [];
    list.push(skill);
    grouped.set(skill.category, list);
  }

  for (const [category, nodes] of grouped) {
    lines.push(`    ${category}`);
    for (const node of nodes) {
      const badge = node.priority === "high" ? "🔴" : node.priority === "medium" ? "🟡" : "🟢";
      lines.push(`      ${badge} ${node.name}`);
      for (const sub of node.subSkills.slice(0, 3)) {
        lines.push(`        ${sub}`);
      }
    }
  }

  lines.push("```");
  return lines.join("\n");
}

function buildSkillSection(skill: SkillNode, index: number): string {
  const badge = skill.priority === "high" ? "🔴 高优先级"
    : skill.priority === "medium" ? "🟡 中优先级"
    : "🟢 低优先级";

  const lines = [
    `### ${index + 1}. ${skill.name}`,
    "",
    `> ${badge} | 分类：${skill.category}`,
    "",
    skill.description,
    "",
    "**子技能：**",
    ...skill.subSkills.map((s) => `- ${s}`),
    "",
    "**相关概念：**",
    ...skill.relatedConcepts.map((c) => `- ${c}`),
    "",
  ];

  return lines.join("\n");
}

export function generateRoadbookMarkdown(
  state: Pick<RoadbookState, "title" | "skillTree">,
): Partial<RoadbookState> {
  const { title, skillTree } = state;

  const sorted = [...skillTree].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  const sections = [
    `# ${title}`,
    "",
    `> 由 Ariadne 引擎自动生成 | ${new Date().toLocaleDateString("zh-CN")}`,
    "",
    "---",
    "",
    "## 技能图谱",
    "",
    buildMermaidMindmap(title, sorted),
    "",
    "---",
    "",
    "## 学习路径",
    "",
    `共 ${sorted.length} 个技能节点，按优先级排列：`,
    "",
    ...sorted.map((s, i) => buildSkillSection(s, i)),
    "---",
    "",
    "*本路书由 [Roadbook](https://github.com/jackjin1997/Roadbook) 生成*",
  ];

  return { roadbookMarkdown: sections.join("\n") };
}
