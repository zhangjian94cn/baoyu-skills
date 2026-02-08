#!/usr/bin/env bun
/**
 * 远程服务器一键配置脚本
 *
 * 自动检查并配置微信公众号发布所需的远程服务器环境
 *
 * ============ 功能 ============
 *
 * 1. 检查 SSH 连通性
 * 2. 检查 & 安装 Bun 运行时
 * 3. 检查 & 安装 webp 工具
 * 4. 部署发布脚本和依赖
 * 5. 配置微信 API 凭证（本地优先，自动同步到远端）
 * 6. 获取服务器公网 IP（用于微信 IP 白名单）
 * 7. 冒烟测试
 *
 * ============ 运行方式 ============
 *
 * Windows (PowerShell):
 *   cd skills/baoyu-post-to-wechat/scripts; npx -y bun setup-remote.ts
 *
 * macOS/Linux (Bash/Zsh):
 *   cd skills/baoyu-post-to-wechat/scripts && npx -y bun setup-remote.ts
 */

import { spawnSync } from "node:child_process";
import * as readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Windows 终端 UTF-8 编码修复：通过 FFI 调用 Windows API 设置控制台代码页
if (process.platform === "win32") {
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      SetConsoleOutputCP: {
        args: [FFIType.u32],
        returns: FFIType.bool,
      },
      SetConsoleCP: {
        args: [FFIType.u32],
        returns: FFIType.bool,
      },
    });
    kernel32.symbols.SetConsoleOutputCP(65001);
    kernel32.symbols.SetConsoleCP(65001);
  } catch {
    // FFI 不可用时回退到 chcp
    spawnSync("chcp", ["65001"], { shell: true, stdio: "ignore" });
  }
}

// ============ 类型定义 ============
interface Config {
  remoteHost: string;
  remoteDir: string;
  bunPath: string;
}

interface EnvCredentials {
  appId: string;
  appSecret: string;
  raw: string; // 完整的 .env 文件内容
}

interface StepResult {
  name: string;
  status: "✅" | "❌" | "⚠️";
  message: string;
}

// ============ 工具函数 ============
function runCommand(
  cmd: string,
  args: string[],
  options?: { timeout?: number }
): { success: boolean; output: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    shell: true,
    timeout: options?.timeout ?? 30000,
  });

  const output = ((result.stdout || "") + (result.stderr || "")).trim();
  return {
    success: result.status === 0,
    output,
  };
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function readLocalEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return parseEnvFile(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function loadLocalConfig(): Config {
  const defaultConfig: Config = {
    remoteHost: "tencent-server",
    remoteDir: "~/baoyu-skills",
    bunPath: "~/.bun/bin/bun",
  };

  // 配置文件查找（优先级从高到低）
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
  const projectRoot = path.resolve(scriptDir, "../../..");
  const configPaths = [
    path.join(projectRoot, ".env"),                        // 项目根目录 .env（最方便）
    path.join(process.cwd(), ".baoyu-skills", ".env"),     // 当前目录/.baoyu-skills/.env
    path.join(os.homedir(), ".baoyu-skills", ".env"),      // ~/.baoyu-skills/.env
  ];

  for (const configPath of configPaths) {
    const env = readLocalEnv(configPath);
    if (env.REMOTE_SERVER_HOST) defaultConfig.remoteHost = env.REMOTE_SERVER_HOST;
    if (env.REMOTE_SERVER_DIR) defaultConfig.remoteDir = env.REMOTE_SERVER_DIR;
    if (env.REMOTE_SERVER_BUN_PATH) defaultConfig.bunPath = env.REMOTE_SERVER_BUN_PATH;
  }

  return defaultConfig;
}

function loadLocalCredentials(): EnvCredentials | null {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
  const projectRoot = path.resolve(scriptDir, "../../..");
  const configPaths = [
    path.join(projectRoot, ".env"),                        // 项目根目录 .env（最方便）
    path.join(process.cwd(), ".baoyu-skills", ".env"),     // 当前目录/.baoyu-skills/.env
    path.join(os.homedir(), ".baoyu-skills", ".env"),      // ~/.baoyu-skills/.env
  ];

  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) continue;
    const content = fs.readFileSync(configPath, "utf-8");
    const env = parseEnvFile(content);
    if (env.WECHAT_APP_ID && env.WECHAT_APP_SECRET) {
      return {
        appId: env.WECHAT_APP_ID,
        appSecret: env.WECHAT_APP_SECRET,
        raw: content,
      };
    }
  }

  return null;
}

