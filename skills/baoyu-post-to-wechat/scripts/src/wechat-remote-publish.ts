#!/usr/bin/env bun
/**
 * 远程发布脚本 - 一键上传并发布到微信公众号
 * 
 * ============ 运行环境要求 ============
 * 
 * 【工作目录】
 *   必须在 skills/baoyu-post-to-wechat/scripts/ 目录下运行
 * 
 *   Windows (PowerShell):
 *   cd skills/baoyu-post-to-wechat/scripts; npx -y bun wechat-remote-publish.ts ...
 * 
 *   macOS/Linux (Bash/Zsh):
 *   cd skills/baoyu-post-to-wechat/scripts && npx -y bun wechat-remote-publish.ts ...
 * 
 * 【本地环境】
 *   - Node.js 18+ 或 Bun
 *   - SSH 客户端（已配置免密登录到远程服务器）
 *   - SCP 命令可用
 * 
 * 【远程服务器】
 *   - 已配置 SSH 免密登录（建议在 ~/.ssh/config 中配置别名）
 *   - 已安装 Bun (推荐) 或 Node.js
 *   - 已配置微信 API 凭证 (~/.baoyu-skills/.env)
 *   - 已安装 webp 工具（用于转换 WebP 图片）：sudo apt-get install webp
 *   💡 一键配置：npx -y bun setup-remote.ts
 *   - 服务器 IP 已添加到微信公众号 IP 白名单
 * 
 * 【SSH 配置示例】~/.ssh/config
 *   Host tencent-server
 *       HostName your-server-ip
 *       User ubuntu
 *       IdentityFile ~/.ssh/id_ed25519
 * 
 * ============ 功能特性 ============
 * 
 * - 自动上传本地封面图到服务器
 * - 自动检测并转换 WebP 格式图片为 PNG
 * - 支持从配置文件读取远程服务器设置
 * - 智能错误处理和提示
 * 
 * ============ 用法示例 ============
 * 
 *   # 基本用法（在 scripts 目录下运行）
 *   npx -y bun wechat-remote-publish.ts article.html --title "文章标题" --cover "./cover.jpg"
 *   
 *   # 使用网络图片作为封面
 *   npx -y bun wechat-remote-publish.ts article.html --title "标题" --cover "https://example.com/cover.jpg"
 *   
 *   # 使用服务器上已有的图片
 *   npx -y bun wechat-remote-publish.ts article.html --title "标题" --cover "/home/ubuntu/cover.png"
 */

import path from "node:path";
import fs from "node:fs";
import { getScriptDir, getProjectRoot, loadRemoteConfig, type RemoteConfig } from "./config.ts";
import { runCommand, isUrl, isRemotePath, isWindows } from "./command.ts";

// ============ 配置 ============
type Config = RemoteConfig;

function loadConfig(): Config {
  const scriptDir = getScriptDir(import.meta.url);
  const projectRoot = path.resolve(scriptDir, "../../../../");
  return loadRemoteConfig(projectRoot);
}

// ============ 工具函数 ============
interface Options {
  file: string;
  title?: string;
  author?: string;
  summary?: string;
  cover?: string;
  dryRun?: boolean;
}

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

function getFileType(filePath: string, config: Config): string {
  const result = runCommand("ssh", [config.remoteHost, `file '${filePath}'`], { silent: true, shell: !isWindows });
  return result.output.toLowerCase();
}

