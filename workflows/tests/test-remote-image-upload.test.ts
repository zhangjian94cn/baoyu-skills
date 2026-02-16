/**
 * wechat-remote-publish.ts Step 1.5 单元测试
 * 测试 data-local-path 提取和路径替换逻辑
 *
 * 运行方式: npx -y bun test workflows/tests/test-remote-image-upload.test.ts
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============ 被测逻辑（从 wechat-remote-publish.ts 提取） ============

function extractLocalPaths(htmlContent: string): string[] {
    const localPathRegex = /data-local-path=["']([^"']+)["']/g;
    const localPaths: string[] = [];
    let lpMatch;
    while ((lpMatch = localPathRegex.exec(htmlContent)) !== null) {
        const lp = lpMatch[1]!;
        if (!localPaths.includes(lp)) {
            localPaths.push(lp);
        }
    }
    return localPaths;
}

function replaceImagePaths(
    htmlContent: string,
    pathMapping: Map<string, string>
): string {
    let updatedHtml = htmlContent;
    for (const [localPath, remotePath] of pathMapping) {
        const escapedPath = localPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const imgTagRegex = new RegExp(
            `<img[^>]*data-local-path=["']${escapedPath}["'][^>]*>`,
            "g"
        );
        updatedHtml = updatedHtml.replace(imgTagRegex, (tag) => {
            return tag
                .replace(/\ssrc=["'][^"']*["']/, ` src="${remotePath}"`)
                .replace(
                    /data-local-path=["'][^"']*["']/,
                    `data-local-path="${remotePath}"`
                );
        });
    }
    return updatedHtml;
}

// ============ Tests ============

describe("extractLocalPaths", () => {
    test("提取单个 data-local-path", () => {
        const html = `<img src="MDTOHTMLIMGPH_1" data-local-path="/tmp/images/icon.png" style="width:100%">`;
        const paths = extractLocalPaths(html);
        expect(paths).toEqual(["/tmp/images/icon.png"]);
    });

    test("提取多个不同的 data-local-path", () => {
        const html = `
      <img src="MDTOHTMLIMGPH_1" data-local-path="/tmp/images/a.png" style="width:100%">
      <p>some text</p>
      <img src="MDTOHTMLIMGPH_2" data-local-path="/tmp/images/b.png" style="width:100%">
    `;
        const paths = extractLocalPaths(html);
        expect(paths).toEqual(["/tmp/images/a.png", "/tmp/images/b.png"]);
    });

    test("去重重复的 data-local-path", () => {
        const html = `
      <img src="MDTOHTMLIMGPH_1" data-local-path="/tmp/images/same.png" style="width:100%">
      <img src="MDTOHTMLIMGPH_2" data-local-path="/tmp/images/same.png" style="width:100%">
    `;
        const paths = extractLocalPaths(html);
        expect(paths).toEqual(["/tmp/images/same.png"]);
    });

    test("无 data-local-path 时返回空数组", () => {
        const html = `<img src="https://mmbiz.qpic.cn/xxx.jpg"><p>text</p>`;
        const paths = extractLocalPaths(html);
        expect(paths).toEqual([]);
    });

    test("处理含特殊字符的路径", () => {
        const html = `<img src="PH" data-local-path="/tmp/images/test (1).png">`;
        const paths = extractLocalPaths(html);
        expect(paths).toEqual(["/tmp/images/test (1).png"]);
    });
});

describe("replaceImagePaths", () => {
    test("替换单张图片的 src 和 data-local-path", () => {
        const html = `<img src="MDTOHTMLIMGPH_1" data-local-path="/local/img.png" style="width:100%">`;
        const mapping = new Map([["/local/img.png", "/remote/_content_images/img.png"]]);
        const result = replaceImagePaths(html, mapping);

        expect(result).toContain(`src="/remote/_content_images/img.png"`);
        expect(result).toContain(`data-local-path="/remote/_content_images/img.png"`);
        expect(result).not.toContain("MDTOHTMLIMGPH_1");
        expect(result).not.toContain("/local/img.png");
    });

    test("替换多张图片路径，互不影响", () => {
        const html = `
      <div>
        <img src="MDTOHTMLIMGPH_1" data-local-path="/local/a.png" style="width:100%">
        <p>text</p>
        <img src="MDTOHTMLIMGPH_2" data-local-path="/local/b.png" style="width:100%">
      </div>
    `;
        const mapping = new Map([
            ["/local/a.png", "/remote/a.png"],
            ["/local/b.png", "/remote/b.png"],
        ]);
        const result = replaceImagePaths(html, mapping);

        expect(result).toContain(`src="/remote/a.png"`);
        expect(result).toContain(`data-local-path="/remote/a.png"`);
        expect(result).toContain(`src="/remote/b.png"`);
        expect(result).toContain(`data-local-path="/remote/b.png"`);
        expect(result).not.toContain("MDTOHTMLIMGPH");
    });

    test("不影响已有的远程 URL", () => {
        const html = `
      <img src="https://mmbiz.qpic.cn/existing.jpg" style="width:100%">
      <img src="MDTOHTMLIMGPH_1" data-local-path="/local/new.png" style="width:100%">
    `;
        const mapping = new Map([["/local/new.png", "/remote/new.png"]]);
        const result = replaceImagePaths(html, mapping);

        expect(result).toContain(`src="https://mmbiz.qpic.cn/existing.jpg"`);
        expect(result).toContain(`src="/remote/new.png"`);
    });

    test("处理含特殊正则字符的路径", () => {
        const html = `<img src="PH" data-local-path="/local/test (1).png" style="width:100%">`;
        const mapping = new Map([["/local/test (1).png", "/remote/test (1).png"]]);
        const result = replaceImagePaths(html, mapping);

        expect(result).toContain(`src="/remote/test (1).png"`);
        expect(result).toContain(`data-local-path="/remote/test (1).png"`);
    });

    test("空映射不修改内容", () => {
        const html = `<img src="PH" data-local-path="/local/x.png">`;
        const mapping = new Map<string, string>();
        const result = replaceImagePaths(html, mapping);
        expect(result).toBe(html);
    });
});
