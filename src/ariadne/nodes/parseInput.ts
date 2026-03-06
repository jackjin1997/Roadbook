import type { RoadbookState } from "../types.js";
import type { InputType } from "../types.js";

const JD_SIGNALS = [
  "职位", "岗位", "job", "responsibilities", "requirements",
  "qualifications", "years of experience", "工作经验", "薪资",
  "salary", "full-time", "全职", "兼职", "remote",
];

const RESUME_SIGNALS = [
  "简历", "resume", "工作经历", "项目经验", "education",
  "负责", "参与", "主导", "优化了", "实现了",
];

function classifyInput(text: string): InputType {
  const lower = text.toLowerCase();
  const jdScore = JD_SIGNALS.filter((s) => lower.includes(s)).length;
  const resumeScore = RESUME_SIGNALS.filter((s) => lower.includes(s)).length;

  if (jdScore >= 3) return "jd";
  if (resumeScore >= 3) return "resume";

  const wordCount = text.split(/\s+/).length;
  if (wordCount <= 20) return "concept";

  return "article";
}

export function parseInput(
  state: Pick<RoadbookState, "input">,
): Partial<RoadbookState> {
  const inputType = classifyInput(state.input);
  return { inputType };
}
