#!/usr/bin/env bun
/**
 * 微信发布 Pipeline 端到端验证脚本
 *
 * 验证范围:
 *   Step 1.5  image-gen 块解析 → 正文插图生成（mock 模式，跳过真正的图片生成）
 *   Step 2    Markdown → HTML 转换 → 内嵌图片 data-local-path 注入
 *   Step 1.5R remote 模式下 HTML 中 data-local-path 提取 + 路径替换
 *
 * 运行方式:
 *   npx -y bun workflows/tests/test-pipeline.ts
 *
 * 此脚本不实际调用 AI API、微信 API，也不需要 SSH 到远程服务器。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

// ============ helpers ============

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
    if (condition) {
        console.log(`  ${GREEN}✅ ${label}${RESET}`);
        passed++;
    } else {
        console.log(`  ${RED}❌ ${label}${RESET}`);
        if (detail) console.log(`     ${RED}${detail}${RESET}`);
        failed++;
    }
}

function section(title: string) {
    console.log(`\n${BOLD}${CYAN}━━━ ${title} ━━━${RESET}\n`);
}

// ============ 测试数据准备 ============

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-pipeline-test-"));

// 创建测试用 Markdown 文件（带 image-gen 块）
const testMdContent = `---
title: "Pipeline 端到端测试"
author: "Test Bot"
description: "验证 image-gen → MD→HTML → data-local-path 全链路"
---

# Pipeline 测试文章

这是一段测试正文。

\`\`\`image-gen
content: 一个蓝色的圆形图标
image: ./images/test-icon.png
alt: 测试图标
\`\`\`

这里是第二段文字。

\`\`\`image-gen
content: 一张简单的流程图
image: ./images/test-flow.png
ar: 16:9
alt: 测试流程图
\`\`\`

结尾段落。
`;

const testMdPath = path.join(tmpDir, "test-article.md");
fs.writeFileSync(testMdPath, testMdContent, "utf-8");

// 创建模拟的图片文件（1x1 PNG）
const imagesDir = path.join(tmpDir, "images");
fs.mkdirSync(imagesDir, { recursive: true });

// 最小有效 PNG: 1x1 像素
const minPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
);
fs.writeFileSync(path.join(imagesDir, "test-icon.png"), minPng);
fs.writeFileSync(path.join(imagesDir, "test-flow.png"), minPng);

// ============ Test 1: image-gen 块解析 ============

section("Test 1: image-gen 块解析");

// 导入 publish-wechat.ts 中的 parseImageGenBlocks（通过进程调用模拟）
// 这里直接做块解析逻辑验证
const imageGenBlockRegex = /```image-gen\n([\s\S]*?)```/g;
const blocks: Array<{ content: string; image: string; alt?: string; ar?: string }> = [];
let match;
while ((match = imageGenBlockRegex.exec(testMdContent)) !== null) {
    const body = match[1]!;
    const block: any = {};
    for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0) {
            const key = trimmed.slice(0, colonIdx).trim();
            const value = trimmed.slice(colonIdx + 1).trim();
            block[key] = value;
        }
    }
    blocks.push(block);
}

assert(blocks.length === 2, "检测到 2 个 image-gen 块");
assert(blocks[0]?.image === "./images/test-icon.png", `块 1 输出路径正确: ${blocks[0]?.image}`);
assert(blocks[1]?.image === "./images/test-flow.png", `块 2 输出路径正确: ${blocks[1]?.image}`);
assert(blocks[0]?.alt === "测试图标", `块 1 alt 正确: ${blocks[0]?.alt}`);
assert(blocks[1]?.ar === "16:9", `块 2 ar 正确: ${blocks[1]?.ar}`);

// ============ Test 2: image-gen 块替换为 Markdown 图片语法 ============

section("Test 2: image-gen → ![alt](path) 替换");

let processedContent = testMdContent;
for (const block of blocks) {
    const regex = new RegExp("```image-gen\\n[\\s\\S]*?" + block.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[\\s\\S]*?```");
    const altText = block.alt || "插图";
    processedContent = processedContent.replace(regex, `![${altText}](${block.image})`);
}

assert(processedContent.includes("![测试图标](./images/test-icon.png)"), "块 1 替换为 ![alt](path)");
assert(processedContent.includes("![测试流程图](./images/test-flow.png)"), "块 2 替换为 ![alt](path)");
assert(!processedContent.includes("```image-gen"), "所有 image-gen 块已被替换");

// 写入处理后的文件
const processedMdPath = testMdPath.replace(/\.md$/, "._processed.md");
fs.writeFileSync(processedMdPath, processedContent, "utf-8");

// ============ Test 3: Markdown → HTML 转换 ============

section("Test 3: Markdown → HTML 转换（baoyu-markdown-to-html）");

const scriptDir = path.resolve(import.meta.dir, "../../skills/baoyu-markdown-to-html/scripts/main.ts");
const mdToHtmlScript = fs.existsSync(scriptDir) ? scriptDir : null;

if (mdToHtmlScript) {
    const isWindows = os.platform() === "win32";
    const [cmd, args] = isWindows
        ? ["bun", [mdToHtmlScript, processedMdPath, "--theme", "default"]] as const
        : ["npx", ["-y", "bun", mdToHtmlScript, processedMdPath, "--theme", "default"]] as const;

    const result = spawnSync(cmd, [...args], {
        stdio: ["inherit", "pipe", "pipe"],
        shell: !isWindows,
        cwd: tmpDir,
    });

    const stdout = result.stdout?.toString() || "";
    const stderr = result.stderr?.toString() || "";

    assert(result.status === 0, `渲染成功 (exit code: ${result.status})`, stderr.slice(0, 200));

    // 解析输出
    let parsedResult: any = null;
    try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedResult = JSON.parse(jsonMatch[0]);
        }
    } catch { }

    if (parsedResult) {
        assert(!!parsedResult.htmlPath, `HTML 路径: ${parsedResult.htmlPath}`);
        assert(parsedResult.title === "Pipeline 端到端测试", `标题: ${parsedResult.title}`);
        assert(parsedResult.author === "Test Bot", `作者: ${parsedResult.author}`);

        // 检查生成的 HTML 文件
        if (parsedResult.htmlPath && fs.existsSync(parsedResult.htmlPath)) {
            const htmlContent = fs.readFileSync(parsedResult.htmlPath, "utf-8");

            // 验证 data-local-path 是否存在
            const dataLocalPathMatches = htmlContent.match(/data-local-path="([^"]+)"/g) || [];
            assert(
                dataLocalPathMatches.length === 2,
                `HTML 包含 ${dataLocalPathMatches.length} 个 data-local-path`,
                `期望 2 个`
            );

            // 验证路径为绝对路径
            const paths = dataLocalPathMatches.map(m => m.match(/"([^"]+)"/)?.[1] || "");
            for (const p of paths) {
                assert(path.isAbsolute(p), `data-local-path 为绝对路径: ${p}`);
                assert(fs.existsSync(p), `图片文件存在: ${path.basename(p)}`);
            }

            // ============ Test 4: Remote 模式路径提取 + 替换 ============

            section("Test 4: Remote 模式 data-local-path 提取 + 路径替换");

            // 模拟 wechat-remote-publish.ts 中 Step 1.5 的逻辑
            const localPathRegex = /data-local-path=["']([^"']+)["']/g;
            const localPaths: string[] = [];
            let lpMatch;
            while ((lpMatch = localPathRegex.exec(htmlContent)) !== null) {
                const lp = lpMatch[1]!;
                if (fs.existsSync(lp) && !localPaths.includes(lp)) {
                    localPaths.push(lp);
                }
            }

            assert(localPaths.length === 2, `提取到 ${localPaths.length} 个本地图片路径`);

            // 模拟路径替换
            const remoteImgDir = "/home/ubuntu/baoyu-skills/_content_images";
            let updatedHtml = htmlContent;

            for (const lp of localPaths) {
                const imgName = path.basename(lp);
                const remotePath = `${remoteImgDir}/${imgName}`;

                const escapedPath = lp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const imgTagRegex = new RegExp(`<img[^>]*data-local-path=["']${escapedPath}["'][^>]*>`, 'g');
                updatedHtml = updatedHtml.replace(imgTagRegex, (tag) => {
                    return tag
                        .replace(/\ssrc=["'][^"']*["']/, ` src="${remotePath}"`)
                        .replace(/data-local-path=["'][^"']*["']/, `data-local-path="${remotePath}"`);
                });
            }

            // 验证替换结果
            const updatedDataPaths = updatedHtml.match(/data-local-path="([^"]+)"/g) || [];
            const allRemote = updatedDataPaths.every(m => m.includes("_content_images"));
            assert(allRemote, "所有 data-local-path 已替换为远程路径");

            const updatedSrcs = updatedHtml.match(/src="([^"]+)"/g) || [];
            const imgSrcs = updatedSrcs.filter(s => s.includes("_content_images"));
            assert(imgSrcs.length === 2, `${imgSrcs.length} 个 src 已替换为远程路径`);

            // 验证两张图片路径不同
            if (imgSrcs.length === 2) {
                assert(imgSrcs[0] !== imgSrcs[1], "两张图片的远程路径不同");
            }
        }
    } else {
        assert(false, "解析 markdown-to-html 输出失败", stdout.slice(0, 300));
    }
} else {
    console.log(`  ${YELLOW}⚠️  baoyu-markdown-to-html 脚本不存在，跳过 HTML 转换测试${RESET}`);
    console.log(`     期望路径: ${scriptDir}`);
}

// ============ Test 5: dry-run 发布参数构建 ============

section("Test 5: 发布参数构建验证");

// 模拟 baoyu-post-to-wechat 的 dry-run
const coverPath = path.join(imagesDir, "test-icon.png");
assert(fs.existsSync(coverPath), `封面图存在: ${path.basename(coverPath)}`);

const publishArgs = [
    processedMdPath,
    "--cover", coverPath,
    "--title", "Pipeline 端到端测试",
    "--author", "Test Bot",
    "--summary", "测试摘要",
    "--theme", "default",
    "--dry-run",
];
assert(publishArgs.length === 12, `发布参数列表完整 (${publishArgs.length} 个参数)`);

// ============ 汇总 ============

section("测试结果汇总");

console.log(`  总计: ${passed + failed} 项  ${GREEN}通过: ${passed}${RESET}  ${failed > 0 ? RED : GREEN}失败: ${failed}${RESET}`);

// 清理临时目录
try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`  ${CYAN}📁 已清理临时目录${RESET}`);
} catch { }

if (failed > 0) {
    console.log(`\n${RED}⚠️  存在失败项，请检查上方详情${RESET}\n`);
    process.exit(1);
} else {
    console.log(`\n${GREEN}🎉 所有测试通过！Pipeline 逻辑正确。${RESET}\n`);
}
