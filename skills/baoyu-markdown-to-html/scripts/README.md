# Markdown to HTML 转换工具

将 Markdown 文件转换为精美的内联样式 HTML，针对微信公众号等平台优化。

## 快速开始

```bash
cd skills/baoyu-markdown-to-html/scripts

# 基本用法（使用默认主题）
npx -y bun main.ts article.md

# 指定主题
npx -y bun main.ts article.md --theme grace

# 保留首个标题
npx -y bun main.ts article.md --keep-title

# 覆盖标题
npx -y bun main.ts article.md --title "自定义标题"
```

## 命令参数

| 参数              | 说明                              | 默认值        |
| ----------------- | --------------------------------- | ------------- |
| `--theme <name>`  | 主题名称 (default, grace, simple) | default       |
| `--title <title>` | 覆盖 frontmatter 中的标题         |               |
| `--keep-title`    | 保留正文中的首个标题              | false（移除） |
| `--help`          | 显示帮助信息                      |               |

## 主题

| 主题      | 风格                                                  |
| --------- | ----------------------------------------------------- |
| `default` | 经典主题 - 传统排版，标题居中带底边，二级标题白字彩底 |
| `grace`   | 优雅主题 - 文字阴影，圆角卡片，精致引用块             |
| `simple`  | 简洁主题 - 现代极简风，不对称圆角，清爽留白           |

## 输出

- **输出位置**：与输入 Markdown 同目录，例如 `article.md` → `article.html`
- **冲突处理**：若 HTML 已存在，先备份为 `article.html.bak-YYYYMMDDHHMMSS`

**JSON 输出（stdout）：**

```json
{
  "title": "文章标题",
  "author": "作者",
  "summary": "文章摘要...",
  "htmlPath": "/path/to/article.html",
  "backupPath": "/path/to/article.html.bak-20260128180000",
  "contentImages": [
    {
      "placeholder": "MDTOHTMLIMGPH_1",
      "localPath": "/path/to/img.png",
      "originalPath": "imgs/image.png"
    }
  ]
}
```

## Frontmatter

支持 YAML frontmatter 提取元数据：

```yaml
---
title: 文章标题
author: 作者
description: 文章摘要
---
```

标题优先级：`--title` 参数 > frontmatter `title` > 正文首个 H1/H2 > 文件名

## 支持的 Markdown 特性

| 特性      | 语法                           |
| --------- | ------------------------------ | ------ |
| 标题      | `# H1` 到 `###### H6`          |
| 粗体/斜体 | `**粗体**`、`*斜体*`           |
| 代码块    | ` ```lang ` 带语法高亮         |
| 行内代码  | `` `code` ``                   |
| 表格      | GFM 风格表格                   |
| 图片      | `![alt](src)` 支持本地/远程    |
| 链接      | `[text](url)` 带脚注引用       |
| 引用块    | `> quote`                      |
| 列表      | `-` 无序、`1.` 有序            |
| Alerts    | `> [!NOTE]`、`> [!WARNING]` 等 |
| 脚注      | `[^1]` 引用                    |
| Ruby 注音 | `{底文                         | 注音}` |
| Mermaid   | ` ```mermaid ` 图表            |
| PlantUML  | ` ```plantuml ` 图表           |
| 数学公式  | KaTeX 支持                     |
| 信息图    | 自动识别信息图内容             |

## 目录结构

```
scripts/
├── main.ts           # 🔑 主入口，提供 CLI 和 convertMarkdown() 导出
├── package-lock.json
└── md/               # Markdown 渲染引擎
    ├── render.ts     #   渲染主逻辑
    ├── package.json  #   依赖（marked, highlight.js, juice 等）
    ├── themes/       #   主题样式
    │   ├── base.css
    │   ├── default.css
    │   ├── grace.css
    │   └── simple.css
    ├── extensions/   #   Markdown 扩展
    │   ├── alert.ts      # GitHub 风格 Alerts
    │   ├── footnotes.ts  # 脚注
    │   ├── infographic.ts # 信息图
    │   ├── katex.ts      # 数学公式
    │   ├── markup.ts     # 标记语法
    │   ├── plantuml.ts   # PlantUML 图表
    │   ├── ruby.ts       # 注音标注
    │   ├── slider.ts     # 滑动内容
    │   └── toc.ts        # 目录生成
    └── utils/        #   工具函数
```

## 作为模块使用

`main.ts` 导出 `convertMarkdown()` 函数，可被其他脚本调用：

```typescript
import { convertMarkdown } from "./main.ts";

const result = await convertMarkdown("article.md", {
  theme: "grace",
  keepTitle: true,
});

console.log(result.htmlPath); // 生成的 HTML 路径
console.log(result.title); // 提取的标题
```
