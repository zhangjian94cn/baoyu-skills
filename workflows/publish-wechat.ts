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
  inlineImages: {
    enabled: boolean;
    skill: string;
    provider: string;
    defaultAspectRatio: string;
    quality: string;
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
  inlineImages: {
    enabled: true,
    skill: "image-gen",
    provider: "google",
    defaultAspectRatio: "4:3",
    quality: "2k",
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
        inlineImages: { ...DEFAULT_CONFIG.inlineImages, ...raw.inlineImages },
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
  coverRef?: string;         // 封面参考风格图
  coverSkill?: string;
  coverProvider?: string;
  coverAspectRatio?: string;
  noInlineImages?: boolean;  // --no-inline-images 跳过正文插图生成
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
  --cover-ref <path>       封面参考风格图（相对于文章文件）
  --cover-skill <skill>    封面生成 skill: image-gen | gemini-web（默认 ${config.cover.skill}）
  --cover-provider <p>     封面 AI provider: google | openai | dashscope（仅 image-gen）
  --cover-ar <ratio>       封面宽高比（默认 ${config.cover.aspectRatio}，仅 image-gen）

发布选项:
  --method <method>        发布策略: api | browser | remote（默认 ${config.publish.method}）
  --title <title>          文章标题（覆盖 frontmatter）
  --author <author>        作者
  --summary <text>         摘要
  --theme <name>           Markdown 主题: default | grace | simple（默认 ${config.convert.theme}）
  --no-inline-images       跳过正文 image-gen 插图生成
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
  let coverRef: string | undefined;
  let coverSkill: string | undefined;
  let coverProvider: string | undefined;
  let coverAspectRatio: string | undefined;
  let method: string | undefined;
  let title: string | undefined;
  let author: string | undefined;
  let summary: string | undefined;
  let theme: string | undefined;
  let noInlineImages = false;
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
      case "--cover-ref":
        coverRef = argv[++i];
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
      case "--no-inline-images":
        noInlineImages = true;
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

  return { file, cover, generateCover, coverPrompt, coverRef, coverSkill, coverProvider, coverAspectRatio, noInlineImages, method, title, author, summary, theme, submit, dryRun };
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

/** 从 Markdown 文件的 frontmatter 中提取关键字段 */
function extractFrontmatter(filePath: string): {
  title?: string;
  cover?: string;
  coverPrompt?: string;
  coverRef?: string;
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      // 没有 frontmatter，尝试从 h1 提取标题
      const h1Match = content.match(/^#\s+(.+)$/m);
      return { title: h1Match?.[1] || undefined };
    }

    const fm = fmMatch[1]!;
    const getField = (key: string) => {
      const m = fm.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
      return m?.[1] || undefined;
    };

    return {
      title: getField('title'),
      cover: getField('cover'),
      coverPrompt: getField('cover-prompt'),
      coverRef: getField('cover-ref'),
    };
  } catch {
    return {};
  }
}

// ============ 正文插图解析与生成 ============

interface ImageGenBlock {
  /** 原始代码块完整匹配文本 */
  raw: string;
  /** 图片内容描述 (prompt) */
  content: string;
  /** 参考风格图路径列表 (相对于 md 文件) */
  ref: string[];
  /** 用户指定的输出图片路径 (相对于 md 文件) */
  image?: string;
  /** 宽高比 */
  ar?: string;
  /** AI provider */
  provider?: string;
  /** 模型 ID */
  model?: string;
  /** 质量 */
  quality?: string;
  /** 显式尺寸 */
  size?: string;
  /** 替换后的 alt 文字 */
  alt?: string;
  /** 人物生成控制 */
  personGen?: string;
  /** 是否启用 Google Search */
  googleSearch?: boolean;
  /** 生成后的图片路径 (绝对路径，运行时填充) */
  outputPath?: string;
}

/**
 * 解析 YAML-like 的代码块内容。
 * 支持多行值（key: |\n  ...）和单行值（key: value）。
 */
function parseYamlLike(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let currentKey = "";
  let currentValue = "";
  let multiLine = false;

  const flush = () => {
    if (currentKey) {
      result[currentKey] = currentValue.trim();
    }
  };

  for (const line of lines) {
    const kvMatch = line.match(/^([\w-]+):\s*(.*)$/);
    if (kvMatch && !multiLine) {
      flush();
      currentKey = kvMatch[1]!;
      const val = kvMatch[2]!.trim();
      if (val === "|" || val === "|-") {
        multiLine = true;
        currentValue = "";
      } else {
        multiLine = false;
        currentValue = val;
      }
    } else if (kvMatch && multiLine && !line.startsWith(" ") && !line.startsWith("\t")) {
      // 新的顶级 key，结束多行
      flush();
      currentKey = kvMatch[1]!;
      const val = kvMatch[2]!.trim();
      if (val === "|" || val === "|-") {
        multiLine = true;
        currentValue = "";
      } else {
        multiLine = false;
        currentValue = val;
      }
    } else if (multiLine) {
      currentValue += (currentValue ? "\n" : "") + line.replace(/^  /, "");
    }
  }
  flush();
  return result;
}

/** 解析 Markdown 中所有 ```image-gen ... ``` 代码块 */
function parseImageGenBlocks(mdContent: string, mdDir: string): ImageGenBlock[] {
  const pattern = /```image-gen\s*\n([\s\S]*?)```/g;
  const blocks: ImageGenBlock[] = [];
  let match;

  while ((match = pattern.exec(mdContent)) !== null) {
    const raw = match[0]!;
    const body = match[1]!;
    const fields = parseYamlLike(body);

    if (!fields["content"]) {
      console.warn(`⚠️  跳过缺少 content 字段的 image-gen 块`);
      continue;
    }

    const refField = fields["ref"] || "";
    const refs = refField
      ? refField.split(/,\s*/).map(r => path.resolve(mdDir, r.trim())).filter(Boolean)
      : [];

    blocks.push({
      raw,
      content: fields["content"]!,
      ref: refs,
      image: fields["image"],
      ar: fields["ar"],
      provider: fields["provider"],
      model: fields["model"],
      quality: fields["quality"],
      size: fields["size"],
      alt: fields["alt"],
      personGen: fields["person-gen"],
      googleSearch: fields["google-search"] === "true",
    });
  }

  return blocks;
}

/** 调用 baoyu-image-gen 生成每个 image-gen 块对应的图片 */
function generateInlineImages(
  blocks: ImageGenBlock[],
  config: WorkflowConfig,
  mdDir: string,
  dryRun: boolean,
): ImageGenBlock[] {
  const skillScript = SKILL_SCRIPTS[config.inlineImages.skill];
  if (!skillScript) {
    console.error(`❌ 未知的插图 skill: ${config.inlineImages.skill}`);
    process.exit(1);
  }
  if (!fs.existsSync(skillScript)) {
    console.error(`❌ 依赖的 skill 不存在: ${config.inlineImages.skill}`);
    process.exit(1);
  }

  const outputDir = path.join(mdDir, "_gen_images");
  if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const idx = String(i + 1).padStart(2, "0");
    // 优先使用用户指定的 image 路径，否则自动分配
    const outputFile = block.image
      ? path.resolve(mdDir, block.image)
      : path.join(outputDir, `img_${idx}.png`);
    block.outputPath = outputFile;

    // 确保输出目录存在
    if (!dryRun) {
      const outDir = path.dirname(outputFile);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
    }

    const provider = block.provider || config.inlineImages.provider;
    const ar = block.ar || config.inlineImages.defaultAspectRatio;
    const quality = block.quality || config.inlineImages.quality;

    console.log(`   [${idx}/${String(blocks.length).padStart(2, "0")}] 生成插图...`);
    console.log(`        Prompt:   ${block.content.split("\n")[0]}${block.content.includes("\n") ? "..." : ""}`);
    if (block.ref.length > 0) {
      console.log(`        Ref:      ${block.ref.map(r => path.basename(r)).join(", ")}`);
    }
    console.log(`        Provider: ${provider} | AR: ${ar} | Quality: ${quality}`);
    console.log(`        Output:   ${path.relative(mdDir, outputFile)}`);

    if (dryRun) {
      console.log(`        (预览模式，跳过实际生成)\n`);
      continue;
    }

    // 已存在则跳过，避免重复调用昂贵的生成 API
    if (fs.existsSync(outputFile)) {
      console.log(`        ⏭️  已存在，跳过生成\n`);
      continue;
    }

    // 构建命令参数
    // 多行 prompt 写入临时文件，避免 shell 转义问题
    const promptFile = path.join(outputDir, `_prompt_${idx}.txt`);
    fs.writeFileSync(promptFile, block.content, "utf-8");

    const genArgs: string[] = [
      skillScript,
      "--promptfiles", promptFile,
      "--image", outputFile,
      "--ar", ar,
      "--provider", provider,
      "--quality", quality,
    ];

    if (block.model) genArgs.push("--model", block.model);
    if (block.size) genArgs.push("--size", block.size);
    if (block.personGen) genArgs.push("--person-gen", block.personGen);
    if (block.googleSearch) genArgs.push("--google-search");

    // 参考图
    if (block.ref.length > 0) {
      genArgs.push("--ref", ...block.ref);
    }

    const genResult = runBun(genArgs);

    if (!genResult.success) {
      console.error(`\n   ❌ 插图 ${idx} 生成失败，继续处理下一张...\n`);
      block.outputPath = undefined;
      continue;
    }

    if (!fs.existsSync(outputFile)) {
      console.error(`   ❌ 插图文件未生成: ${outputFile}`);
      block.outputPath = undefined;
      continue;
    }

    console.log(`        ✅ 生成完成\n`);
  }

  return blocks;
}

