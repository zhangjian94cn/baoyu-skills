# 微信公众号发布工具

一键发布 Markdown/HTML 文章到微信公众号草稿箱。

## 快速开始

```bash
cd skills/baoyu-post-to-wechat/scripts

# 基本用法（配置由 config.json 控制）
npx -y bun main.ts article.md --cover cover.jpg

# 覆盖配置（CLI 参数优先）
npx -y bun main.ts article.md --cover cover.jpg --method api --theme grace

# 预览模式（不实际发布）
npx -y bun main.ts article.md --cover cover.jpg --dry-run
```

## 配置

### config.json（推荐）

编辑 `scripts/config.json` 设置默认行为：

```json
{
  "publish": {
    "method": "remote",
    "theme": "default"
  },
  "remote": {
    "host": "tencent-server",
    "dir": "~/baoyu-skills",
    "bunPath": "~/.bun/bin/bun"
  }
}
```

> 远程配置优先级：`config.json` remote > `.env` > 默认值

### .env（API 凭证 & 远程配置覆盖）

敏感信息和环境变量放在项目根目录 `.env` 中：

```env
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret

# 可选：覆盖 config.json 中的远程配置
REMOTE_SERVER_HOST=tencent-server
REMOTE_SERVER_DIR=~/baoyu-skills
REMOTE_SERVER_BUN_PATH=~/.bun/bin/bun
```

## 发布策略

| 策略      | 说明               | 适用场景                      |
| --------- | ------------------ | ----------------------------- |
| `api`     | 微信 API 直接发布  | 服务器 IP 已加白名单          |
| `browser` | 浏览器 CDP 自动化  | 本地操作，无白名单限制        |
| `remote`  | SSH 远程服务器发布 | IP 受限，通过白名单服务器中转 |

### Remote 发布流程

使用 `remote` 策略时，发布流程为：

1. **Step 1**: SCP 上传 HTML 到远程服务器
2. **Step 1.5**: 扫描 HTML 中 `data-local-path` 引用的正文图片，SCP 上传到 `_content_images/`，重写 HTML 路径
3. **Step 2**: 处理封面图（本地上传/远程检测/WebP 转 PNG）
4. **Step 3**: SSH 远程执行 `wechat-api.ts` 完成发布

## 跨平台支持

通过 `command.ts` 统一处理平台差异：

| 场景 | macOS / Linux | Windows |
|------|--------------|---------|
| 运行 bun 脚本 | `npx -y bun` | 直接 `bun` |
| SSH / SCP | `shell: false` | `shell: false` |

> **关键设计**: 所有 SSH/SCP 调用使用 `shell: false` 防止本地 shell 展开远程路径中的 `~`

## 目录结构

```
scripts/
├── main.ts                       # 🔑 唯一主入口
├── config.json                   # ⚙️ 配置文件
├── config.schema.json            # 📋 配置 Schema（IDE 提示）
├── setup-remote.ts               # 🔧 远程服务器配置工具
├── src/
│   ├── config.ts                 #   配置加载（config.json + .env）
│   ├── command.ts                #   命令执行（runBunScript / runSsh / runScp）
│   ├── cdp.ts                    #   Chrome DevTools Protocol
│   ├── wechat-api.ts             #   API 发布核心
│   ├── wechat-article.ts         #   CDP 发布核心
│   ├── wechat-remote-publish.ts  #   远程发布核心
│   └── publishers/               #   发布策略（api / browser / remote）
└── tests/                        # 测试
```

> **依赖**: Markdown → HTML 转换由 `baoyu-markdown-to-html` skill 提供。

## 测试

```bash
# 运行全部测试
bun test tests/
```

验证脚本位于 `workflows/tests/`（从项目根目录运行）：

```bash
# 单元测试 — data-local-path 提取 + 路径替换
npx -y bun test workflows/tests/test-remote-image-upload.test.ts

# Pipeline 逻辑 — image-gen → MD→HTML → remote 路径替换
npx -y bun workflows/tests/test-pipeline.ts

# Dry-Run 集成 — 模拟完整发布流程
npx -y bun workflows/tests/test-dryrun-publish.ts
```