function maskSecret(s: string): string {
  if (s.length <= 6) return "***";
  return s.slice(0, 3) + "***" + s.slice(-3);
}

// ============ 各步骤实现 ============

async function stepCheckSSH(
  config: Config,
  rl: readline.Interface
): Promise<StepResult> {
  console.log("\n🔗 Step 1: 检查 SSH 连通性\n");
  console.log(`   目标主机: ${config.remoteHost}`);

  const result = runCommand("ssh", [
    "-o", "ConnectTimeout=10",
    "-o", "BatchMode=yes",
    config.remoteHost,
    '"echo __SSH_OK__"',
  ]);

  if (result.success && result.output.includes("__SSH_OK__")) {
    console.log("   ✅ SSH 连接成功");
    return { name: "SSH 连通性", status: "✅", message: "连接正常" };
  }

  console.error("   ❌ SSH 连接失败");
  console.error(`   输出: ${result.output}`);
  console.error("\n   💡 常见原因：");
  console.error("   1. 未配置 SSH 免密登录（需要 ssh-copy-id）");
  console.error("   2. ~/.ssh/config 中未配置主机别名");
  console.error("   3. 服务器地址或端口不正确");
  console.error("   4. 防火墙阻止了 SSH 连接\n");

  const newHost = await prompt(
    rl,
    `   输入正确的主机地址（留空跳过，当前: ${config.remoteHost}）: `
  );
  if (newHost) {
    config.remoteHost = newHost;
    const retry = runCommand("ssh", [
      "-o", "ConnectTimeout=10",
      "-o", "BatchMode=yes",
      config.remoteHost,
      '"echo __SSH_OK__"',
    ]);
    if (retry.success && retry.output.includes("__SSH_OK__")) {
      console.log("   ✅ SSH 连接成功");
      return { name: "SSH 连通性", status: "✅", message: `已连接到 ${config.remoteHost}` };
    }
  }

  return { name: "SSH 连通性", status: "❌", message: "连接失败，后续步骤将跳过" };
}

function stepCheckBun(config: Config): StepResult {
  console.log("\n📦 Step 2: 检查 Bun 运行时\n");

  const result = runCommand("ssh", [
    config.remoteHost,
    `"${config.bunPath} --version"`,
  ]);

  if (result.success && result.output.match(/\d+\.\d+/)) {
    const version = result.output.trim().split("\n").pop() || result.output.trim();
    console.log(`   ✅ Bun 已安装: v${version}`);
    return { name: "Bun 运行时", status: "✅", message: `v${version}` };
  }

  console.log("   ⚙️  Bun 未安装，正在安装...");
  const installResult = runCommand(
    "ssh",
    [config.remoteHost, '"curl -fsSL https://bun.sh/install | bash"'],
    { timeout: 120000 }
  );

  if (installResult.success) {
    // 验证安装
    const verify = runCommand("ssh", [
      config.remoteHost,
      `"${config.bunPath} --version"`,
    ]);
    if (verify.success) {
      const version = verify.output.trim().split("\n").pop() || "";
      console.log(`   ✅ Bun 安装成功: ${version}`);
      return { name: "Bun 运行时", status: "✅", message: `已安装 ${version}` };
    }
  }

  console.error("   ❌ Bun 安装失败");
  console.error(`   输出: ${installResult.output}`);
  return { name: "Bun 运行时", status: "❌", message: "安装失败" };
}

function stepCheckWebp(config: Config): StepResult {
  console.log("\n🖼️  Step 3: 检查 webp 工具\n");

  const result = runCommand("ssh", [
    config.remoteHost,
    '"which dwebp"',
  ]);

  if (result.success && result.output.trim()) {
    console.log(`   ✅ webp 工具已安装: ${result.output.trim()}`);
    return { name: "webp 工具", status: "✅", message: "已安装" };
  }

  console.log("   ⚙️  webp 工具未安装，正在安装...");
  const installResult = runCommand(
    "ssh",
    [config.remoteHost, '"sudo apt-get install -y webp 2>&1"'],
    { timeout: 60000 }
  );

  if (installResult.success) {
    const verify = runCommand("ssh", [config.remoteHost, '"which dwebp"']);
    if (verify.success && verify.output.trim()) {
      console.log("   ✅ webp 工具安装成功");
      return { name: "webp 工具", status: "✅", message: "已安装" };
    }
  }

  console.error("   ⚠️  webp 工具安装失败（可能需要 sudo 权限）");
  console.error("   💡 请手动在服务器上运行: sudo apt-get install -y webp");
  return {
    name: "webp 工具",
    status: "⚠️",
    message: "安装失败，请手动安装",
  };
}

