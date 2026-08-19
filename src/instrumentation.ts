export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __shikeNotifyStarted?: boolean };
  if (g.__shikeNotifyStarted) return;
  g.__shikeNotifyStarted = true;

  const { generateNotifications } = await import("./lib/notify");
  const run = async () => {
    try {
      const n = await generateNotifications();
      if (n > 0) console.log(`[shike-notify] 生成 ${n} 条通知`);
    } catch (e) {
      console.error("[shike-notify] 失败:", e);
    }
  };
  run();
  setInterval(run, 15 * 60 * 1000);
}
