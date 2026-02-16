#!/usr/bin/env bun
/**
 * 远程发布脚本 — 通过 SSH/SCP 上传并在远程服务器发布微信公众号文章
 *
 * ============ 运行环境要求 ============
 *
 * 【本地环境】
 *   - Node.js 18+ 或 Bun
 *   - SSH 客户端（已配置免密登录到远程服务器）
 *   - SCP 命令可用
 *
 * 【远程服务器】
 *   - 已安装 Bun (推荐) 或 Node.js
 *   - 已配置微信 API 凭证 (~/.baoyu-skills/.env)
 *   - 已安装 webp 工具（用于转换 WebP 图片）：sudo apt-get install webp
 *   - 服务器 IP 已添加到微信公众号 IP 白名单
 *
 * 【SSH 配置示例】~/.ssh/config
 *   Host tencent-server
 *       HostName your-server-ip
 *       User ubuntu
 *       IdentityFile ~/.ssh/id_ed25519
 *
 * ============ 用法示例 ============
 *
 *   npx -y bun wechat-remote-publish.ts article.html --title "文章标题" --cover "./cover.jpg"
 *   npx -y bun wechat-remote-publish.ts article.html --title "标题" --cover "https://example.com/cover.jpg"
 *   npx -y bun wechat-remote-publish.ts article.html --title "标题" --cover "/home/ubuntu/cover.png"
 */

import path from "node:path";
import fs from "node:fs";
import { getScriptDir, getProjectRoot, loadRemoteConfig, type RemoteConfig } from "./config.ts";
import { runSsh, runScp, isUrl, isRemotePath } from "./command.ts";

// ============ 类型定义 ============

type Config = RemoteConfig;

interface Options {
  file: string;
  title?: string;
  author?: string;
  summary?: string;
  cover?: string;
  dryRun?: boolean;
}

// ============ 参数解析 ============

function parseArgs(args: string[]): Options {
  const options: Options = { file: "" };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title" && args[i + 1]) {
      options.title = args[++i];
    } else if (arg === "--author" && args[i + 1]) {
      options.author = args[++i];
    } else if (arg === "--summary" && args[i + 1]) {
      options.summary = args[++i];
    } else if (arg === "--cover" && args[i + 1]) {
      options.cover = args[++i];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (!arg.startsWith("--") && !options.file) {
      options.file = arg;
    }
  }

  return options;
}

function printUsage(): never {
  console.log(`
远程发布脚本 - 一键上传并发布到微信公众号

用法：
  npx -y bun wechat-remote-publish.ts <file> [options]

参数：
  file                  本地 HTML 文件路径

必填选项：
  --title <title>       文章标题
  --cover <path|url>    封面图（支持本地路径、远程服务器路径或网络 URL）

可选：
  --author <author>     作者名
  --summary <summary>   文章摘要
  --dry-run             预览模式，不实际发布

封面图说明：
  - 本地路径：自动上传到服务器并检测格式
  - 远程路径：直接使用服务器上的文件
  - 网络 URL：直接使用 URL
  - WebP 格式：自动转换为 PNG（需要服务器安装 webp 工具）

配置：
  远程服务器配置通过 config.json 的 remote section 或 .env 设置：
    REMOTE_SERVER_HOST=tencent-server
    REMOTE_SERVER_DIR=~/baoyu-skills
    REMOTE_SERVER_BUN_PATH=~/.bun/bin/bun
`);
  process.exit(1);
}

// ============ 远程工具函数 ============

/**
 * 展开远程服务器上的 ~ 路径，返回绝对路径。
 * 通过 SSH 在远程执行 echo，由远程 shell 自动展开 ~。
 */
function expandRemoteDir(config: Config): string {
  const result = runSsh(config.remoteHost, `echo ${config.remoteDir}`, { silent: true });
  return result.output.trim() || "/home/ubuntu/baoyu-skills";
}

/**
 * 查询远程文件类型（通过 file 命令）
 */
function getRemoteFileType(remotePath: string, config: Config): string {
  const result = runSsh(config.remoteHost, `file '${remotePath}'`, { silent: true });
  return result.output.toLowerCase();
}

/**
 * 尝试在远程服务器将 WebP 图片转换为 PNG
 *
 * @returns 转换后的路径，失败则返回原路径
 */
