#!/usr/bin/env bun
/**
 * 微信发布 Workflow Dry-Run 验证脚本
 *
 * 以 dry-run 模式运行整个 publish-wechat.ts 流程，跳过实际的图片生成和微信发布。
 * 用于验证流程编排逻辑、参数传递和错误处理。
 *
 * 运行方式:
 *   npx -y bun workflows/tests/test-dryrun-publish.ts
 *
 * 前提条件:
 *   - baoyu-markdown-to-html 依赖已安装 (npm install)
 *   - 不需要 GEMINI_API_KEY（因为跳过图片生成）
 *   - 不需要 WECHAT_APP_ID / WECHAT_APP_SECRET（dry-run 不发布）
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function section(title: string) {
    console.log(`\n${BOLD}${CYAN}━━━ ${title} ━━━${RESET}\n`);
}

/** shell 转义：含特殊字符的参数用单引号包裹 */
function shellQuote(arg: string): string {
    if (!/[ \t"'\\$`!#&|;()<>]/.test(arg)) return arg;
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ============ 准备测试环境 ============

section("准备测试环境");

const scriptDir = path.resolve(import.meta.dir, "../scripts");
const projectRoot = path.resolve(import.meta.dir, "../../../");
const publishScript = path.join(scriptDir, "publish-wechat.ts");

if (!fs.existsSync(publishScript)) {
    console.error(`${RED}❌ publish-wechat.ts 不存在: ${publishScript}${RESET}`);
    process.exit(1);
}
console.log(`📄 发布脚本: ${publishScript}`);

// 创建临时测试目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-dryrun-"));
console.log(`📁 临时目录: ${tmpDir}`);

// 创建测试 Markdown（不含 image-gen 块，纯文本）
const simpleMd = `---
title: "Dry-Run 测试文章"
author: "Verification Bot"
description: "用于验证发布流程的测试文章"
---

# Dry-Run 测试

这是一篇用于测试 **dry-run** 模式的文章。

## 特性

- 不调用 AI 生成图片
- 不调用微信 API
- 只验证流程逻辑

> 如果此测试通过，说明 Markdown → HTML 转换和发布参数构建正确。

结束。
`;

const mdPath = path.join(tmpDir, "dryrun-test.md");
fs.writeFileSync(mdPath, simpleMd, "utf-8");

// 创建模拟封面图
const minPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
);
const coverPath = path.join(tmpDir, "cover.png");
fs.writeFileSync(coverPath, minPng);
console.log(`🖼️  封面图: ${coverPath}`);

// ============ Test A: 纯 Markdown（无 image-gen）dry-run ============

section("Test A: 纯文本 Markdown → dry-run 发布");

const isWindows = os.platform() === "win32";
const bunPath = isWindows ? "bun" : "npx";
const bunArgs = isWindows ? [] : ["-y", "bun"];

const resultA = spawnSync(bunPath, [
    ...bunArgs,
    publishScript,
    mdPath,
    "--cover", coverPath,
    "--no-inline-images",
    "--dry-run",
], {
    stdio: ["inherit", "pipe", "pipe"],
    shell: !isWindows,
    cwd: projectRoot,
    env: { ...process.env },
    timeout: 60000,
});

const stdoutA = resultA.stdout?.toString() || "";
const stderrA = resultA.stderr?.toString() || "";

console.log("--- stdout ---");
console.log(stdoutA.slice(0, 2000));
if (stderrA) {
    console.log("--- stderr ---");
    console.log(stderrA.slice(0, 1000));
}

if (resultA.status === 0) {
    console.log(`${GREEN}✅ dry-run 成功 (exit code: 0)${RESET}`);
} else {
    console.log(`${RED}❌ dry-run 失败 (exit code: ${resultA.status})${RESET}`);
}

// ============ Test B: 带 image-gen 块的 Markdown → dry-run ============

section("Test B: 含 image-gen 块 → dry-run 发布");

const imageGenMd = `---
title: "Image-Gen Dry-Run 测试"
author: "Test Bot"
description: "含 image-gen 块的 dry-run 测试"
---

# 带插图的测试

下面是一个 image-gen 块：

\`\`\`image-gen
content: 一个测试图标
image: ./images/test-placeholder.png
alt: 测试
\`\`\`

文章结束。
`;

const imageGenMdPath = path.join(tmpDir, "imagegen-test.md");
fs.writeFileSync(imageGenMdPath, imageGenMd, "utf-8");

// 创建图片目录（image-gen 正常需要目录存在）
fs.mkdirSync(path.join(tmpDir, "images"), { recursive: true });

const resultB = spawnSync(bunPath, [
    ...bunArgs,
    publishScript,
    imageGenMdPath,
    "--cover", coverPath,
    "--dry-run",
], {
    stdio: ["inherit", "pipe", "pipe"],
    shell: !isWindows,
    cwd: projectRoot,
    env: { ...process.env },
    timeout: 120000,
});

const stdoutB = resultB.stdout?.toString() || "";
const stderrB = resultB.stderr?.toString() || "";

console.log("--- stdout ---");
console.log(stdoutB.slice(0, 2000));
if (stderrB) {
    console.log("--- stderr ---");
    console.log(stderrB.slice(0, 1000));
}

if (resultB.status === 0) {
    console.log(`${GREEN}✅ dry-run 成功${RESET}`);
} else {
    console.log(`${YELLOW}⚠️  退出码: ${resultB.status}（若为图片生成 API 错误则可忽略）${RESET}`);
}

// ============ Test C: 路径含空格 → dry-run ============

section("Test C: 路径含空格 → dry-run 发布");

const spacedDir = path.join(tmpDir, "Nutstore Files", "Obsidian Vault");
fs.mkdirSync(spacedDir, { recursive: true });

const spacedMdPath = path.join(spacedDir, "spaced-test.md");
fs.writeFileSync(spacedMdPath, simpleMd, "utf-8");

const spacedCoverPath = path.join(spacedDir, "cover.png");
fs.writeFileSync(spacedCoverPath, minPng);

console.log(`📁 带空格路径: ${spacedDir}`);
console.log(`📄 MD 文件:    ${spacedMdPath}`);
console.log(`🖼️  封面图:     ${spacedCoverPath}`);

const resultC = spawnSync(bunPath, [
    ...bunArgs,
    publishScript,
    spacedMdPath,
    "--cover", spacedCoverPath,
    "--no-inline-images",
    "--dry-run",
].map(shellQuote), {
    stdio: ["inherit", "pipe", "pipe"],
    shell: !isWindows,
    cwd: projectRoot,
    env: { ...process.env },
    timeout: 60000,
});

const stdoutC = resultC.stdout?.toString() || "";
const stderrC = resultC.stderr?.toString() || "";

console.log("--- stdout ---");
console.log(stdoutC.slice(0, 2000));
if (stderrC) {
    console.log("--- stderr ---");
    console.log(stderrC.slice(0, 1000));
}

if (resultC.status === 0) {
    console.log(`${GREEN}✅ 路径含空格 dry-run 成功 (exit code: 0)${RESET}`);
} else {
    console.log(`${RED}❌ 路径含空格 dry-run 失败 (exit code: ${resultC.status})${RESET}`);
}

// ============ 清理 ============

section("清理");

try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`${CYAN}📁 已清理临时目录${RESET}`);
} catch { }

console.log(`\n${BOLD}完成！${RESET}\n`);
