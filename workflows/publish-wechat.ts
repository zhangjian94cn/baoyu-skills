#!/usr/bin/env bun
/**
 * 微信公众号发布 — 端到端 Workflow
 *
 * 编排 3 个 skill 完成从 Markdown 到微信公众号草稿的全流程：
 *   Step 1: 封面准备（手动提供 或 AI 生成）
 *   Step 2: Markdown → HTML 转换 + 发布
 *
 * 配置:
 *   workflows/config.json 定义每个步骤的默认方案，CLI 参数优先。
 *
 * 用法:
 *   npx -y bun workflows/publish-wechat.ts <file.md> --cover <cover.jpg> [options]
 *   npx -y bun workflows/publish-wechat.ts <file.md> --generate-cover [options]
 */

import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const isWindows = os.platform() === "win32";

// ============ 路径 ============

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.resolve(__dirname, "../skills");
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Skill 入口
const SKILL_SCRIPTS: Record<string, string> = {
  "image-gen": path.join(SKILLS_DIR, "baoyu-image-gen/scripts/main.ts"),
  "gemini-web": path.join(SKILLS_DIR, "baoyu-danger-gemini-web/scripts/main.ts"),
};
const PUBLISH_SCRIPT = path.join(SKILLS_DIR, "baoyu-post-to-wechat/scripts/main.ts");

// ============ 配置加载 ============

interface WorkflowConfig {
  cover: {
    autoGenerate: boolean;
    skill: string;
    provider: string;
    aspectRatio: string;
    defaultPromptPrefix: string;
  };
  convert: {
    theme: string;
  };
  publish: {
    method: string;
  };
}

const DEFAULT_CONFIG: WorkflowConfig = {
  cover: {
    autoGenerate: true,
    skill: "image-gen",
    provider: "google",
    aspectRatio: "2.35:1",
    defaultPromptPrefix: "A modern, clean cover image for: ",
  },
  convert: {
    theme: "default",
  },
  publish: {
    method: "remote",
  },
};

function loadConfig(): WorkflowConfig {
  const configPath = path.join(__dirname, "config.json");
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return {
        cover: { ...DEFAULT_CONFIG.cover, ...raw.cover },
        convert: { ...DEFAULT_CONFIG.convert, ...raw.convert },
        publish: { ...DEFAULT_CONFIG.publish, ...raw.publish },
      };
    }
  } catch (err) {
    console.error(`⚠️  config.json 解析失败，使用默认配置: ${err}`);
  }
  return DEFAULT_CONFIG;
}

// ============ CLI 解析 ============

interface WorkflowOptions {
  file: string;
  cover?: string;
  generateCover?: boolean;   // CLI 显式指定
  coverPrompt?: string;
  coverSkill?: string;
  coverProvider?: string;
  coverAspectRatio?: string;
  method?: string;
  title?: string;
  author?: string;
  summary?: string;
  theme?: string;
  submit?: boolean;
  dryRun?: boolean;
}

function printUsage(config: WorkflowConfig): never {
  console.log(`
微信公众号发布 — 端到端 Workflow

用法:
  npx -y bun workflows/publish-wechat.ts <file.md|file.html> [options]

封面选项:
  --cover <path>           手动指定封面图
  --generate-cover         强制 AI 生成封面
  --no-generate-cover      强制不生成封面
  --cover-prompt <text>    封面生成提示词（默认用文章标题）
  --cover-skill <skill>    封面生成 skill: image-gen | gemini-web（默认 ${config.cover.skill}）
  --cover-provider <p>     封面 AI provider: google | openai | dashscope（仅 image-gen）
  --cover-ar <ratio>       封面宽高比（默认 ${config.cover.aspectRatio}，仅 image-gen）

发布选项:
  --method <method>        发布策略: api | browser | remote（默认 ${config.publish.method}）
  --title <title>          文章标题（覆盖 frontmatter）
  --author <author>        作者
  --summary <text>         摘要
  --theme <name>           Markdown 主题: default | grace | simple（默认 ${config.convert.theme}）
  --submit                 浏览器模式下自动提交
  --dry-run                预览模式
  --help                   显示帮助

当前配置 (workflows/config.json):
  封面自动生成: ${config.cover.autoGenerate ? "✅" : "❌"}
  封面 skill:    ${config.cover.skill}
  封面 provider: ${config.cover.provider}${config.cover.skill === "image-gen" ? "" : "（未使用）"}
  封面宽高比:   ${config.cover.aspectRatio}
  Markdown 主题: ${config.convert.theme}
  发布策略:     ${config.publish.method}

示例:
  npx -y bun workflows/publish-wechat.ts article.md --cover cover.jpg
  npx -y bun workflows/publish-wechat.ts article.md --generate-cover
  npx -y bun workflows/publish-wechat.ts article.md   # 按 config.json 决定
`);
  process.exit(0);
}

