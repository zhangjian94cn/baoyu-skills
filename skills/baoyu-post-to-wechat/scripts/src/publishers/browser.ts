/**
 * 浏览器 CDP 发布策略
 *
 * 通过 Chrome DevTools Protocol 自动化浏览器操作，
 * 模拟登录微信后台并粘贴文章内容。
 *
 * 底层调用 wechat-article.ts 的核心逻辑。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Publisher, PublishOptions, PublishResult } from "./types.ts";

const isWindows = os.platform() === "win32";

export class BrowserPublisher implements Publisher {
  readonly name = "browser";

  async publish(options: PublishOptions): Promise<PublishResult> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const articleScript = path.resolve(__dirname, "../wechat-article.ts");

    if (!fs.existsSync(articleScript)) {
      return { success: false, message: `Browser script not found: ${articleScript}` };
    }

    // 构建 wechat-article.ts 的参数
    const scriptArgs: string[] = [articleScript, "--html", options.htmlFilePath];

    if (options.title) scriptArgs.push("--title", options.title);
    if (options.author) scriptArgs.push("--author", options.author);
    if (options.summary) scriptArgs.push("--summary", options.summary);
    if (options.submit) scriptArgs.push("--submit");

    console.log(`[browser] 启动浏览器发布: ${options.title}`);
    const [cmd, args, shell] = isWindows
      ? ["bun", scriptArgs, false] as const
      : ["npx", ["-y", "bun", ...scriptArgs], true] as const;
    const result = spawnSync(cmd, [...args], {
      stdio: "inherit",
      encoding: "utf-8",
      shell,
    });

    if (result.status !== 0) {
      return {
        success: false,
        message: `浏览器发布失败 (exit ${result.status})`,
      };
    }

    return {
      success: true,
      message: "浏览器发布完成（请检查微信后台草稿箱）",
    };
  }
}
