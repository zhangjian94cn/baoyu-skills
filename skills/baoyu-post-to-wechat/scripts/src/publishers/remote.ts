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
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Publisher, PublishOptions, PublishResult } from "./types.ts";

export class RemotePublisher implements Publisher {
  readonly name = "remote";

  async publish(options: PublishOptions): Promise<PublishResult> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const remoteScript = path.resolve(__dirname, "../wechat-remote-publish.ts");

    if (!fs.existsSync(remoteScript)) {
      return { success: false, message: `Remote script not found: ${remoteScript}` };
    }

    // 构建 wechat-remote-publish.ts 的参数
    const isWin = os.platform() === "win32";
    const scriptArgs: string[] = [remoteScript, options.htmlFilePath];

    if (options.title) scriptArgs.push("--title", options.title);
    if (options.author) scriptArgs.push("--author", options.author);
    if (options.summary) scriptArgs.push("--summary", options.summary);
    if (options.coverPath) scriptArgs.push("--cover", options.coverPath);
    if (options.theme) scriptArgs.push("--theme", options.theme);

    console.log(`[remote] 上传到远程服务器发布: ${options.title}`);
    const [cmd, args, shell] = isWin
      ? ["bun", scriptArgs, false] as const
      : ["npx", ["-y", "bun", ...scriptArgs], true] as const;
    const result = spawnSync(cmd, [...args], {
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf-8",
      shell,
    });

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
    } catch {}

    return {
      success: true,
      mediaId,
      message: `远程发布成功${mediaId ? ` (media_id: ${mediaId})` : ""}`,
    };
  }
}
