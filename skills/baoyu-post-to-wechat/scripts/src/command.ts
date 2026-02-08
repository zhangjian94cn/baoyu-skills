/**
 * 共享命令执行模块
 *
 * 提供子进程执行、路径判断等通用工具
 */

import { spawnSync } from "node:child_process";
import os from "node:os";

// ============ 平台检测 ============

/** Windows 下 shell: true 会导致 cmd.exe 破坏路径参数，SSH/SCP 等命令需要 shell: false */
export const isWindows = os.platform() === "win32";

// ============ 命令执行 ============

export interface RunCommandResult {
  success: boolean;
  output: string;
}

/**
 * 同步执行系统命令，返回执行结果
 */
export function runCommand(
  cmd: string,
  args: string[],
  options?: { silent?: boolean; timeout?: number; shell?: boolean }
): RunCommandResult {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    shell: options?.shell ?? true,
    cwd: process.cwd(),
    timeout: options?.timeout,
  });

  const output = (result.stdout || "") + (result.stderr || "");
  if (!options?.silent) {
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
  }

  return {
    success: result.status === 0,
    output,
  };
}

// ============ 路径判断 ============

/**
 * 判断字符串是否是 URL
 */
export function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

/**
 * 判断字符串是否是远程服务器路径
 */
export function isRemotePath(str: string): boolean {
  return str.startsWith("/home/") || str.startsWith("~") || str.startsWith("$HOME");
}
