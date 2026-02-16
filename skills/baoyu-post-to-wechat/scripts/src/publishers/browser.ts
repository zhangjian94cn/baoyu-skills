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
import { fileURLToPath } from "node:url";
import { runBunScript } from "../command.ts";
import type { Publisher, PublishOptions, PublishResult } from "./types.ts";

export class BrowserPublisher implements Publisher {
  readonly name = "browser";

  async publish(options: PublishOptions): Promise<PublishResult> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const articleScript = path.resolve(__dirname, "../wechat-article.ts");

    if (!fs.existsSync(articleScript)) {
      return { success: false, message: `Browser script not found: ${articleScript}` };
    }

    // 构建参数
    const args: string[] = ["--html", options.htmlFilePath];
    if (options.title) args.push("--title", options.title);
    if (options.author) args.push("--author", options.author);
    if (options.summary) args.push("--summary", options.summary);
    if (options.submit) args.push("--submit");

    console.log(`[browser] 启动浏览器发布: ${options.title}`);
    const result = runBunScript(articleScript, args, { stdio: "inherit" });

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