function stepDeployScripts(config: Config): StepResult {
  console.log("\n📤 Step 4: 部署脚本和依赖\n");

  const scriptDir = path.dirname(
    new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
  );

  const filesToUpload = [
    { local: path.join(scriptDir, "wechat-api.ts"), remote: "scripts/wechat-api.ts" },
    { local: path.join(scriptDir, "package.json"), remote: "scripts/package.json" },
  ];

  // 确保远程目录存在
  runCommand("ssh", [
    config.remoteHost,
    `"mkdir -p ${config.remoteDir}/scripts"`,
  ]);

  let allUploaded = true;
  for (const file of filesToUpload) {
    if (!fs.existsSync(file.local)) {
      console.error(`   ❌ 本地文件不存在: ${file.local}`);
      allUploaded = false;
      continue;
    }

    console.log(`   上传: ${path.basename(file.local)}`);
    const scpResult = runCommand("scp", [
      file.local,
      `${config.remoteHost}:${config.remoteDir}/${file.remote}`,
    ]);

    if (!scpResult.success) {
      console.error(`   ❌ 上传失败: ${path.basename(file.local)}`);
      allUploaded = false;
    }
  }

  if (!allUploaded) {
    return { name: "部署脚本", status: "❌", message: "部分文件上传失败" };
  }

  // 远端安装依赖
  console.log("   安装远端依赖 (npm install)...");
  const npmResult = runCommand(
    "ssh",
    [
      config.remoteHost,
      `"cd ${config.remoteDir}/scripts && npm install 2>&1"`,
    ],
    { timeout: 120000 }
  );

  if (!npmResult.success) {
    console.error("   ⚠️  npm install 可能有问题");
    console.error(`   输出: ${npmResult.output.slice(-200)}`);
    return { name: "部署脚本", status: "⚠️", message: "文件已上传但依赖安装可能失败" };
  }

  console.log("   ✅ 脚本部署成功，依赖已安装");
  return { name: "部署脚本", status: "✅", message: "已部署并安装依赖" };
}

