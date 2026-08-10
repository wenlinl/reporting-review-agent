import "server-only";
import { prisma } from "./db";

export type RubricItem = {
  key: string;
  name: string;
  description: string;
};

const DEFAULT_RUBRIC: RubricItem[] = [
  { key: "impact", name: "业务影响力", description: "项目对业务的价值与影响范围" },
  { key: "innovation", name: "创新性", description: "思路 / 方案的创新点" },
  { key: "progress", name: "落地情况与完成度", description: "当前进展、完成百分比、里程碑达成情况" },
  { key: "problems", name: "遇到的问题与解决方案", description: "过程中遇到的关键问题以及如何解决" },
  { key: "data", name: "数据支撑", description: "关键数据、指标、前后对比" },
  { key: "next", name: "下一步计划", description: "后续安排与可落地性" },
  { key: "structure", name: "表达与结构", description: "逻辑清晰度、重点突出程度（辅助维度）" },
];

export async function getRubric(): Promise<RubricItem[]> {
  const row = await prisma.setting.findUnique({ where: { key: "rubric" } });
  if (!row) return DEFAULT_RUBRIC;
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as RubricItem[];
  } catch {
    // fallthrough
  }
  return DEFAULT_RUBRIC;
}

export async function setRubric(items: RubricItem[]) {
  await prisma.setting.upsert({
    where: { key: "rubric" },
    update: { value: JSON.stringify(items) },
    create: { key: "rubric", value: JSON.stringify(items) },
  });
}
