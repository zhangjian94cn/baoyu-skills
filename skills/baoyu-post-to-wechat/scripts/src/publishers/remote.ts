/**
 * 远程服务器发布策略
 *
 * 通过 SSH/SCP 将文件上传到远程服务器，
 * 在服务器上调用 wechat-api.ts 完成发布。
 * 适用于微信 IP 白名单限制的场景。
 *
 * 底层调用 wechat-remote-publish.ts 的核心逻辑。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBunScript } from "../command.ts";
import type { Publisher, PublishOptions, PublishResult } from "./types.ts";

export class RemotePublisher implements Publisher {
  readonly name = "remote";

  async publish(options: PublishOptions): Promise<PublishResult> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const remoteScript = path.resolve(__dirname, "../wechat-remote-publish.ts");

    if (!fs.existsSync(remoteScript)) {
      return { success: false, message: `Remote script not found: ${remoteScript}` };
    }

    // 构建参数
    const args: string[] = [options.htmlFilePath];
    if (options.title) args.push("--title", options.title);
    if (options.author) args.push("--author", options.author);
    if (options.summary) args.push("--summary", options.summary);
    if (options.coverPath) args.push("--cover", options.coverPath);
    if (options.theme) args.push("--theme", options.theme);

    console.log(`[remote] 上传到远程服务器发布: ${options.title}`);
    const result = runBunScript(remoteScript, args);

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    if (stderr) console.error(stderr);

    if (result.status !== 0) {
      return {
        success: false,
        message: `远程发布失败 (exit ${result.status}): ${stderr || stdout}`,
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
      message: `远程发布成功${mediaId ? ` (media_id: ${mediaId})` : ""}`,
    };
  }
}
