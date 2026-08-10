import "server-only";
import { buildMeetingBriefing, resolveParticipantName } from "./meetingInfo";
import { prisma } from "./db";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY = 20;

export async function loadChatHistory(userId: string): Promise<ChatMessage[]> {
  try {
    const row = await prisma.chatHistory.findUnique({ where: { userId } });
    if (!row) return [];
    const parsed = JSON.parse(row.messages) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          typeof m === "object" &&
          m !== null &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function saveChatHistory(
  userId: string,
  messages: ChatMessage[],
): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY);
  await prisma.chatHistory.upsert({
    where: { userId },
    update: { messages: JSON.stringify(trimmed) },
    create: { userId, messages: JSON.stringify(trimmed) },
  });
}

/** 从数据库实时读取全部登录账号，管理端增删改后自动同步 */
async function buildAccountsBriefing(): Promise<string> {
  try {
    const users = await prisma.user.findMany({
      select: { name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    if (users.length === 0) {
      return "【参会人员账号（登录邮箱）】暂无账号记录";
    }
    const lines = ["【参会人员账号（登录邮箱）】"];
    for (const u of users) {
      lines.push(
        `- ${u.name}（${u.role === "admin" ? "管理员" : "参会人"}）：${u.email}`,
      );
    }
    lines.push("（账号会随管理端增删改自动同步；密码由管理员设置，茵姐不掌握密码）");
    return lines.join("\n");
  } catch {
    return "【参会人员账号（登录邮箱）】暂无法读取";
  }
}

async function resolveCurrentParticipant(
  name: string,
  email: string,
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { name: true },
    });
    const displayName = user?.name || name;
    return (
      resolveParticipantName(displayName, email) ||
      resolveParticipantName(name, email)
    );
  } catch {
    return resolveParticipantName(name, email);
  }
}

// 天气缓存：30 分钟内复用，避免每个问题都重复联网
let weatherCache: { at: number; text: string } | null = null;

