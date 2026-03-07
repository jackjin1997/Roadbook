import { z } from "zod";

export const InputType = z.enum(["jd", "article", "resume", "concept"]);
export type InputType = z.infer<typeof InputType>;

export const SkillNodeSchema = z.object({
  name: z.string().describe("技能名称"),
  category: z.string().describe("所属类别（如：语言、框架、基础设施、概念）"),
  subSkills: z.array(z.string()).describe("子技能列表"),
  relatedConcepts: z.array(z.string()).describe("相关概念"),
  priority: z.enum(["high", "medium", "low"]).describe("学习优先级"),
  description: z.string().describe("简要说明（1-2句话）"),
});

export type SkillNode = z.infer<typeof SkillNodeSchema>;

export const SkillTreeOutputSchema = z.object({
  inputType: InputType.describe("识别出的输入类型"),
  title: z.string().describe("路书标题"),
  skillTree: z.array(SkillNodeSchema).describe("提取的技能树"),
});

export type SkillTreeOutput = z.infer<typeof SkillTreeOutputSchema>;

export interface ResourceLink {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchResult {
  skillName: string;
  resources: ResourceLink[];
}

export interface RoadbookState {
  input: string;
  inputType: InputType;
  title: string;
  skillTree: SkillNode[];
  researchResults: ResearchResult[];
  roadbookMarkdown: string;
}
