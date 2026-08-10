import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      presentations: {
        select: {
          id: true,
          title: true,
          status: true,
          pptName: true,
          pptText: true,
          reviews: { select: { id: true } },
          recordings: {
            select: { transcriptStatus: true, transcript: true },
          },
          feedback: { select: { id: true } },
        },
      },
    },
  });

  const rows = users.map((u) => {
    const p = u.presentations[0] || null;
    return {
      user: { id: u.id, name: u.name, email: u.email },
      presentation: p
        ? {
            id: p.id,
            title: p.title,
            status: p.status,
            pptUploaded: Boolean(p.pptName),
            reviewed: p.reviews.length > 0,
            recorded: p.recordings.length > 0,
            transcribed:
              p.recordings.length > 0 &&
              p.recordings.every((r) => r.transcriptStatus === "done"),
            feedback: Boolean(p.feedback),
          }
        : null,
    };
  });

  const counts = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.presentation?.pptUploaded) acc.pptUploaded += 1;
      if (r.presentation?.reviewed) acc.reviewed += 1;
      if (r.presentation?.recorded) acc.recorded += 1;
      if (r.presentation?.transcribed) acc.transcribed += 1;
      if (r.presentation?.feedback) acc.feedback += 1;
      return acc;
    },
    { total: 0, pptUploaded: 0, reviewed: 0, recorded: 0, transcribed: 0, feedback: 0 },
  );

  return NextResponse.json({ rows, counts });
}