function parseArgs(argv: string[]): WorkflowOptions {
  const config = loadConfig();
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage(config);
  }

  let file = "";
  let cover: string | undefined;
  let generateCover: boolean | undefined;
  let coverPrompt: string | undefined;
  let coverSkill: string | undefined;
  let coverProvider: string | undefined;
  let coverAspectRatio: string | undefined;
  let method: string | undefined;
  let title: string | undefined;
  let author: string | undefined;
  let summary: string | undefined;
  let theme: string | undefined;
  let submit = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--cover":
        cover = argv[++i];
        break;
      case "--generate-cover":
        generateCover = true;
        break;
      case "--no-generate-cover":
        generateCover = false;
        break;
      case "--cover-prompt":
        coverPrompt = argv[++i];
        break;
      case "--cover-skill":
        coverSkill = argv[++i];
        break;
      case "--cover-provider":
        coverProvider = argv[++i];
        break;
      case "--cover-ar":
        coverAspectRatio = argv[++i];
        break;
      case "--method":
        method = argv[++i];
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
    printUsage(config);
  }

  return { file, cover, generateCover, coverPrompt, coverSkill, coverProvider, coverAspectRatio, method, title, author, summary, theme, submit, dryRun };
}

// ============ 工具 ============

function run(cmd: string, args: string[], options?: { silent?: boolean; shell?: boolean }): { success: boolean; output: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    shell: options?.shell ?? true,
    cwd: PROJECT_ROOT,
  });

  const output = (result.stdout || "") + (result.stderr || "");
  if (!options?.silent) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  return { success: result.status === 0, output };
}

/** 跨平台调用 bun 脚本：Windows 直接用 bun（shell: false），其他系统用 npx -y bun（shell: true） */
function runBun(scriptArgs: string[], options?: { silent?: boolean }): { success: boolean; output: string } {
  if (isWindows) {
    return run("bun", scriptArgs, { ...options, shell: false });
  }
  return run("npx", ["-y", "bun", ...scriptArgs], options);
}

function extractTitleFromMarkdown(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1]!.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      if (titleMatch) return titleMatch[1]!;
    }
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1]!;
    return null;
  } catch {
    return null;
  }
}

// ============ 主流程 ============

