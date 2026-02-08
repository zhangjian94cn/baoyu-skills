---
name: baoyu-post-to-wechat
description: Posts content to WeChat Official Account (微信公众号) via API or Chrome CDP. Supports article posting (文章) with HTML, markdown, or plain text input, and image-text posting (图文) with multiple images. Use when user mentions "发布公众号", "post to wechat", "微信公众号", or "图文/文章".
dependencies:
  required:
    - baoyu-markdown-to-html # Markdown → HTML 转换
---

# Post to WeChat Official Account

## Language

**Match user's language**: Respond in the same language the user uses. If user writes in Chinese, respond in Chinese. If user writes in English, respond in English.

## Script Directory

**Agent Execution**: Determine this SKILL.md directory as `SKILL_DIR`, then use scripts from `${SKILL_DIR}/scripts/`.

| Script                    | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `scripts/main.ts`         | **🔑 唯一主入口** - 所有发布流程统一入口 |
| `scripts/setup-remote.ts` | 🔧 远程服务器一键配置                    |

### Quick Start (快速开始)

```bash
# 进入脚本目录
cd skills/baoyu-post-to-wechat/scripts

# 基本用法（配置由 config.json 控制）
npx -y bun main.ts article.md --cover cover.jpg

# AI 自动生成封面
npx -y bun main.ts article.md --generate-cover

# 覆盖配置（CLI 参数优先）
npx -y bun main.ts article.md --cover cover.jpg --method api --theme grace
```

## Configuration (配置)

### config.json（推荐）

编辑 `scripts/config.json` 设置默认行为：

```json
{
  "publish": {
    "method": "remote", // api | browser | remote
    "theme": "default", // default | grace | simple
    "autoGenerateCover": false,
    "coverProvider": "api" // api | web
  },
  "remote": {
    "host": "tencent-server",
    "dir": "~/baoyu-skills",
    "bunPath": "~/.bun/bin/bun"
  }
}
```

### .env（API 凭证）

敏感信息放在项目根目录 `.env` 中：

```env
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret
GEMINI_API_KEY=your-gemini-key
```

**配置优先级**: CLI 参数 > config.json > .env > 默认值

## Publishing Methods (发布策略)

| Method    | Description                | Requirements         |
| --------- | -------------------------- | -------------------- |
| `api`     | 微信 API 直接发布          | API 凭证 + IP 白名单 |
| `browser` | 浏览器 CDP 自动化          | Chrome，无白名单限制 |
| `remote`  | SSH 远程服务器发布（默认） | 远程服务器配置       |

> **动态 IP 用户推荐**：使用 `remote` 方法。运行 `npx -y bun setup-remote.ts` 一键配置。

## Article Posting Workflow (文章发布流程)

```
main.ts 发布流水线:
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│ .md / .html  │ → │ Markdown → HTML │ → │ 处理封面图   │
└──────────────┘    │ (使用主题渲染)   │    │ (指定/AI生成) │
                    └─────────────────┘    └──────┬───────┘
                                                    ↓
                    ┌─────────────────────────────────────────┐
                    │            发布策略 (PUBLISH_METHOD)     │
                    ├─────────────┬─────────────┬─────────────┤
                    │    api      │   browser   │   remote    │
                    │  (微信API)  │  (浏览器)   │  (远程SSH)  │
                    └─────────────┴─────────────┴─────────────┘
                                                    ↓
                    ┌─────────────────────────────────────────┐
                    │           ✅ 草稿箱 (Draft)              │
                    └─────────────────────────────────────────┘
```

### CLI Options

```bash
npx -y bun main.ts <file.md|file.html> [options]

Options:
  --cover <path>         封面图路径（本地/URL）
  --generate-cover       AI 自动生成封面
  --method <method>      发布策略: api | browser | remote
  --title <title>        文章标题（覆盖 frontmatter）
  --author <author>      作者（覆盖 frontmatter）
  --summary <text>       摘要（覆盖 frontmatter）
  --theme <name>         Markdown 主题: default | grace | simple
  --submit               浏览器模式下自动提交
  --cover-provider <p>   封面生成方案: api | web
  --dry-run              预览模式（不实际发布）
```

### Themes (主题)

| Theme     | Description                                           |
| --------- | ----------------------------------------------------- |
| `default` | 经典主题 - 传统排版，标题居中带底边，二级标题白字彩底 |
| `grace`   | 优雅主题 - 文字阴影，圆角卡片，精致引用块             |
| `simple`  | 简洁主题 - 现代极简风，不对称圆角，清爽留白           |

## Directory Structure

```
scripts/
├── main.ts               # 🔑 唯一主入口
├── config.json           # ⚙️ 配置文件
├── config.schema.json    # 📋 配置 Schema
├── setup-remote.ts       # 🔧 远程服务器配置
├── src/                  # 所有模块
│   ├── config.ts         #   配置加载
│   ├── wechat-api.ts     #   API 发布核心
│   ├── wechat-article.ts #   浏览器发布核心
│   ├── wechat-remote-publish.ts
│   ├── cover.ts          #   AI 封面生成（代理层）
│   └── publishers/       #   发布策略
│       ├── api.ts
│       ├── browser.ts
│       └── remote.ts
└── tests/                # 测试
```

> Markdown → HTML 转换由依赖 skill `baoyu-markdown-to-html` 提供。

## Prerequisites

**For API method (recommended for servers)**:

- WeChat Official Account API credentials
- Server IP in WeChat whitelist

**For Remote method (recommended for dynamic IP)**:

- Remote server with fixed IP
- Run `npx -y bun setup-remote.ts` for one-click setup

**For Browser method**:

- Google Chrome
- First run: log in to WeChat Official Account

## Troubleshooting

| Issue                   | Solution                                           |
| ----------------------- | -------------------------------------------------- |
| Missing API credentials | Set in `.env` or `~/.baoyu-skills/.env`            |
| Access token error      | Check if API credentials are valid                 |
| IP not in whitelist     | Add server IP to WeChat whitelist, or use `remote` |
| SSH connection failed   | Check SSH config and key permissions               |
| Remote server not setup | Run `npx -y bun setup-remote.ts`                   |
| Not logged in (browser) | First run opens browser - scan QR to log in        |
| Chrome not found        | Set `WECHAT_BROWSER_CHROME_PATH` env var           |

## Detailed References

| Topic                     | Reference                                                              |
| ------------------------- | ---------------------------------------------------------------------- |
| Remote server setup       | [references/remote-server-setup.md](references/remote-server-setup.md) |
| Image-text posting (图文) | [references/image-text-posting.md](references/image-text-posting.md)   |
| Article themes            | [references/article-posting.md](references/article-posting.md)         |
