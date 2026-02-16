/**
 * 共享命令执行模块
 *
 * 提供子进程执行、路径判断等通用工具。
 * 所有跨平台差异在此模块集中处理，上层调用者无需关心平台细节。
 */

import { spawnSync, type SpawnSyncReturns, type StdioOptions } from "node:child_process";
import os from "node:os";

// ============ 平台检测 ============

export const isWindows = os.platform() === "win32";

// ============ 通用命令执行 ============

export interface RunCommandResult {
  success: boolean;
  output: string;
}

/**
 * 同步执行系统命令，返回执行结果。
 *
 * 默认 shell: false —— 直接调用可执行文件，避免 shell 展开 ~ 等特殊字符。
 * 仅在明确需要 shell 特性（管道、重定向）时传入 shell: true。
 */
export function runCommand(
  cmd: string,
  args: string[],
  options?: { silent?: boolean; timeout?: number; shell?: boolean }
): RunCommandResult {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    shell: options?.shell ?? false,
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

// ============ SSH / SCP 封装 ============

/**
 * 在远程服务器执行命令。
 *
 * 始终 shell: false，防止本地 shell 展开远程路径中的 ~ 和 $HOME。
 * remoteCmd 作为 SSH 的单个参数传递，由远程 shell 解释。
 */
export function runSsh(
  host: string,
  remoteCmd: string,
  options?: { silent?: boolean }
): RunCommandResult {
  return runCommand("ssh", [host, remoteCmd], { silent: options?.silent, shell: false });
}

/**
 * SCP 上传本地文件到远程服务器。
 *
 * @param localPath   本地文件绝对路径
 * @param remoteDest  远程目标，格式: host:path
 */
export function runScp(
  localPath: string,
  remoteDest: string,
  options?: { silent?: boolean }
): RunCommandResult {
  return runCommand("scp", [localPath, remoteDest], { silent: options?.silent, shell: false });
}

// ============ Bun 脚本启动 ============

/**
 * 跨平台运行 Bun 脚本。
 *
 * - Windows: 直接调用 bun（要求 PATH 中有 bun）
 * - macOS / Linux: 通过 npx -y bun 自动安装并运行
 *
 * @returns spawnSync 的返回值，调用者可检查 .status 和 .stdout/.stderr
 */
export function runBunScript(
  scriptPath: string,
  args: string[],
  options?: { stdio?: StdioOptions; silent?: boolean }
): SpawnSyncReturns<string> {
  const scriptArgs = [scriptPath, ...args];
  const stdio = options?.stdio ?? ["inherit", "pipe", "pipe"];

  if (isWindows) {
    return spawnSync("bun", scriptArgs, {
      stdio,
      encoding: "utf-8",
      shell: false,
    });
  }

  // macOS / Linux: npx -y bun 不需要全局安装 bun
  return spawnSync("npx", ["-y", "bun", ...scriptArgs], {
    stdio,
    encoding: "utf-8",
    shell: false,
  });
}

// ============ 路径判断 ============

/**
 * 判断字符串是否是 URL
 */
export function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

/**
 * 判断字符串是否是远程服务器路径（绝对路径或 ~ 开头）
 */
export function isRemotePath(str: string): boolean {
  return str.startsWith("/home/") || str.startsWith("~") || str.startsWith("$HOME");
}