function printUsage() {
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

配置文件（可选）：
  ~/.baoyu-skills/.env 或 .baoyu-skills/.env
  支持的配置项：
    REMOTE_SERVER_HOST=tencent-server
    REMOTE_SERVER_DIR=~/baoyu-skills
    REMOTE_SERVER_BUN_PATH=~/.bun/bin/bun

示例：
  npx -y bun wechat-remote-publish.ts article.html --title "我的文章" --cover "./cover.jpg"
  npx -y bun wechat-remote-publish.ts post.html --title "标题" --cover "/home/ubuntu/cover.png"
  npx -y bun wechat-remote-publish.ts post.html --title "标题" --cover "https://example.com/cover.jpg"
`);
}

// ============ 主流程 ============
async function main() {
  const config = loadConfig();
  const options = parseArgs(process.argv.slice(2));
  
  // 验证参数
  if (!options.file) {
    printUsage();
    process.exit(1);
  }
  
  if (!options.title) {
    console.error("❌ 错误：必须指定 --title 参数");
    printUsage();
    process.exit(1);
  }
  
  if (!options.cover) {
    console.error("❌ 错误：必须指定 --cover 参数（封面图 URL 或本地路径）");
    console.error("   提示：封面图是微信公众号文章必需的，可以使用本地图片或网络 URL");
    printUsage();
    process.exit(1);
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
  
  // Step 1: 上传 HTML 文件到服务器
  console.log(`📤 上传文件到服务器: ${fileName}`);
  const scpResult = runCommand("scp", [filePath, `${config.remoteHost}:${config.remoteDir}/`], { silent: true, shell: !isWindows });
  if (!scpResult.success) {
    console.error("❌ 文件上传失败");
    console.error(scpResult.output);
    process.exit(1);
  }
  console.log("✅ 文件上传成功\n");
  
  // Step 2: 处理封面图
  let remoteCoverPath = options.cover;
  
  if (isUrl(options.cover)) {
    // 网络 URL，直接使用
    console.log(`🖼️  使用网络封面图: ${options.cover}`);
  } else if (isRemotePath(options.cover)) {
    // 远程服务器路径
    console.log(`🖼️  使用远程封面图: ${options.cover}`);
    
    // 检测文件格式
    const fileType = getFileType(options.cover, config);
    if (fileType.includes("webp") || fileType.includes("web/p")) {
      console.log("⚠️  检测到 WebP 格式，正在转换为 PNG...");
      const pngPath = options.cover.replace(/\.[^.]+$/, "_converted.png");
      const convertResult = runCommand("ssh", [
        config.remoteHost,
        `dwebp '${options.cover}' -o '${pngPath}' 2>/dev/null || cp '${options.cover}' '${pngPath}'`
      ], { silent: true, shell: !isWindows });
      if (convertResult.success) {
        remoteCoverPath = pngPath;
        console.log(`✅ 已转换为: ${pngPath}`);
      } else {
        console.warn("⚠️  转换失败，将尝试使用原文件");
      }
    }
  } else {
    // 本地文件路径
    const coverPath = path.resolve(options.cover);
    if (!fs.existsSync(coverPath)) {
      console.error(`❌ 错误：封面图不存在: ${coverPath}`);
      process.exit(1);
    }
    
    const coverFileName = path.basename(coverPath);
    console.log(`📤 上传封面图到服务器: ${coverFileName}`);
    
    const coverScpResult = runCommand("scp", [coverPath, `${config.remoteHost}:${config.remoteDir}/`], { silent: true, shell: !isWindows });
    if (!coverScpResult.success) {
      console.error("❌ 封面图上传失败");
      console.error(coverScpResult.output);
      process.exit(1);
    }
    console.log("✅ 封面图上传成功");
    
    // 构建远程封面路径（展开 ~）
    const expandResult = runCommand("ssh", [config.remoteHost, `echo ${config.remoteDir}`], { silent: true, shell: !isWindows });
    const expandedDir = expandResult.output.trim() || "/home/ubuntu/baoyu-skills";
    remoteCoverPath = `${expandedDir}/${coverFileName}`;
    
    // 检测文件格式并转换
    const fileType = getFileType(remoteCoverPath, config);
    if (fileType.includes("webp") || fileType.includes("web/p") || fileType.includes("riff")) {
      console.log("⚠️  检测到 WebP 格式，正在转换为 PNG...");
      const pngPath = remoteCoverPath.replace(/\.[^.]+$/, "_converted.png");
      const convertResult = runCommand("ssh", [
        config.remoteHost,
        `dwebp '${remoteCoverPath}' -o '${pngPath}' 2>&1`
      ], { silent: true, shell: !isWindows });
      
      if (convertResult.success && convertResult.output.includes("Saved")) {
        remoteCoverPath = pngPath;
        console.log(`✅ 已转换为 PNG 格式`);
      } else {
        // 尝试检查是否有 dwebp
        const checkDwebp = runCommand("ssh", [config.remoteHost, `which dwebp`], { silent: true, shell: !isWindows });
        if (!checkDwebp.success) {
          console.error("❌ 服务器未安装 webp 工具，请先安装：sudo apt-get install webp");
          process.exit(1);
        }
        console.warn("⚠️  转换可能未成功，将尝试使用原文件");
      }
    }
    console.log("");
  }
  
  // Step 3: 构建远程执行命令
  let remoteCmd = `cd ${config.remoteDir} && ${config.bunPath} scripts/wechat-api.ts ${fileName}`;
  remoteCmd += ` --title '${options.title.replace(/'/g, "'\\''")}'`;
  
  if (options.author) {
    remoteCmd += ` --author '${options.author.replace(/'/g, "'\\''")}'`;
  }
  if (options.summary) {
    remoteCmd += ` --summary '${options.summary.replace(/'/g, "'\\''")}'`;
  }
  remoteCmd += ` --cover '${remoteCoverPath}'`;
  
  if (options.dryRun) {
    remoteCmd += " --dry-run";
  }
  
  // Step 4: 远程执行发布
  console.log("📡 在服务器上执行发布...");
  if (options.dryRun) {
    console.log("(预览模式，不会实际发布)\n");
  }
  
  const sshResult = runCommand("ssh", [config.remoteHost, remoteCmd], { shell: !isWindows });
  
  if (!sshResult.success) {
    console.error("\n❌ 发布失败");
    
    // 分析常见错误
    if (sshResult.output.includes("40113")) {
      console.error("\n💡 提示：错误 40113 表示图片格式不支持");
      console.error("   微信仅支持 JPG、PNG、GIF 格式，请确保封面图不是 WebP 格式");
    } else if (sshResult.output.includes("not in whitelist")) {
      console.error("\n💡 提示：服务器 IP 不在微信公众号白名单中");
      console.error("   请在 mp.weixin.qq.com 添加服务器 IP 到白名单");
    } else if (sshResult.output.includes("access_token")) {
      console.error("\n💡 提示：API 凭证可能已过期或无效");
      console.error("   请检查 .env 或 ~/.baoyu-skills/.env 中的 WECHAT_APP_ID 和 WECHAT_APP_SECRET");
    }
    
    process.exit(1);
  }
  
  console.log("\n✅ 发布成功！文章已保存到草稿箱。");
  console.log("👉 请登录 https://mp.weixin.qq.com 查看草稿。");
}

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
