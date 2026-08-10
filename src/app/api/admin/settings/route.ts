import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRubric, setRubric, type RubricItem } from "@/lib/settings";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const rubric = await getRubric();
  return NextResponse.json({ rubric });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { rubric } = await req.json().catch(() => ({ rubric: null }));
  if (!Array.isArray(rubric) || rubric.length === 0) {
    return NextResponse.json({ error: "评审维度不能为空" }, { status: 400 });
  }
  const items: RubricItem[] = rubric.map((r: RubricItem) => ({
    key: String(r.key || "").trim(),
    name: String(r.name || "").trim(),
    description: String(r.description || "").trim(),
  }));
  if (items.some((i) => !i.key || !i.name)) {
    return NextResponse.json({ error: "每个维度需要 key 和名称" }, { status: 400 });
  }
  await setRubric(items);
  return NextResponse.json({ rubric: items });
}
