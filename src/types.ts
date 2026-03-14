export interface SkillNode {
  name: string;
  category: string;
  subSkills: string[];
  relatedConcepts: string[];
  priority: "high" | "medium" | "low";
  description: string;
}

export interface Roadmap {
  id: string;
  markdown: string;
  skillTree?: SkillNode[];
  generatedAt: number;
}

export interface Source {
  id: string;
  type: "text" | "url" | "file";
  origin: "external" | "research";
  reference: string;
  snapshot: string;
  ingestedAt: number;
  language: string;
  roadmap: Roadmap | null;
  digestedSegmentIds: string[];
}

export interface Insight {
  id: string;
  content: string;
  sourceRef?: { sourceId: string; segment?: string };
  createdAt: number;
}

export interface ResearchTodo {
  id: string;
  topic: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  linkedSkillNode?: string;
  resultSourceId?: string;
  createdAt: number;
}

export type SkillStatus = "not_started" | "learning" | "mastered";

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  roadmap: Roadmap | null;
  sources: Source[];
  insights: Insight[];
  researchTodos: ResearchTodo[];
  skillProgress: Record<string, SkillStatus>;
}

export interface WorkspaceListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourceCount: number;
  generatedCount: number;
  skillCount: number;
  masteredCount: number;
}
