# workflows/

编排多个 skill 完成端到端业务流程。

## 设计理念

```
workflows/     用户/Agent 入口 → 编排多个 skill
skills/        原子能力层     → 单一职责
```

- **Workflow 调用 skill，skill 不调用 workflow**
- 每个 workflow 是独立的 TypeScript 脚本，可直接 `npx -y bun` 执行
- Workflow 负责：参数解析、步骤编排、错误处理、进度输出

## 已有 Workflow

| 文件                | 功能                 | 依赖的 Skill                                                                                      |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `publish-wechat.ts` | 微信公众号发布全流程 | `baoyu-image-gen` · `baoyu-danger-gemini-web` · `baoyu-markdown-to-html` · `baoyu-post-to-wechat` |

## Markdown 内嵌图片生成

在 `.md` 文件中使用 ` ```image-gen ``` ` 代码块标记插图位置，workflow 会自动解析并调用 AI 生成图片。

**最简写法：**

````markdown
```image-gen
content: 一张展示 CI/CD 流水线的流程图
```
````

**带参考风格图：**

````markdown
```image-gen
ref: ./refs/flat-style.png
content: |
  一张展示微服务架构的信息图。
  左侧是 API Gateway，中间是 3 个微服务节点，
  右侧是数据库层。使用蓝绿色调，扁平风格。
ar: 16:9
alt: 微服务架构总览
```
````

**支持字段：** `content`(必填), `image`, `ref`, `ar`, `provider`, `model`, `quality`, `size`, `alt`, `person-gen`, `google-search`

- `image` — 指定输出图片路径（相对于 md 文件），已存在则自动跳过生成；未指定时自动分配到 `_gen_images/img_XX.png`

完整示例见 `examples/article-with-images.md`。

## 配置

发布配置在两个层级管理：

| 文件 | 位置 | 内容 |
|------|------|------|
| `workflows/config.json` | 项目级 | 封面生成、插图生成、主题、发布策略 |
| `scripts/config.json` | Skill 级 | 远程服务器、发布方法 |
| `.env` | 项目根 | API 密钥、凭证 |

## 验证测试

```bash
# 单元测试 — remote 模式路径提取 + 替换
npx -y bun test workflows/tests/test-remote-image-upload.test.ts

# Pipeline 逻辑测试 — image-gen → MD→HTML → remote 路径替换
npx -y bun workflows/tests/test-pipeline.ts

# Dry-Run 集成 — 模拟完整 publish-wechat 流程
npx -y bun workflows/tests/test-dryrun-publish.ts
```

## 添加新 Workflow

1. 在 `workflows/` 下新建 `.ts` 文件
2. 通过 `spawnSync` / `runCommand` 调用 skill 脚本
3. 更新本 README