function convertWebpOnRemote(remotePath: string, config: Config): string {
  const fileType = getRemoteFileType(remotePath, config);
  if (!fileType.includes("webp") && !fileType.includes("web/p") && !fileType.includes("riff")) {
    return remotePath;
  }

  console.log("⚠️  检测到 WebP 格式，正在转换为 PNG...");
  const pngPath = remotePath.replace(/\.[^.]+$/, "_converted.png");
  const convertResult = runSsh(
    config.remoteHost,
    `dwebp '${remotePath}' -o '${pngPath}' 2>&1`,
    { silent: true }
  );

  if (convertResult.success && convertResult.output.includes("Saved")) {
    console.log(`✅ 已转换为 PNG 格式`);
    return pngPath;
  }

  // 检查 dwebp 是否可用
  const checkResult = runSsh(config.remoteHost, `which dwebp`, { silent: true });
  if (!checkResult.success) {
    console.error("❌ 服务器未安装 webp 工具，请先安装：sudo apt-get install webp");
    process.exit(1);
  }
  console.warn("⚠️  转换可能未成功，将尝试使用原文件");
  return remotePath;
}

// ============ Step 1.5: 上传正文内嵌图片 ============

/**
 * 扫描 HTML 中 data-local-path 引用的本地图片，上传到远程服务器，
 * 并重写 HTML 中的路径指向远程位置。
 *
 * @returns 更新后的 HTML 内容（如果没有图片则返回原内容）
 */
function uploadContentImages(
  htmlContent: string,
  config: Config,
  expandedRemoteDir: string
): string {
  // 提取所有 data-local-path 引用的本地文件
  const localPathRegex = /data-local-path=["']([^"']+)["']/g;
  const localPaths: string[] = [];
  let lpMatch;
  while ((lpMatch = localPathRegex.exec(htmlContent)) !== null) {
    const lp = lpMatch[1]!;
    if (fs.existsSync(lp) && !localPaths.includes(lp)) {
      localPaths.push(lp);
    }
  }

  if (localPaths.length === 0) return htmlContent;

  console.log(`🖼️  检测到 ${localPaths.length} 张正文内嵌图片，正在上传...\n`);

  const remoteImgDir = `${expandedRemoteDir}/_content_images`;
  runSsh(config.remoteHost, `mkdir -p '${remoteImgDir}'`, { silent: true });

  let updatedHtml = htmlContent;
  let uploadedCount = 0;

  for (const lp of localPaths) {
    const imgName = path.basename(lp);
    const remotePath = `${remoteImgDir}/${imgName}`;

    console.log(`   📤 ${imgName}`);
    const result = runScp(lp, `${config.remoteHost}:${remotePath}`, { silent: true });

    if (result.success) {
      // 对整个 <img> 标签做替换，同时更新 src 和 data-local-path
      const escapedPath = lp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imgTagRegex = new RegExp(`<img[^>]*data-local-path=["']${escapedPath}["'][^>]*>`, 'g');
      updatedHtml = updatedHtml.replace(imgTagRegex, (tag) => {
        return tag
          .replace(/\ssrc=["'][^"']*["']/, ` src="${remotePath}"`)
          .replace(/data-local-path=["'][^"']*["']/, `data-local-path="${remotePath}"`);
      });
      uploadedCount++;
    } else {
      console.error(`   ❌ 上传失败: ${imgName}`);
    }
  }

  console.log(`\n   ✅ ${uploadedCount}/${localPaths.length} 张图片上传成功\n`);
  return updatedHtml;
}

// ============ Step 2: 封面图处理 ============

/**
 * 处理封面图：根据来源（URL、远程路径、本地文件）决定上传 / 转换策略，
 * 返回远程服务器上可用的封面路径。
 */
function uploadAndPrepareCover(
  cover: string,
  config: Config,
  expandedRemoteDir: string
): string {
  // 1. 网络 URL — 直接使用
  if (isUrl(cover)) {
    console.log(`🖼️  使用网络封面图: ${cover}`);
    return cover;
  }

  // 2. 远程服务器路径 — 检测格式并转换
  if (isRemotePath(cover)) {
    console.log(`🖼️  使用远程封面图: ${cover}`);
    return convertWebpOnRemote(cover, config);
  }

  // 3. 本地文件 — 上传 + 检测格式
  const coverPath = path.resolve(cover);
  if (!fs.existsSync(coverPath)) {
    console.error(`❌ 错误：封面图不存在: ${coverPath}`);
    process.exit(1);
  }

  const coverFileName = path.basename(coverPath);
  console.log(`📤 上传封面图到服务器: ${coverFileName}`);

  const scpResult = runScp(coverPath, `${config.remoteHost}:${config.remoteDir}/`, { silent: true });
  if (!scpResult.success) {
    console.error("❌ 封面图上传失败");
    console.error(scpResult.output);
    process.exit(1);
  }
  console.log("✅ 封面图上传成功");

  const remoteCoverPath = `${expandedRemoteDir}/${coverFileName}`;
  const converted = convertWebpOnRemote(remoteCoverPath, config);
  console.log("");
  return converted;
}

// ============ Step 3: 构建远程命令 ============

/**
 * 构建在远程服务器执行的发布命令。
 * 使用 shell 单引号转义防止参数注入。
 */
