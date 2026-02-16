/**
 * API 发布策略
 *
 * 通过微信公众号 API 直接发布文章到草稿箱。
 * 需要在微信后台 IP 白名单中添加服务器 IP。
 *
 * 底层调用 wechat-api.ts 的核心逻辑。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBunScript } from "../command.ts";
import type { Publisher, PublishOptions, PublishResult } from "./types.ts";

export class ApiPublisher implements Publisher {
  readonly name = "api";

  async publish(options: PublishOptions): Promise<PublishResult> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const apiScript = path.resolve(__dirname, "../wechat-api.ts");

    if (!fs.existsSync(apiScript)) {
      return { success: false, message: `API script not found: ${apiScript}` };
    }

    // 构建参数
    const args: string[] = [options.htmlFilePath];
    if (options.title) args.push("--title", options.title);
    if (options.author) args.push("--author", options.author);
    if (options.summary) args.push("--summary", options.summary);
    if (options.coverPath) args.push("--cover", options.coverPath);

    console.log(`[api] 调用 API 发布: ${options.title}`);
    const result = runBunScript(apiScript, args);

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    if (stderr) console.error(stderr);

    if (result.status !== 0) {
      return {
        success: false,
        message: `API 发布失败 (exit ${result.status}): ${stderr || stdout}`,
      };
    }

    // 解析输出中的 media_id
    let mediaId: string | undefined;
    try {
      const json = JSON.parse(stdout);
      mediaId = json.media_id;
    } catch { }

    return {
      success: true,
      mediaId,
      message: `API 发布成功${mediaId ? ` (media_id: ${mediaId})` : ""}`,
    };
  }
}
