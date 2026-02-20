---
name: baoyu-wechat-pipeline
description: End-to-end WeChat article publishing pipeline. Orchestrates AI image generation (baoyu-image-gen), Markdown-to-HTML conversion (baoyu-markdown-to-html), and publishing (baoyu-post-to-wechat). Supports frontmatter config for cover/inline images, `image-gen` code blocks with style reference images, and multiple publishing methods (API/Browser/Remote). Use when user says "发布微信", "publish to wechat", "微信公众号发布", or wants to publish markdown articles with AI-generated illustrations.
dependencies:
  required:
    - baoyu-image-gen          # AI 图片生成
    - baoyu-markdown-to-html   # Markdown → HTML 转换
    - baoyu-post-to-wechat     # 微信公众号发布（底层）
---

# WeChat Publishing Pipeline

## Language

**Match user's language**: Respond in the same language the user uses.

## Script Directory

**Agent Execution**: Determine this SKILL.md directory as `SKILL_DIR`, then use scripts from `${SKILL_DIR}/scripts/`.

| Script                          | Purpose              |
| ------------------------------- | -------------------- |
| `scripts/publish-wechat.ts`     | 🔑 唯一主入口        |

### Quick Start

```bash
cd skills/baoyu-wechat-pipeline/scripts

# 基本用法
npx -y bun publish-wechat.ts article.md --cover cover.jpg

# AI 生成封面
npx -y bun publish-wechat.ts article.md --generate-cover

# 预览模式
npx -y bun publish-wechat.ts article.md --cover cover.jpg --dry-run
```

## Pipeline 流程

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Markdown     │ →  │ Step 1: 封面    │ →  │ Step 1.5: 正文   │
│ + image-gen  │    │ (指定/AI 生成)  │    │ 插图生成         │
│   代码块     │    └─────────────────┘    │ (image-gen 块)   │
└──────────────┘                           └────────┬─────────┘
                                                    ↓
                    ┌─────────────────────────────────────────┐
                    │ Step 2: MD→HTML + 发布到微信公众号       │
                    │ (api / browser / remote)                │
                    └─────────────────────────────────────────┘
```

## image-gen 代码块语法

在 Markdown 中嵌入 AI 生成配图：

````markdown
```image-gen
content: 配图描述文字
ar: 4:3
image: ./images/output.png
alt: 图片说明
```
````

带参考风格图：

````markdown
```image-gen
ref: ./refs/style.png
content: |
  基于参考图风格生成配图。
  使用相同的配色和设计语言。
ar: 16:9
image: ./images/output.png
alt: 图片说明
```
````

**支持字段：** `content`(必填), `image`, `ref`, `ar`, `provider`, `model`, `quality`, `size`, `alt`, `person-gen`, `google-search`

- `image` — 指定输出路径（相对于 md 文件），已存在则跳过生成；未指定时自动分配
- `ref` — 参考风格图，自动追加"仅参考风格"指令

## Frontmatter 字段

```yaml
---
title: "文章标题"
author: "作者"
description: "摘要"
cover: "./cover.jpg"           # 封面图路径
cover-prompt: "AI 封面提示词"   # AI 生成封面
cover-ref: "./refs/style.png"  # 封面参考风格图
---
```

**优先级**：CLI `--cover` > frontmatter `cover` > AI 生成

## CLI Options

```bash
npx -y bun publish-wechat.ts <file.md|file.html> [options]

Options:
  --cover <path>           封面图路径
  --cover-prompt <text>    封面 AI 生成提示词
  --cover-ref <path>       封面参考风格图
  --generate-cover         AI 自动生成封面
  --method <method>        发布策略: api | browser | remote
  --title <title>          文章标题
  --author <author>        作者
  --summary <text>         摘要
  --theme <name>           Markdown 主题: default | grace | simple
  --dry-run                预览模式
```

## Configuration

编辑 `scripts/config.json` 设置默认行为。Schema: `scripts/config.schema.json`。

配置优先级: **CLI 参数 > frontmatter > config.json > 默认值**

