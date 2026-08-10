# Mid-year Workshop 2026 · 汇报管理平台

面向团队 Workshop 的汇报闭环平台：**PPT 上传 + AI 修改意见（Ray 评审团）→ 演讲录音（实时转写）→ AI 评论反馈（语音播放）**，并内置会议万能小助手「茵姐」。

## ✨ 核心功能

### 我的汇报 · Ray（AI 评审）
- 上传 PPT / PDF，自动提取文字内容
- Ray 专业评审团按 7 个维度（业务影响力 / 创新性 / 落地完成度 / 问题与解决 / 数据支撑 / 下一步 / 表达结构）逐项打分
- 结果包含综合分、**维度对比雷达图**、得分柱状图和逐条修改建议（问题 + 具体建议）
- 可反复重新生成，直到定稿

### 演讲录音与实时转写
- 现场录音同时**实时转写**：`[时间点] 演讲者 N：内容` 逐句上屏
- 默认使用字节火山流式语音识别（断句 + 说话人分离），失败自动降级浏览器本地识别
- 结束录音后实时转写直接保存；音频文件留档，可编辑 / 删除

### AI 评论与反馈
- 结合最终版 PPT 与演讲内容给出综合点评（≤200 字，末句必为改进建议）、亮点与改进建议
- **一键语音播放**：综合点评、亮点建议分别合成语音（豆包 TTS，按内容缓存避免重复计费）
- 结合个人历史汇报记录做成长对比

### 会议助手「茵姐」
- 与"我的汇报"平级的 AI 会务小助手：日程 / 天气 / 地点 / 住宿 / 交通 / 餐食 / 团建 / 账号等会议问题
- **按人记忆**：每位用户保留独立聊天记录，可一键清空
- **隐私保护**：个人餐食 / 团建选择只对本人可见，其他同事信息一律拒绝透露
- 参会账号清单**实时同步数据库**，管理端增删改后自动生效
- 天气自动联网查询（默认杭州 8/9–8/12）

## 🛠 技术栈

- Next.js 15（App Router，standalone 输出）+ React 19 + Tailwind CSS 4
- Prisma + SQLite
- 字节火山：豆包大模型（方舟）、流式 ASR、语音合成 TTS
- Open-Meteo 天气（免费）
- Docker / Docker Compose 部署

## 🚀 快速开始（本地开发）

```bash
cp .env.example .env   # 填入 AUTH_SECRET / ARK_API_KEY / VOLC_SPEECH_API_KEY 等
pnpm install
pnpm db:push           # 初始化 SQLite
pnpm db:seed           # 创建初始管理员
pnpm db:accounts       # 批量创建参会账号（规则：用户名=公司邮箱，密码=个人邮箱）
pnpm dev
```

## 🔑 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `AUTH_SECRET` | ✅ | 登录会话密钥，`openssl rand -hex 32` 生成 |
| `DATABASE_URL` | ✅ | SQLite 路径（默认 `file:../data/app.db`） |
| `DATA_DIR` | ✅ | 文件存储目录（PPT / 录音 / TTS 缓存） |
| `ARK_API_KEY` | ✅ | 火山方舟 API Key（豆包大模型：评审 / 反馈 / 茵姐） |
| `ARK_BASE_URL` / `ARK_CHAT_MODEL` | | 方舟端点与模型 ID |
| `VOLC_SPEECH_API_KEY` | ✅ | 火山语音服务 API Key（ASR / TTS） |
| `VOLC_ASR_MODE` | | `flash`（极速版，推荐）/ `standard` |
| `VOLC_STREAM_ASR_RESOURCE_ID` | | 实时转写资源 ID（默认 ASR 2.0，自动降级） |
| `VOLC_TTS_RESOURCE_ID` / `VOLC_TTS_VOICE` | | TTS 资源与音色（默认 `seed-tts-2.0` + 温柔女声） |
| `SEED_ADMIN_*` | | 初始管理员（`pnpm db:seed` 使用） |
| `APP_URL` | | 站点地址（部署后填写） |

完整说明见 [.env.example](./.env.example)。

## 👥 账号体系

- 管理员在「用户管理」页面创建 / 停用账号、重置密码
- 推荐规则：用户名 = 公司邮箱，密码 = 个人邮箱（见 `prisma/seed-accounts.ts`）
- 茵姐的参会账号清单自动同步数据库，无需额外配置

## 📚 会议资料维护

- 会议知识库：`src/lib/meetingInfo.ts`（日程 / 餐食 / 团建 / 参会人 / 活动负责人）
- 茵姐系统提示词：`src/lib/assistant.ts`（角色定位、分场景流程、隐私规则、边界兜底）
- 数据更新后重新构建即可：`docker compose up -d --build`

## ☁️ 部署

```bash
docker compose up -d --build
```

推荐前置 nginx 反代 + HTTPS（证书用 certbot）。一键部署脚本与配置见 [deploy/README.md](./deploy/README.md)。

## 🔌 外部 API 概览

| 服务 | 用途 | 计费 |
| --- | --- | --- |
| 火山方舟 `chat/completions` | Ray 评审 / 反馈 / 茵姐问答 | 按 token |
| 火山 ASR（极速版 / 流式） | 录音转写 / 实时转写 | 按音频时长 |
| 火山 TTS（unidirectional） | 反馈语音播放 | 按字符（已按内容缓存） |
| Open-Meteo | 天气 | 免费 |

## 📄 License

MIT
