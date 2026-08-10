import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { VolcStreamAsr, asrSupportInfo } from "@/lib/volcStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** 预检：浏览器据此决定是否使用字节流式转写（否则退回浏览器本地语音识别） */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(asrSupportInfo());
}

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

  if (!asrSupportInfo().volcConfigured) {
    return NextResponse.json(
      { error: "未配置 VOLC_SPEECH_API_KEY，实时转写不可用" },
      { status: 501 },
    );
  }

  const body = req.body;
  if (!body) {
    return NextResponse.json({ error: "缺少音频流" }, { status: 400 });
  }

  let asr: VolcStreamAsr | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const client = new VolcStreamAsr();
      asr = client;
      let retried = false;
      let sentAnyAudio = false;
      let ended = false;

      const finish = (event: Record<string, unknown>) => {
        if (ended) return;
        ended = true;
        try {
          controller.enqueue(sse(event));
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      client.onMessage = (msg) => {
        if (msg.type === "segment") {
          try {
            controller.enqueue(
              sse({
                type: "segment",
                text: msg.text || "",
                utterances: msg.utterances || [],
              }),
            );
          } catch {
            // 客户端已断开
          }
          return;
        }
        if (msg.type === "error") {
          // 音频开始前报错（如资源未开通），自动降级重试一次（去掉说话人，使用 ASR 1.0）
          if (!sentAnyAudio && !retried) {
            retried = true;
            void startAsr(false).catch(() => finish({ type: "error", error: msg.error }));
            return;
          }
          finish({ type: "error", error: msg.error });
          return;
        }
        if (msg.type === "close") {
          finish({ type: "done" });
        }
      };

      async function startAsr(withSpeaker: boolean) {
        await client.connect({ withSpeaker });
      }

      try {
        await startAsr(true);
      } catch {
        if (!retried) {
          retried = true;
          try {
            await startAsr(false);
          } catch (e) {
            finish({
              type: "error",
              error: e instanceof Error ? e.message : "无法连接流式语音识别服务",
            });
            return;
          }
        }
      }

      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            sentAnyAudio = true;
            client.sendAudio(Buffer.from(value));
          }
        }
      } catch {
        // 客户端中断
      }

      client.end();
      // 等服务端回完最后一包后由 onMessage(close) 收尾；这里兜底 8 秒后结束
      setTimeout(() => {
        if (!ended) finish({ type: "done" });
      }, 8000);
    },
    cancel() {
      try {
        asr?.close();
      } catch {
        // ignore
      }
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
