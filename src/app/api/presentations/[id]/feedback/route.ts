import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { chatJson } from "@/lib/ai";
import { feedbackSystem, feedbackUser, historySummaryForUser } from "@/lib/prompts";

type FeedbackResult = {
  overall: string;
  overallScore?: number;
  highlights?: string[];
  improvements?: string[];
  history?: string;
};

/** 截断到 max 字，并尽量落在句子边界上 */
function capText(text: string, max: number): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const m = cut.match(/^[\s\S]*[。！？；，,.、]/);
  return m ? m[0].replace(/[，,、。；;：:]+$/, "。") : cut;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const presentation = await prisma.presentation.findUnique({
    where: { id },
    include: {
      user: { select: { name: true } },
      recordings: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!presentation) return NextResponse.json({ error: "汇报不存在" }, { status: 404 });
  if (session.role !== "admin" && presentation.userId !== session.id) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (!presentation.pptText && !presentation.recordings.some((r) => r.transcript)) {
    return NextResponse.json(
      { error: "需要至少上传 PPT 或完成一次录音转写，才能生成反馈" },
      { status: 400 },
    );
  }

  const transcript = presentation.recordings.find((r) => r.transcript)?.transcript || null;

  // 个人历史记忆：该用户此前其他汇报的标题与历史反馈
  const historyRows = await prisma.presentation.findMany({
    where: { userId: presentation.userId, id: { not: id } },
    select: {
      title: true,
      pptText: true,
      feedback: { select: { content: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const history = historySummaryForUser(presentation.user.name, historyRows);

  let result: FeedbackResult;
  try {
    result = await chatJson<FeedbackResult>(
      feedbackSystem(),
      feedbackUser(
        presentation.title,
        presentation.user.name,
        presentation.pptText,
        transcript,
        history,
      ),
      { temperature: 0.4, maxTokens: 3000 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败，请稍后重试" },
      { status: 502 },
    );
  }

  const feedback = await prisma.feedback.upsert({
    where: { presentationId: id },
    update: {
      content: JSON.stringify({
        overall: capText(result.overall || "", 200),
        overallScore:
          typeof result.overallScore === "number" ? result.overallScore : null,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        history: result.history || "",
      }),
    },
    create: {
      presentationId: id,
      content: JSON.stringify({
        overall: capText(result.overall || "", 200),
        overallScore:
          typeof result.overallScore === "number" ? result.overallScore : null,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        history: result.history || "",
      }),
    },
  });

  await prisma.presentation.update({
    where: { id },
    data: { status: "presented" },
  });

  return NextResponse.json({ feedback });
}
