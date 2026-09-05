import { NextRequest, NextResponse } from "next/server";
import { realtimeChatStream } from "@/lib/arkRealtime";
import { parseWav } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 流式实时语音：上传 16k WAV，响应以 chunked 流式返回 16k PCM（边生成边下发给板端播放）。
 * 响应头：X-Reply（文本）。
 */
export async function POST(req: NextRequest) {
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length < 1000) {
    return NextResponse.json({ error: "音频数据过短" }, { status: 400 });
  }
  const { pcm } = parseWav(body);
  if (pcm.length < 1000) {
    return NextResponse.json({ error: "无法解析音频" }, { status: 400 });
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = realtimeChatStream(pcm);
  } catch (e) {
    return NextResponse.json(
      { error: "实时对话失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "audio/pcm",
      "Cache-Control": "no-store",
    },
  });
}