async function stepConfigureCredentials(
  config: Config,
  rl: readline.Interface
): Promise<StepResult> {
  console.log("\n🔑 Step 5: 配置微信 API 凭证\n");

  // 1. 读取本地凭证
  const localCreds = loadLocalCredentials();
  if (localCreds) {
    console.log(`   本地凭证: APP_ID=${maskSecret(localCreds.appId)}, APP_SECRET=${maskSecret(localCreds.appSecret)}`);
  } else {
    console.log("   本地凭证: 未找到");
  }

  // 2. 读取远端凭证
  const remoteEnvResult = runCommand("ssh", [
    config.remoteHost,
    '"cat ~/.baoyu-skills/.env 2>/dev/null || echo __NOT_FOUND__"',
  ]);

  let remoteCreds: EnvCredentials | null = null;
  if (
    remoteEnvResult.success &&
    !remoteEnvResult.output.includes("__NOT_FOUND__")
  ) {
    const env = parseEnvFile(remoteEnvResult.output);
    if (env.WECHAT_APP_ID && env.WECHAT_APP_SECRET) {
      remoteCreds = {
        appId: env.WECHAT_APP_ID,
        appSecret: env.WECHAT_APP_SECRET,
        raw: remoteEnvResult.output,
      };
      console.log(`   远端凭证: APP_ID=${maskSecret(remoteCreds.appId)}, APP_SECRET=${maskSecret(remoteCreds.appSecret)}`);
    }
  }

  if (!remoteCreds) {
    console.log("   远端凭证: 未找到");
  }

  // 3. 对比和同步逻辑
  if (localCreds && remoteCreds) {
    // 两端都有，对比是否一致
    if (
      localCreds.appId === remoteCreds.appId &&
      localCreds.appSecret === remoteCreds.appSecret
    ) {
      console.log("\n   ✅ 本地和远端凭证一致");
      return { name: "API 凭证", status: "✅", message: "本地与远端一致" };
    } else {
      console.log("\n   ⚠️  本地和远端凭证不一致！以本地为准覆盖远端");
      const envContent = `WECHAT_APP_ID=${localCreds.appId}\nWECHAT_APP_SECRET=${localCreds.appSecret}`;
      const writeResult = runCommand("ssh", [
        config.remoteHost,
        `"mkdir -p ~/.baoyu-skills && echo '${envContent}' > ~/.baoyu-skills/.env"`,
      ]);
      if (writeResult.success) {
        console.log("   ✅ 已将本地凭证同步到远端");
        return { name: "API 凭证", status: "✅", message: "已从本地同步到远端（覆盖）" };
      } else {
        console.error("   ❌ 同步失败");
        return { name: "API 凭证", status: "❌", message: "同步到远端失败" };
      }
    }
  } else if (localCreds && !remoteCreds) {
    // 本地有，远端没有 → 自动同步
    console.log("\n   ⚙️  将本地凭证同步到远端...");
    const envContent = `WECHAT_APP_ID=${localCreds.appId}\nWECHAT_APP_SECRET=${localCreds.appSecret}`;
    const writeResult = runCommand("ssh", [
      config.remoteHost,
      `"mkdir -p ~/.baoyu-skills && echo '${envContent}' > ~/.baoyu-skills/.env"`,
    ]);
    if (writeResult.success) {
      console.log("   ✅ 已将本地凭证同步到远端");
      return { name: "API 凭证", status: "✅", message: "已从本地同步到远端" };
    } else {
      console.error("   ❌ 同步失败");
      return { name: "API 凭证", status: "❌", message: "同步到远端失败" };
    }
  } else if (!localCreds && remoteCreds) {
    // 远端有，本地没有
    console.log("\n   ✅ 远端已有凭证，跳过");
    return { name: "API 凭证", status: "✅", message: "远端已配置" };
  } else {
    // 两端都没有 → 交互式提示用户输入
    console.log("\n   未找到微信 API 凭证，请输入：");
    console.log("   💡 获取方式：登录 https://mp.weixin.qq.com → 设置与开发 → 基本配置\n");

    const appId = await prompt(rl, "   请输入 WECHAT_APP_ID: ");
    const appSecret = await prompt(rl, "   请输入 WECHAT_APP_SECRET: ");

    if (!appId || !appSecret) {
      console.error("   ❌ 凭证不能为空");
      return { name: "API 凭证", status: "❌", message: "用户未提供凭证" };
    }

    const envContent = `WECHAT_APP_ID=${appId}\nWECHAT_APP_SECRET=${appSecret}`;

    // 写入本地（优先写入项目根目录 .env）
    const scriptDir2 = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
    const projectRoot2 = path.resolve(scriptDir2, "../../..");
    const localEnvPath = path.join(projectRoot2, ".env");
    try {
      // 如果本地已有 .env 但没有微信凭证，追加而非覆盖
      if (fs.existsSync(localEnvPath)) {
        const existing = fs.readFileSync(localEnvPath, "utf-8");
        fs.writeFileSync(localEnvPath, existing.trimEnd() + "\n" + envContent + "\n", "utf-8");
      } else {
        fs.writeFileSync(localEnvPath, envContent + "\n", "utf-8");
      }
      console.log(`   ✅ 已写入本地: ${localEnvPath}`);
    } catch (e) {
      console.error(`   ⚠️  写入本地失败: ${e}`);
    }

    // 写入远端
    const writeResult = runCommand("ssh", [
      config.remoteHost,
      `"mkdir -p ~/.baoyu-skills && echo '${envContent}' > ~/.baoyu-skills/.env"`,
    ]);
    if (writeResult.success) {
      console.log("   ✅ 已写入远端");
      return { name: "API 凭证", status: "✅", message: "已配置到本地和远端" };
    } else {
      console.error("   ⚠️  写入远端失败");
      return { name: "API 凭证", status: "⚠️", message: "已写入本地，远端写入失败" };
    }
  }
}

