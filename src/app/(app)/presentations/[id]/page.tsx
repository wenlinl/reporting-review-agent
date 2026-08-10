import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PresentationWorkspace from "@/components/PresentationWorkspace";

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const presentation = await prisma.presentation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!presentation) notFound();
  if (user.role !== "admin" && presentation.userId !== user.id) notFound();

  return <PresentationWorkspace presentationId={id} isAdmin={user.role === "admin"} />;
}
