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
    "method": "remote", // api | browser | remote
    "theme": "default" // default | grace | simple
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
```

## 发布策略

| 策略      | 说明               | 适用场景                      |
| --------- | ------------------ | ----------------------------- |
| `api`     | 微信 API 直接发布  | 服务器 IP 已加白名单          |
| `browser` | 浏览器 CDP 自动化  | 本地操作，无白名单限制        |
| `remote`  | SSH 远程服务器发布 | IP 受限，通过白名单服务器中转 |

## 目录结构

```
scripts/
├── main.ts               # 🔑 唯一主入口
├── config.json           # ⚙️ 配置文件
├── config.schema.json    # 📋 配置 Schema（IDE 提示）
├── setup-remote.ts       # 🔧 远程服务器配置工具
├── src/                  # 所有模块
│   ├── config.ts         #   配置加载
│   ├── command.ts        #   命令执行
│   ├── cdp.ts            #   Chrome DevTools Protocol
│   ├── wechat-api.ts     #   API 发布核心
│   ├── wechat-article.ts #   CDP 发布核心
│   ├── wechat-remote-publish.ts  # 远程发布核心
│   └── publishers/       #   发布策略
└── tests/                # 测试
```

> **依赖**: Markdown → HTML 转换由 `baoyu-markdown-to-html` skill 提供。

## 测试

```bash
bun test tests/
```
