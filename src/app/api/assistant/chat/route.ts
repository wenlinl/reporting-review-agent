import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  streamAssistantChat,
  loadChatHistory,
  saveChatHistory,
  type ChatMessage,
} from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** 获取当前用户的聊天记录（记忆） */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const history = await loadChatHistory(session.id);
  return NextResponse.json({ messages: history });
}

/** 清空当前用户的聊天记录 */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    await prisma.chatHistory.deleteMany({ where: { userId: session.id } });
  } catch {
    // 无记录时也视为成功
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
  const content =
    typeof body?.content === "string" ? body.content.trim().slice(0, 2000) : "";
  if (!content) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  const history = await loadChatHistory(session.id);
  const userMsg: ChatMessage = { role: "user", content };
  const messages: ChatMessage[] = [...history, userMsg];

  let upstream: Response;
  try {
    upstream = await streamAssistantChat(messages, {
      name: session.name,
      email: session.email,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败，请稍后重试" },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `AI 接口调用失败 (${upstream.status}): ${text.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const reader = upstream.body.getReader();
  let reply = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const decoder = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload) as {
                  choices?: { delta?: { content?: string } }[];
                };
                const delta = j.choices?.[0]?.delta?.content;
                if (delta) {
                  reply += delta;
                  controller.enqueue(sse({ delta }));
                }
              } catch {
                // 忽略不完整包
              }
            }
          }
        }
      } catch {
        // 客户端中断，不保存本轮回复
      } finally {
        try {
          controller.enqueue(sse({ done: true }));
          controller.close();
        } catch {
          // ignore
        }
      }
      // 正常完成后保存记忆
      if (reply.trim()) {
        const trimmedReply = reply.slice(0, 8000);
        await saveChatHistory(session.id, [
          ...history,
          userMsg,
          { role: "assistant", content: trimmedReply },
        ]);
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
