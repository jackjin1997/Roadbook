import { getModel } from "../config.js";
import { SkillTreeOutputSchema } from "../types.js";
import type { RoadbookState } from "../types.js";

const SYSTEM_PROMPT = `你是 Ariadne，一个专业的技术技能树分析引擎。

你的任务是从用户输入的文本中提取一棵结构化的技能树。根据输入类型采取不同策略：

- **JD（职位描述）**：提取岗位要求的核心技能和加分项，按优先级排列
- **简历/项目经历**：识别涉及的技术栈，找出需要深入复习的知识点
- **技术文章**：提取文章核心概念和前置知识依赖
- **概念**：以该概念为中心，展开相关的知识图谱

对每个技能节点，你需要：
1. 给出清晰的分类（如：编程语言、框架、基础设施、设计模式、AI/ML 等）
2. 列出 2-5 个子技能
3. 列出 2-3 个相关概念
4. 判断学习优先级（high/medium/low）
5. 写一句简要说明

输出 6-15 个技能节点，覆盖输入内容的核心知识面。

必须以 JSON 格式输出，结构如下：
{
  "inputType": "jd" | "article" | "resume" | "concept",
  "title": "路书标题",
  "skillTree": [
    {
      "name": "技能名称",
      "category": "分类",
      "subSkills": ["子技能1", "子技能2"],
      "relatedConcepts": ["概念1", "概念2"],
      "priority": "high" | "medium" | "low",
      "description": "简要说明"
    }
  ]
}`;

export async function extractSkillTree(
  state: Pick<RoadbookState, "input" | "inputType">,
): Promise<Partial<RoadbookState>> {
  const model = getModel();
  const structured = model.withStructuredOutput(SkillTreeOutputSchema, {
    method: "jsonMode",
  });

  const result = await structured.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `输入类型：${state.inputType}\n\n---\n\n${state.input}`,
    },
  ]);

  return {
    inputType: result.inputType,
    title: result.title,
    skillTree: result.skillTree,
  };
}
