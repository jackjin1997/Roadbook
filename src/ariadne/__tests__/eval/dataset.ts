/**
 * Eval dataset — test cases + LangSmith dataset management.
 */

import { Client } from "langsmith";

export const DATASET_NAME = "Roadbook Quality Eval v2";

export const TEST_CASES = [
  // Standard cases — different input types
  {
    inputs: {
      input: "Frontend Engineer — React, TypeScript, GraphQL, performance optimization",
      language: "English",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "Python data science: pandas, numpy, scikit-learn, visualization",
      language: "English",
    },
    metadata: { category: "article", difficulty: "standard" },
  },
  {
    inputs: {
      input: "高级后端工程师 — Go, Redis, MySQL, Kubernetes 微服务架构",
      language: "Chinese (Simplified)",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "RAG (Retrieval-Augmented Generation)",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "standard" },
  },
  {
    inputs: {
      input: "DevOps Engineer: Docker, Kubernetes, CI/CD, Terraform, observability",
      language: "English",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  // Multi-language cases
  {
    inputs: {
      input: "フルスタックエンジニア — React, Node.js, AWS, TypeScript",
      language: "Japanese",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "Ingeniero de Machine Learning — PyTorch, TensorFlow, MLOps, feature engineering",
      language: "Spanish",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  // Edge cases
  {
    inputs: {
      input: "Machine Learning",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "broad" },
  },
  {
    inputs: {
      input: "Quantum Error Correction with Topological Codes using ZX-Calculus",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "niche" },
  },
  {
    inputs: {
      input: `Senior Backend Engineer
Requirements:
- 5+ years Go or Rust experience
- Distributed systems (Raft, Paxos, CRDTs)
- Database internals (B-trees, LSM trees, WAL)
- Observability (OpenTelemetry, Prometheus, Grafana)
- Container orchestration (Kubernetes, Istio)
- Event-driven architecture (Kafka, NATS)
- Performance profiling and optimization
- System design for 10M+ DAU scale`,
      language: "English",
    },
    metadata: { category: "jd", difficulty: "complex" },
  },
];

export async function ensureDataset(client: Client) {
  try {
    const existing = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`✓ Using existing dataset: "${DATASET_NAME}" (${existing.id})`);
    return existing;
  } catch {
    console.log(`Creating dataset: "${DATASET_NAME}"...`);
    const dataset = await client.createDataset(DATASET_NAME, {
      description: "Comprehensive test cases for Roadbook Markdown generation quality — standard, multi-language, edge cases",
    });
    await client.createExamples({
      datasetId: dataset.id,
      inputs: TEST_CASES.map((tc) => tc.inputs),
      metadata: TEST_CASES.map((tc) => tc.metadata),
    });
    console.log(`✓ Dataset created with ${TEST_CASES.length} examples`);
    return dataset;
  }
}
