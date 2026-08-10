import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_RUBRIC = [
  {
    key: "impact",
    name: "业务影响力",
    description: "项目对业务的价值与影响范围",
  },
  {
    key: "innovation",
    name: "创新性",
    description: "思路 / 方案的创新点",
  },
  {
    key: "progress",
    name: "落地情况与完成度",
    description: "当前进展、完成百分比、里程碑达成情况",
  },
  {
    key: "problems",
    name: "遇到的问题与解决方案",
    description: "过程中遇到的关键问题以及如何解决",
  },
  {
    key: "data",
    name: "数据支撑",
    description: "关键数据、指标、前后对比",
  },
  {
    key: "next",
    name: "下一步计划",
    description: "后续安排与可落地性",
  },
  {
    key: "structure",
    name: "表达与结构",
    description: "逻辑清晰度、重点突出程度（辅助维度）",
  },
];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const name = process.env.SEED_ADMIN_NAME || "管理员";

  const hash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name,
      email,
      passwordHash: hash,
      role: "admin",
    },
  });

  const rubric = await prisma.setting.upsert({
    where: { key: "rubric" },
    update: {},
    create: {
      key: "rubric",
      value: JSON.stringify(DEFAULT_RUBRIC),
    },
  });

  console.log(`管理员就绪: ${admin.email} (${admin.role})`);
  console.log(`评审维度已初始化: ${JSON.parse(rubric.value).length} 项`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
