#!/usr/bin/env bun
/**
 * 微信公众号发布 — 统一入口
 *
 * 专注于发布流程，只做两件事：
 *   1. Markdown → HTML 转换（委托 baoyu-markdown-to-html）
 *   2. 发布到微信公众号
 *
 * 封面图、AI 生成等前置步骤由 Agent 层在调用本脚本前准备好。
 *
 * 支持 3 种发布策略（通过 .env 的 PUBLISH_METHOD 或 --method 指定）：
 *   - api:     微信 API 直接发布（需 IP 白名单）
 *   - browser: 浏览器 CDP 自动化（本地、无白名单限制）
 *   - remote:  远程服务器发布（默认，通过 SSH 调用 API）
 *
 * 用法:
 *   npx -y bun main.ts <file.md|file.html> --cover <cover.jpg> [options]
 *
 * 示例:
 *   npx -y bun main.ts article.md --cover cover.jpg
 *   npx -y bun main.ts article.md --cover cover.jpg --method browser
 *   npx -y bun main.ts article.md --cover cover.jpg --title "标题" --author "作者"
 */

import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import {
  getScriptDir,
  getProjectRoot,
  loadPublishMethod,
  loadJsonConfig,
  type PublishMethod,
} from "./src/config.ts";
import { runCommand, runBunScript } from "./src/command.ts";
import { ApiPublisher } from "./src/publishers/api.ts";
import { BrowserPublisher } from "./src/publishers/browser.ts";
import { RemotePublisher } from "./src/publishers/remote.ts";
import type { Publisher, PublishOptions } from "./src/publishers/types.ts";

// ============ CLI 解析 ============

interface Options {
  file: string;
  method?: PublishMethod;
  title?: string;
  author?: string;
  summary?: string;
  cover?: string;
  theme?: string;
  submit?: boolean;
  dryRun?: boolean;
}

function printUsage(): never {
  console.log(`
微信公众号发布 — 统一入口

用法:
  npx -y bun main.ts <file.md|file.html> --cover <cover.jpg> [options]

选项:
  --cover <path>         封面图路径（必需）
  --method <method>      发布策略: api | browser | remote（默认由 .env 配置）
  --title <title>        文章标题（覆盖 frontmatter）
  --author <author>      作者（覆盖 frontmatter）
  --summary <text>       摘要（覆盖 frontmatter）
  --theme <name>         Markdown 主题: default | grace | simple
  --submit               浏览器模式下自动提交
  --dry-run              预览模式（不实际发布）
  --help                 显示帮助

发布策略:
  api       通过微信 API 直接发布（服务器 IP 需在白名单）
  browser   通过浏览器自动化发布（本地操作，无白名单限制）
  remote    通过 SSH 远程服务器发布（默认，适用于 IP 受限场景）

配置文件 (.env):
  PUBLISH_METHOD=remote       # 默认发布策略
  WECHAT_APP_ID=xxx           # API 模式需要
  WECHAT_APP_SECRET=xxx       # API 模式需要
  REMOTE_SERVER_HOST=xxx      # remote 模式需要

示例:
  npx -y bun main.ts article.md --cover cover.jpg
  npx -y bun main.ts article.md --cover cover.jpg --method api
  npx -y bun main.ts article.md --cover cover.jpg --method browser --submit
`);
  process.exit(0);
}

function parseArgs(argv: string[]): Options {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  let file = "";
  let method: PublishMethod | undefined;
  let title: string | undefined;
  let author: string | undefined;
  let summary: string | undefined;
  let cover: string | undefined;
  let theme: string | undefined;
  let submit = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--method":
        method = argv[++i] as PublishMethod;
        break;
      case "--title":
        title = argv[++i];
        break;
      case "--author":
        author = argv[++i];
        break;
      case "--summary":
        summary = argv[++i];
        break;
      case "--cover":
        cover = argv[++i];
        break;
      case "--theme":
        theme = argv[++i];
        break;
      case "--submit":
        submit = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        if (!arg.startsWith("-") && !file) {
          file = arg;
        }
    }
  }

  if (!file) {
    console.error("❌ 错误：请指定文件路径");
    printUsage();
  }

  return { file, method, title, author, summary, cover, theme, submit, dryRun };
}

// ============ Publisher 工厂 ============

function createPublisher(method: PublishMethod): Publisher {
  switch (method) {
    case "api": return new ApiPublisher();
    case "browser": return new BrowserPublisher();
    case "remote": return new RemotePublisher();
    default:
      throw new Error(`未知的发布策略: ${method}。可选: api, browser, remote`);
  }
}

