import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRubric } from "@/lib/settings";
import { chatJson } from "@/lib/ai";
import { reviewSystem, reviewUser } from "@/lib/prompts";

type ReviewItem = {
  dimension: string;
  score?: number;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
};
type ReviewResult = { overall: string; overallScore?: number; items: ReviewItem[] };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const presentation = await prisma.presentation.findUnique({ where: { id } });
  if (!presentation) return NextResponse.json({ error: "汇报不存在" }, { status: 404 });
  if (session.role !== "admin" && presentation.userId !== session.id) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (!presentation.pptText) {
    return NextResponse.json(
      { error: "尚未上传 PPT 或未能提取内容，请先上传" },
      { status: 400 },
    );
  }

  let result: ReviewResult;
  try {
    const rubric = await getRubric();
    result = await chatJson<ReviewResult>(
      reviewSystem(rubric),
      reviewUser(presentation.title, presentation.goal, presentation.pptText),
      { temperature: 0.3, maxTokens: 4000 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败，请稍后重试" },
      { status: 502 },
    );
  }

  const items = Array.isArray(result.items) ? result.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "AI 返回结果异常，请重试" }, { status: 502 });
  }

  const review = await prisma.review.create({
    data: {
      presentationId: id,
      content: JSON.stringify({
        overall: result.overall || "",
        overallScore:
          typeof result.overallScore === "number" ? result.overallScore : null,
        items,
      }),
      sourcePptName: presentation.pptName,
    },
  });

  await prisma.presentation.update({
    where: { id },
    data: { status: "reviewed" },
  });

  return NextResponse.json({ review });
}