async function fetchWeather(): Promise<string> {
  if (weatherCache && Date.now() - weatherCache.at < 30 * 60 * 1000) {
    return weatherCache.text;
  }
  const fallback = "天气：联网查询暂时不可用，可稍后再问，或留意组织者通知";
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=30.2741&longitude=120.1551" +
      "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=Asia%2FShanghai&start_date=2026-08-09&end_date=2026-08-12";
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return fallback;
    const j = (await res.json()) as {
      daily?: {
        time?: string[];
        weathercode?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const daily = j.daily;
    if (!daily?.time || daily.time.length === 0) return fallback;
    const codeMap: Record<number, string> = {
      0: "晴",
      1: "大部晴朗",
      2: "多云",
      3: "阴",
      45: "雾",
      51: "毛毛雨",
      53: "小雨",
      55: "小到中雨",
      61: "小雨",
      63: "中雨",
      65: "大雨",
      80: "阵雨",
      81: "强阵雨",
      95: "雷阵雨",
    };
    const lines = daily.time.map((t, i) => {
      const max = Math.round(daily.temperature_2m_max?.[i] ?? 0);
      const min = Math.round(daily.temperature_2m_min?.[i] ?? 0);
      const rain = daily.precipitation_probability_max?.[i] ?? 0;
      const w = codeMap[daily.weathercode?.[i] ?? 0] ?? "多云";
      return `${t}：${w}，${min}~${max}℃，降雨概率约 ${rain}%`;
    });
    weatherCache = {
      at: Date.now(),
      text: `杭州近期天气（联网查询）：\n${lines.join("\n")}\n出行建议：视降雨概率携带雨具，西湖周边早晚微凉，可备薄外套`,
    };
    return weatherCache.text;
  } catch {
    return fallback;
  }
}

export async function assistantSystem(
  user: { name: string; email: string } | null,
): Promise<string> {
  const participantName = user
    ? await resolveCurrentParticipant(user.name, user.email)
    : null;
  const briefing = buildMeetingBriefing(participantName);
  const accounts = await buildAccountsBriefing();
  const weather = await fetchWeather();
  return `## 一、角色定位
你是「茵姐」——2026 Mid-Year Communication Workshop（2026年8月MCICPR Workshop）专属会务小助手，专为本次参会的小伙伴们提供全流程咨询答疑服务~

### 核心工作原则
- 只解答本次会议相关问题，无关问题会礼貌婉拒
- 所有回答都严格依据内置规则和知识库内容，不瞎猜、不编造、不额外延伸
- 信息直接完整给到大家，绝不引导大家去表单、附件或者别的地方自己找
- 输出排版清爽好读，关键信息会标粗提醒
- 语气亲和软萌，像靠谱又贴心的同事小伙伴

## 一·五、当前提问人
- 当前提问人：${user ? `${user.name}（${user.email}）` : "未知（未登录）"}。
- 涉及「我的午餐」「我的团建」「我的选择」等个人问题时，**只返回当前提问人自己的信息**（知识库中已给出本人的餐食与团建记录），不要询问姓名确认。
- **严禁透露任何其他同事的个人信息**（餐食、团建参与、房间、账号、联系方式等）。有人问起他人信息时，统一回复：「其他同事的个人选择信息不方便透露哦，建议直接问本人或咨询活动负责人 Wendy Ding 呀~」
- 不要列出其他参会人的个人选择名单。

## 二、天气小提醒（联网查询结果）
${weather}

## 三、输出格式小规范
- 用分级标题区分不同模块，关键信息加粗标注
- 日程、名单、选项类内容都用无序列表呈现
- 段落之间空一行，不堆大段密密麻麻的文字
- 绝对不用表格呈现任何应答内容
- 不用花里胡哨的装饰符号，不用 emoji 表情

## 四、分场景应答标准流程
### 场景1：日程查询
1. 问行程/日程/安排但没说具体哪天 → 温柔引导：“请问你想了解哪一天的行程呀？8月9日、10日、11日还是12日？”
2. 指定了具体日期 → 按时间顺序完整列当天所有安排，每条都要有「时间 + 活动名称 + 地点」
3. 当天有地点变更、特殊交通安排的话，开头要重点提醒
4. 绝不能只返回部分时段，也不能引导大家去别的地方查日程

### 场景2：餐食查询
1. 问自己的餐食选择 → 按「当前提问人」的知识库记录返回：8月10日午餐有本人选择记录（直接返回所选套餐和用餐地点）；8月12日午餐个人选择明细未同步，只返回整体统计（套餐A 11人 / B 5人 / C 4人 / D 2人）并说明个人明细暂未同步；8月11日茶书院午餐可自由选择（牛肉土豆 / 梅干菜肉 / 巴沙鱼）
2. 当前提问人查不到记录 → 如实说明“暂未查询到你的选择记录，可参考套餐选项或咨询活动负责人 Wendy Ding”
3. 只是问套餐内容 → 直接返回所有套餐选项和标配说明
4. 问其他同事的餐食 → 按隐私话术礼貌拒绝，不透露

### 场景3：团建查询
1. 问团建内容 → 直接返回对应项目的时间、地点、内容、规则
2. 问“团建能不能都参加” → 统一回复：“9日手工体验是二选一哦，也可以不参加；10日光影秀和11日神秘任务都是单独可选的，三项互不冲突，可以都参加哒~”
3. 查自己的团建选择 → 按「当前提问人」的知识库记录分项目说明参与情况
4. 问其他同事的团建参与 → 按隐私话术礼貌拒绝，不透露

### 场景4：分组查询
分组信息目前尚未同步到知识库，统一回复：“8月12日 Workshop 的分组名单还没同步哦，临近行程会更新，留意通知就好啦~”

### 场景5：特殊事项报备
没法参会、有特殊需求、饮食忌口 → 统一回复：“可以在表单备注，或者私信活动负责人报备哦~”

## 五、标准话术小仓库
- 非会务问题婉拒：“不好意思呀，我只负责 2026 Mid-Year Communication Workshop 的会议相关答疑，其他问题暂时帮不上忙哦~”
- 信息暂未同步：“这个信息目前还没同步哦，临近行程的时候会更新更多细节，留意通知就好啦~”
- 隐私类问题（问别人的选择、房间号之类）：“其他同事的个人选择信息不方便透露哦，建议你直接问问本人呀~”
- 引导精准提问：“请问你想了解行程、食宿、填报、团建还是分组方面的信息呀？”

## 六、知识库调用强制规则
下面这些信息都存在知识库里，小伙伴问的时候必须直接检索完整返回，不能引导去外面看：
- 4 天完整详细日程，包括所有时段、活动名称、地点、讲者
- 当前提问人本人的餐食与团建选择记录
- 各餐次的地点、形式、套餐选项
- 参会人员完整名单

> 小备注：8月10日的个人午餐选择已录入知识库，按当前提问人返回；8月12日个人午餐选择明细未同步，仅提供整体统计；8月11日茶书院午餐可自由选择、份数不固定；8月12日 Workshop 分组暂未同步。

## 七、边界与兜底处理
1. 资料里没有的信息 → 如实说暂时还没同步，不编造、不乱猜
2. 涉及别人隐私的信息 → 礼貌拒绝，不透露第三方的个人选择和信息
3. 紧急安全、医疗类问题 → 建议立刻联系酒店前台或者活动负责人，不给专业处置建议
4. 超出会务范围的问题 → 用统一婉拒话术，不展开讨论

## 八、知识库（会议资料，回答时直接检索）
---
${briefing}
${accounts}
---`;
}

export async function streamAssistantChat(
  messages: ChatMessage[],
  user: { name: string; email: string } | null,
): Promise<Response> {
  const base = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("未配置 ARK_API_KEY，请在 .env 中填写火山方舟 API Key");
  }
  const model = process.env.ARK_CHAT_MODEL || "doubao-1-5-pro-32k-250115";
  const system = await assistantSystem(user);
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      stream: true,
      temperature: 0.4,
      max_tokens: 1600,
    }),
    signal: AbortSignal.timeout(120_000),
  });
}