function stepGetServerIP(config: Config): StepResult {
  console.log("\n🌐 Step 6: 获取服务器公网 IP\n");

  const result = runCommand(
    "ssh",
    [config.remoteHost, '"curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com"'],
    { timeout: 15000 }
  );

  if (result.success && result.output.trim()) {
    const ip = result.output.trim().split("\n").pop() || "";
    console.log(`   服务器公网 IP: ${ip}`);
    console.log("\n   💡 请确保此 IP 已添加到微信公众号 IP 白名单：");
    console.log("      1. 登录 https://mp.weixin.qq.com");
    console.log("      2. 进入「设置与开发」→「基本配置」→「IP白名单」");
    console.log(`      3. 添加 IP: ${ip}`);
    return { name: "服务器 IP", status: "✅", message: ip };
  }

  console.error("   ⚠️  无法获取服务器公网 IP");
  return { name: "服务器 IP", status: "⚠️", message: "获取失败" };
}

function stepSmokeTest(config: Config): StepResult {
  console.log("\n🧪 Step 7: 冒烟测试\n");

  const result = runCommand("ssh", [
    config.remoteHost,
    `"cd ${config.remoteDir} && ${config.bunPath} scripts/wechat-api.ts --help 2>&1 | head -5"`,
  ]);

  if (result.success && result.output.includes("wechat-api.ts")) {
    console.log("   ✅ 远端脚本可以正常加载");
    return { name: "冒烟测试", status: "✅", message: "脚本可正常加载" };
  }

  // 即使 --help 输出不匹配，只要不报 module not found 等严重错误就算通过
  if (result.success && !result.output.includes("not found") && !result.output.includes("Error")) {
    console.log("   ✅ 远端脚本可以正常加载");
    return { name: "冒烟测试", status: "✅", message: "脚本可正常加载" };
  }

  console.error("   ❌ 远端脚本加载失败");
  console.error(`   输出: ${result.output.slice(0, 300)}`);
  return { name: "冒烟测试", status: "❌", message: "脚本无法加载" };
}

// ============ 主流程 ============
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("=".repeat(50));
  console.log("🚀 微信公众号 - 远程服务器一键配置");
  console.log("=".repeat(50));

  const config = loadLocalConfig();
  console.log(`\n📋 当前配置：`);
  console.log(`   远程主机: ${config.remoteHost}`);
  console.log(`   远程目录: ${config.remoteDir}`);
  console.log(`   Bun 路径: ${config.bunPath}`);

  const results: StepResult[] = [];

  // Step 1: SSH
  const sshResult = await stepCheckSSH(config, rl);
  results.push(sshResult);

  if (sshResult.status === "❌") {
    console.error("\n❌ SSH 连接失败，无法继续配置。请先解决 SSH 连接问题。");
    printSummary(results);
    rl.close();
    process.exit(1);
  }

  // Step 2: Bun
  results.push(stepCheckBun(config));

  // Step 3: webp
  results.push(stepCheckWebp(config));

  // Step 4: Deploy
  results.push(stepDeployScripts(config));

  // Step 5: Credentials
  results.push(await stepConfigureCredentials(config, rl));

  // Step 6: Server IP
  results.push(stepGetServerIP(config));

  // Step 7: Smoke Test
  results.push(stepSmokeTest(config));

  rl.close();

  // 打印总结
  printSummary(results);

  const hasErrors = results.some((r) => r.status === "❌");
  if (hasErrors) {
    process.exit(1);
  }
}

function printSummary(results: StepResult[]) {
  console.log("\n" + "=".repeat(50));
  console.log("📊 配置结果总结");
  console.log("=".repeat(50));
  console.log("");

  for (const r of results) {
    console.log(`  ${r.status}  ${r.name.padEnd(12)} ${r.message}`);
  }

  console.log("");

  const passed = results.filter((r) => r.status === "✅").length;
  const warnings = results.filter((r) => r.status === "⚠️").length;
  const failed = results.filter((r) => r.status === "❌").length;

  if (failed === 0 && warnings === 0) {
    console.log("🎉 所有检查通过！远程服务器已就绪。");
    console.log("👉 现在可以使用 wechat-publish.ts 发布文章了。");
  } else if (failed === 0) {
    console.log(`⚠️  ${warnings} 项需要注意，但不影响基本功能。`);
  } else {
    console.log(`❌ ${failed} 项检查失败，请根据提示修复后重新运行此脚本。`);
  }

  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