// ============ 主流程 ============

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scriptDir = getScriptDir(import.meta.url);
  const projectRoot = getProjectRoot(scriptDir);

  // 加载 JSON 配置
  const jsonConfig = loadJsonConfig(scriptDir);

  // 确定发布策略
  const method = options.method || loadPublishMethod(scriptDir, projectRoot);

  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 错误：文件不存在: ${filePath}`);
    process.exit(1);
  }

  if (!options.cover) {
    console.error("❌ 错误：必须指定 --cover 参数");
    console.error("   💡 封面图是微信公众号文章必需的");
    printUsage();
  }

  const ext = path.extname(filePath).toLowerCase();
  if (![".md", ".html"].includes(ext)) {
    console.error(`❌ 错误：不支持的文件格式: ${ext}（支持 .md, .html）`);
    process.exit(1);
  }

  console.log("🚀 微信公众号发布\n");
  console.log(`📋 配置：`);
  console.log(`   发布策略: ${method}`);
  console.log(`   文件: ${path.basename(filePath)}\n`);

  // Step 1: Markdown → HTML 转换
  let htmlFilePath = filePath;
  let extractedTitle = options.title;
  let extractedAuthor = options.author;
  let extractedSummary = options.summary;

  if (ext === ".md") {
    console.log("📝 Step 1: Markdown → HTML\n");

    // 使用 sibling skill: baoyu-markdown-to-html
    const mdToHtmlScript = path.resolve(scriptDir, "../../baoyu-markdown-to-html/scripts/main.ts");
    if (!fs.existsSync(mdToHtmlScript)) {
      console.error(`❌ 依赖的 skill 不存在: baoyu-markdown-to-html`);
      console.error(`   期望路径: ${mdToHtmlScript}`);
      console.error(`   请确认 baoyu-markdown-to-html skill 已安装`);
      process.exit(1);
    }

    // 主题：CLI > jsonConfig > 默认
    const theme = options.theme || jsonConfig?.publish?.theme || "default";
    console.log(`   主题: ${theme}`);

    const bunResult = runBunScript(mdToHtmlScript, [filePath, "--theme", theme]);
    const convertResult = { success: bunResult.status === 0, output: (bunResult.stdout || "") + (bunResult.stderr || "") };

    if (!convertResult.success) {
      console.error("❌ Markdown 转换失败");
      console.error(convertResult.output);
      process.exit(1);
    }

    try {
      const jsonMatch = convertResult.output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        htmlFilePath = result.htmlPath;
        if (!extractedTitle && result.title) extractedTitle = result.title;
        if (!extractedSummary && result.summary) extractedSummary = result.summary;
        if (!extractedAuthor && result.author) extractedAuthor = result.author;
      }
    } catch {
      htmlFilePath = filePath.replace(/\.md$/i, ".html");
    }

    if (!fs.existsSync(htmlFilePath)) {
      console.error(`❌ HTML 文件不存在: ${htmlFilePath}`);
      process.exit(1);
    }

    console.log(`   ✅ 转换成功: ${path.basename(htmlFilePath)}\n`);
  } else {
    console.log("📄 Step 1: 使用现有 HTML\n");
  }

  if (!extractedTitle) {
    extractedTitle = path.basename(filePath, ext);
    console.log(`⚠️  使用文件名作为标题: ${extractedTitle}\n`);
  }

  // Step 2: 发布
  const coverPath = options.cover;
  console.log(`🖼️  封面: ${path.basename(coverPath)}`);
  console.log(`📤 Step 2: 发布 (${method})\n`);

  if (options.dryRun) {
    console.log("   (预览模式，不实际发布)\n");
    console.log(JSON.stringify({
      method,
      title: extractedTitle,
      author: extractedAuthor,
      summary: extractedSummary,
      htmlFilePath,
      coverPath,
    }, null, 2));
    return;
  }

  const publisher = createPublisher(method);
  const publishOptions: PublishOptions = {
    title: extractedTitle,
    author: extractedAuthor,
    summary: extractedSummary,
    htmlFilePath,
    coverPath,
    submit: options.submit,
    theme: options.theme,
  };

  const result = await publisher.publish(publishOptions);

  if (result.success) {
    console.log("\n" + "=".repeat(50));
    console.log(`✅ 发布成功！${result.message}`);
    console.log("👉 请登录 https://mp.weixin.qq.com 查看草稿");
    console.log("=".repeat(50));
  } else {
    console.error(`\n❌ 发布失败: ${result.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
