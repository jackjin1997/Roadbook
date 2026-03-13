/**
 * LLM-as-Judge evaluators — semantic quality via LLM scoring.
 */

import type { EvaluatorT } from "langsmith/evaluation";
import {
  createLLMAsJudge,
  CONCISENESS_PROMPT,
  HALLUCINATION_PROMPT,
} from "openevals";
import { buildJudge, JudgeSchema, type EvalArgs } from "../config.js";

const judge = buildJudge();
const scoringJudge = judge.withStructuredOutput(JudgeSchema);

/** 9. Relevance — does the roadbook match the input topic? */
export const relevanceEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for topic relevance.

Input topic: "${topic}"

Roadbook (first 1500 chars):
${md.slice(0, 1500)}

Score 1.0 = covers the right domain and technologies
Score 0.5 = partially relevant, some drift
Score 0.0 = completely off-topic or empty`,
    },
  ]);

  return { key: "relevance", score: grade.score, comment: grade.reasoning };
};

/** 10. Completeness — does the roadbook cover the key skills implied by the input? */
export const completenessEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for content completeness.

Input topic: "${topic}"

Roadbook (first 2000 chars):
${md.slice(0, 2000)}

Does the roadbook address the key skills, tools, and concepts implied by the input?
Score 1.0 = comprehensive coverage
Score 0.5 = covers some areas but notable gaps
Score 0.0 = missing most expected content`,
    },
  ]);

  return { key: "completeness", score: grade.score, comment: grade.reasoning };
};

/** 11. Pedagogical quality — learning progression, prerequisite ordering, actionability. */
export const pedagogicalEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for PEDAGOGICAL quality.

Topic: "${topic}"
Content (first 3000 chars):
${md.slice(0, 3000)}

Consider:
- Does it sequence learning from foundational to advanced? (prerequisite ordering)
- Are there actionable milestones or checkpoints the learner can follow?
- Does it suggest concrete resources, projects, or exercises?
- Is the difficulty progression reasonable for the topic?
- Is the content structured to aid retention and understanding?

Score 1.0 = excellent learning design with clear progression
Score 0.5 = adequate but could be structured better
Score 0.0 = poor pedagogical design or random ordering`,
    },
  ]);

  return { key: "pedagogical_quality", score: grade.score, comment: grade.reasoning };
};

/** 12. Diagram-prose coherence — does the Mermaid diagram match the prose? */
export const diagramCoherenceEvaluator: EvaluatorT = async ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const mermaidBlock = md.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? "";
  const prosePreview = md.replace(/```mermaid[\s\S]*?```/g, "").slice(0, 2000);

  if (!mermaidBlock) {
    return { key: "diagram_coherence", score: 0, comment: "No Mermaid diagram found" };
  }

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Compare this Mermaid diagram against the prose sections of a learning roadbook.

Mermaid diagram:
${mermaidBlock.slice(0, 1500)}

Prose sections (first 2000 chars):
${prosePreview}

Do the skills/categories in the diagram match what's described in the prose?

Score 1.0 = diagram accurately reflects the learning path described in prose
Score 0.5 = partial alignment, some nodes missing or extra
Score 0.0 = diagram and prose describe completely different things`,
    },
  ]);

  return { key: "diagram_coherence", score: grade.score, comment: grade.reasoning };
};

/** 13. Conciseness — uses openevals prebuilt prompt. */
export const concisenessEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const evaluator = createLLMAsJudge({
    prompt: CONCISENESS_PROMPT,
    feedbackKey: "conciseness",
    judge,
    continuous: true,
    useReasoning: true,
  });

  const result = await evaluator({
    inputs: inputs?.input as string,
    outputs: ((outputs?.output as string) ?? "").slice(0, 3000),
  });

  return {
    key: "conciseness",
    score: typeof result.score === "number" ? result.score : (result.score ? 1 : 0),
    comment: (result.comment as string) ?? "",
  };
};

/** 14. Hallucination — uses openevals prebuilt prompt. */
export const hallucinationEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const evaluator = createLLMAsJudge({
    prompt: HALLUCINATION_PROMPT,
    feedbackKey: "hallucination_free",
    judge,
    continuous: true,
    useReasoning: true,
  });

  const result = await evaluator({
    inputs: inputs?.input as string,
    outputs: ((outputs?.output as string) ?? "").slice(0, 3000),
    context: `The user provided a topic/JD and the system generated a learning roadbook. The roadbook should recommend real technologies, tools, and resources that exist and are relevant to the input topic. It is acceptable to include widely-known related technologies not explicitly mentioned in the input.`,
  });

  return {
    key: "hallucination_free",
    score: typeof result.score === "number" ? result.score : (result.score ? 1 : 0),
    comment: (result.comment as string) ?? "",
  };
};