function buildRemoteCommand(
  config: Config,
  fileName: string,
  remoteCoverPath: string,
  options: Options
): string {
  const shellEscape = (s: string) => s.replace(/'/g, "'\\''");

  let cmd = `cd ${config.remoteDir} && ${config.bunPath} scripts/wechat-api.ts ${fileName}`;
  cmd += ` --title '${shellEscape(options.title!)}'`;

  if (options.author) {
    cmd += ` --author '${shellEscape(options.author)}'`;
  }
  if (options.summary) {
    cmd += ` --summary '${shellEscape(options.summary)}'`;
  }
  cmd += ` --cover '${remoteCoverPath}'`;

  if (options.dryRun) {
    cmd += " --dry-run";
  }

  return cmd;
}

// ============ 主流程 ============

async function main() {
  const config = loadConfig();
  const options = parseArgs(process.argv.slice(2));

  // 验证参数
  if (!options.file) printUsage();
  if (!options.title) {
    console.error("❌ 错误：必须指定 --title 参数");
    printUsage();
  }
  if (!options.cover) {
    console.error("❌ 错误：必须指定 --cover 参数（封面图 URL 或本地路径）");
    printUsage();
  }

  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 错误：文件不存在: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);

  console.log("🚀 开始远程发布流程...\n");
  console.log(`📋 配置信息：`);
  console.log(`   远程主机: ${config.remoteHost}`);
  console.log(`   远程目录: ${config.remoteDir}\n`);

  // ━━━ Step 1: 上传 HTML 文件 ━━━
  console.log(`📤 上传文件到服务器: ${fileName}`);
  const scpResult = runScp(filePath, `${config.remoteHost}:${config.remoteDir}/`, { silent: true });
  if (!scpResult.success) {
    console.error("❌ 文件上传失败");
    console.error(scpResult.output);
    process.exit(1);
  }
  console.log("✅ 文件上传成功\n");

  // 展开远程 ~ 路径（只做一次，后续复用）
  const expandedRemoteDir = expandRemoteDir(config);

  // ━━━ Step 1.5: 上传正文内嵌图片 ━━━
  const htmlContent = fs.readFileSync(filePath, "utf-8");
  const updatedHtml = uploadContentImages(htmlContent, config, expandedRemoteDir);

  if (updatedHtml !== htmlContent) {
    // HTML 被修改，重新上传
    const tempPath = filePath + ".remote-patched.html";
    fs.writeFileSync(tempPath, updatedHtml, "utf-8");
    const reupload = runScp(tempPath, `${config.remoteHost}:${config.remoteDir}/${fileName}`, { silent: true });
    fs.unlinkSync(tempPath);

    if (!reupload.success) {
      console.error("   ⚠️  更新后的 HTML 重新上传失败，图片路径可能不正确");
    }
  }

  // ━━━ Step 2: 封面图处理 ━━━
  const remoteCoverPath = uploadAndPrepareCover(options.cover!, config, expandedRemoteDir);

  // ━━━ Step 3: 远程执行发布 ━━━
  const remoteCmd = buildRemoteCommand(config, fileName, remoteCoverPath, options);

  console.log("📡 在服务器上执行发布...");
  if (options.dryRun) {
    console.log("(预览模式，不会实际发布)\n");
  }

  const sshResult = runSsh(config.remoteHost, remoteCmd);

  if (!sshResult.success) {
    console.error("\n❌ 发布失败");
    diagnoseError(sshResult.output);
    process.exit(1);
  }

  console.log("\n✅ 发布成功！文章已保存到草稿箱。");
  console.log("👉 请登录 https://mp.weixin.qq.com 查看草稿。");
}

/** 分析常见错误，给出提示 */
function diagnoseError(output: string) {
  if (output.includes("40113")) {
    console.error("\n💡 提示：错误 40113 表示图片格式不支持");
    console.error("   微信仅支持 JPG、PNG、GIF 格式，请确保封面图不是 WebP 格式");
  } else if (output.includes("not in whitelist")) {
    console.error("\n💡 提示：服务器 IP 不在微信公众号白名单中");
    console.error("   请在 mp.weixin.qq.com 添加服务器 IP 到白名单");
  } else if (output.includes("access_token")) {
    console.error("\n💡 提示：API 凭证可能已过期或无效");
    console.error("   请检查 .env 或 ~/.baoyu-skills/.env 中的 WECHAT_APP_ID 和 WECHAT_APP_SECRET");
  }
}

// ============ 配置加载 ============

function loadConfig(): Config {
  const scriptDir = getScriptDir(import.meta.url);
  const projectRoot = path.resolve(scriptDir, "../../../../");
  return loadRemoteConfig(projectRoot);
}

// ============ 启动 ============

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