/** 将 image-gen 块替换为 ![alt](path) 并返回新内容 */
function replaceImageBlocks(mdContent: string, blocks: ImageGenBlock[], mdDir: string): string {
  let result = mdContent;

  for (const block of blocks) {
    if (!block.outputPath) {
      // 生成失败，保留原始代码块
      continue;
    }

    const relPath = path.relative(mdDir, block.outputPath);
    const altText = block.alt || block.content.split("\n")[0]!.slice(0, 60);
    const imageMarkdown = `![${altText}](${relPath})`;
    result = result.replace(block.raw, imageMarkdown);
  }

  return result;
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

  // 合并配置：CLI > frontmatter > config.json > 默认
  // 从 frontmatter 读取 cover 相关字段（仅 .md 文件）
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") {
    const fm = extractFrontmatter(filePath);
    // cover: frontmatter 指定的封面图（CLI --cover 优先）
    if (!options.cover && fm.cover) {
      const fmCover = fm.cover.startsWith("http") ? fm.cover : path.resolve(path.dirname(filePath), fm.cover);
      if (fm.cover.startsWith("http") || fs.existsSync(fmCover)) {
        options.cover = fmCover;
      }
    }
    // cover-prompt / cover-ref: frontmatter 指定的封面生成参数
    if (!options.coverPrompt && fm.coverPrompt) options.coverPrompt = fm.coverPrompt;
    if (!options.coverRef && fm.coverRef) options.coverRef = fm.coverRef;
  }

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

    const articleTitle = options.title || extractFrontmatter(filePath).title || "tech blog article";
    const prompt = options.coverPrompt || `${config.cover.defaultPromptPrefix}${articleTitle}`;
    const coverRef = options.coverRef;
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
        if (coverRef) {
          const refPath = path.resolve(path.dirname(filePath), coverRef);
          genArgs.push("--ref", refPath);
        }
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

  // ── Step 1.5: 正文插图生成 ─────────────────────────

  let processedFilePath = filePath;  // 传给 Step 2 的文件路径

  const shouldGenerateInline = !options.noInlineImages && config.inlineImages.enabled;

  if (shouldGenerateInline && filePath.endsWith(".md")) {
    const mdContent = fs.readFileSync(filePath, "utf-8");
    const mdDir = path.dirname(filePath);
    const blocks = parseImageGenBlocks(mdContent, mdDir);

    if (blocks.length > 0) {
      console.log("═".repeat(50));
      console.log(`🖼️  Step 1.5: 正文插图生成（检测到 ${blocks.length} 个 image-gen 块）\n`);

      generateInlineImages(blocks, config, mdDir, !!options.dryRun);

      // 替换并写入临时文件（保留原文不变）
      const newContent = replaceImageBlocks(mdContent, blocks, mdDir);
      const tempPath = filePath.replace(/\.md$/, "._processed.md");
      fs.writeFileSync(tempPath, newContent, "utf-8");
      processedFilePath = tempPath;

      const generated = blocks.filter(b => b.outputPath).length;
      console.log(`   📊 结果: ${generated}/${blocks.length} 张插图生成成功`);
      console.log(`   📄 处理后文件: ${path.basename(tempPath)}\n`);
    } else {
      console.log("═".repeat(50));
      console.log("🖼️  Step 1.5: 未检测到 image-gen 块，跳过\n");
    }
  } else if (shouldGenerateInline && !filePath.endsWith(".md")) {
    console.log("═".repeat(50));
    console.log("🖼️  Step 1.5: 非 Markdown 文件，跳过插图生成\n");
  }

  // ── Step 2: 发布 ────────────────────────────────────

  console.log("═".repeat(50));
  console.log("📤 Step 2: 发布到微信公众号\n");

  if (!fs.existsSync(PUBLISH_SCRIPT)) {
    console.error(`❌ 依赖的 skill 不存在: baoyu-post-to-wechat`);
    console.error(`   期望路径: ${PUBLISH_SCRIPT}`);
    process.exit(1);
  }

  const publishArgs = [PUBLISH_SCRIPT, processedFilePath, "--cover", coverPath];

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