async function main() {
  const config = loadConfig();
  const options = parseArgs(process.argv.slice(2));

  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  // 合并配置：CLI > config.json > 默认
  const shouldGenerateCover = options.cover
    ? false  // 有 --cover 就不生成
    : options.generateCover ?? config.cover.autoGenerate;

  const coverSkill = options.coverSkill || config.cover.skill;
  const coverProvider = options.coverProvider || config.cover.provider;
  const coverAR = options.coverAspectRatio || config.cover.aspectRatio;
  const publishMethod = options.method || config.publish.method;
  const mdTheme = options.theme || config.convert.theme;

  if (!options.cover && !shouldGenerateCover) {
    console.error("❌ 必须指定 --cover，或在 config.json 开启 cover.autoGenerate");
    process.exit(1);
  }

  console.log("🚀 微信公众号发布 Workflow\n");
  console.log(`   📄 文件:     ${path.basename(filePath)}`);
  console.log(`   🖼️  封面:     ${options.cover ? path.basename(options.cover) : `AI 自动生成 (${coverSkill}${coverSkill === "image-gen" ? " / " + coverProvider : ""})`}`);
  console.log(`   🎨 主题:     ${mdTheme}`);
  console.log(`   📤 发布策略: ${publishMethod}\n`);

  let coverPath = options.cover || "";

  // ── Step 1: 封面准备 ────────────────────────────────

  if (shouldGenerateCover && !coverPath) {
    console.log("═".repeat(50));
    console.log("🎨 Step 1: AI 生成封面\n");

    const skillScript = SKILL_SCRIPTS[coverSkill];
    if (!skillScript) {
      console.error(`❌ 未知的封面 skill: ${coverSkill}（可选: ${Object.keys(SKILL_SCRIPTS).join(", ")}）`);
      process.exit(1);
    }
    if (!fs.existsSync(skillScript)) {
      console.error(`❌ 依赖的 skill 不存在: ${coverSkill}`);
      console.error(`   期望路径: ${skillScript}`);
      process.exit(1);
    }

    const articleTitle = options.title || extractTitleFromMarkdown(filePath) || "tech blog article";
    const prompt = options.coverPrompt || `${config.cover.defaultPromptPrefix}${articleTitle}`;
    const coverOutput = path.join(path.dirname(filePath), "_ai_cover.png");

    console.log(`   Skill:    ${coverSkill}`);
    if (coverSkill === "image-gen") {
      console.log(`   Provider: ${coverProvider}`);
      console.log(`   宽高比:   ${coverAR}`);
    }
    console.log(`   提示词:   ${prompt}`);
    console.log(`   输出:     ${path.basename(coverOutput)}\n`);

    if (options.dryRun) {
      console.log("   (预览模式，跳过实际生成)\n");
      coverPath = coverOutput;
    } else {
      // 根据 skill 构建不同的命令参数
      let genArgs: string[];
      if (coverSkill === "image-gen") {
        genArgs = [
          skillScript,
          "--prompt", prompt,
          "--image", coverOutput,
          "--ar", coverAR,
          "--provider", coverProvider,
        ];
      } else {
        // gemini-web: 只支持 --prompt 和 --image
        genArgs = [
          skillScript,
          "--prompt", prompt,
          "--image", coverOutput,
        ];
      }

      const genResult = runBun(genArgs);

      if (!genResult.success) {
        console.error("\n❌ 封面生成失败");
        process.exit(1);
      }

      if (!fs.existsSync(coverOutput)) {
        console.error("❌ 封面文件未生成");
        process.exit(1);
      }

      coverPath = coverOutput;
      console.log(`\n   ✅ 封面已生成: ${path.basename(coverOutput)}\n`);
    }
  } else {
    console.log("═".repeat(50));
    console.log(`🖼️  Step 1: 使用指定封面 ${coverPath ? path.basename(coverPath) : "(无)"}\n`);

    if (coverPath && !options.dryRun && !fs.existsSync(path.resolve(coverPath))) {
      console.error(`❌ 封面文件不存在: ${coverPath}`);
      process.exit(1);
    }
  }

  // ── Step 2: 发布 ────────────────────────────────────

  console.log("═".repeat(50));
  console.log("📤 Step 2: 发布到微信公众号\n");

  if (!fs.existsSync(PUBLISH_SCRIPT)) {
    console.error(`❌ 依赖的 skill 不存在: baoyu-post-to-wechat`);
    console.error(`   期望路径: ${PUBLISH_SCRIPT}`);
    process.exit(1);
  }

  const publishArgs = [PUBLISH_SCRIPT, filePath, "--cover", coverPath];

  publishArgs.push("--method", publishMethod);
  publishArgs.push("--theme", mdTheme);
  if (options.title) publishArgs.push("--title", options.title);
  if (options.author) publishArgs.push("--author", options.author);
  if (options.summary) publishArgs.push("--summary", options.summary);
  if (options.submit) publishArgs.push("--submit");
  if (options.dryRun) publishArgs.push("--dry-run");

  const publishResult = runBun(publishArgs);

  if (!publishResult.success) {
    console.error("\n❌ 发布失败");
    process.exit(1);
  }

  console.log("\n" + "═".repeat(50));
  console.log("✅ Workflow 完成");
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
