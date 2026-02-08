/**
 * 共享配置加载模块
 *
 * 提供 .env 文件解析、项目配置加载等通用功能
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// ============ .env 解析 ============

/**
 * 解析 .env 文件，返回 key-value 对象
 */
export function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // 去除引号
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  } catch {
    // 忽略读取错误
  }
  return env;
}

// ============ JSON 配置 ============

export type PublishMethod = 'api' | 'browser' | 'remote';

export interface PublishConfig {
  method: PublishMethod;
  theme: string;
  autoGenerateCover: boolean;
  coverProvider: string;
}

export interface JsonConfig {
  publish: PublishConfig;
  remote: {
    host: string;
    dir: string;
    bunPath: string;
  };
}

/**
 * 加载 config.json 配置文件
 * 配置文件位于 scripts/config.json
 */
export function loadJsonConfig(scriptDir: string): JsonConfig | null {
  const configPath = path.join(scriptDir, "..", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as JsonConfig;
  } catch {
    return null;
  }
}

// ============ 路径工具 ============

/**
 * 获取当前脚本所在目录（兼容 Windows 路径格式）
 */
export function getScriptDir(importMetaUrl: string): string {
  return path.dirname(new URL(importMetaUrl).pathname.replace(/^\/([A-Z]:)/, "$1"));
}

/**
 * 根据脚本目录推算项目根目录
 * scripts 在 skills/baoyu-post-to-wechat/scripts/ 下，需要往上 3 层
 */
export function getProjectRoot(scriptDir: string): string {
  return path.resolve(scriptDir, "../../../");
}

/**
 * 获取 .env 配置文件搜索路径列表（优先级从高到低）
 */
export function getEnvPaths(projectRoot: string): string[] {
  return [
    path.join(projectRoot, ".env"),                        // 项目根目录 .env
    path.join(process.cwd(), ".baoyu-skills", ".env"),     // 当前目录/.baoyu-skills/.env
    path.join(os.homedir(), ".baoyu-skills", ".env"),      // ~/.baoyu-skills/.env
  ];
}

// ============ 远程服务器配置 ============

export interface RemoteConfig {
  remoteHost: string;
  remoteDir: string;
  bunPath: string;
}

/**
 * 加载远程服务器配置
 */
export function loadRemoteConfig(projectRoot: string): RemoteConfig {
  const config: RemoteConfig = {
    remoteHost: "tencent-server",
    remoteDir: "~/baoyu-skills",
    bunPath: "~/.bun/bin/bun",
  };

  for (const configPath of getEnvPaths(projectRoot)) {
    const env = loadEnvFile(configPath);
    if (env.REMOTE_SERVER_HOST) config.remoteHost = env.REMOTE_SERVER_HOST;
    if (env.REMOTE_SERVER_DIR) config.remoteDir = env.REMOTE_SERVER_DIR;
    if (env.REMOTE_SERVER_BUN_PATH) config.bunPath = env.REMOTE_SERVER_BUN_PATH;
  }

  return config;
}

// ============ 封面生成方案 ============

/**
 * 加载封面生成方案配置（api | web）
 * 优先级：环境变量 > .env 文件 > null
 */
export function loadCoverProvider(projectRoot: string): string | null {
  if (process.env.COVER_PROVIDER) return process.env.COVER_PROVIDER;
  for (const configPath of getEnvPaths(projectRoot)) {
    const env = loadEnvFile(configPath);
    if (env.COVER_PROVIDER) return env.COVER_PROVIDER;
  }
  return null;
}

// ============ 发布策略 ============

/**
 * 加载发布策略配置
 * 优先级：config.json > 环境变量 > .env 文件 > 默认 remote
 */
export function loadPublishMethod(scriptDir: string, projectRoot: string): PublishMethod {
  // 1. config.json
  const jsonConfig = loadJsonConfig(scriptDir);
  if (jsonConfig?.publish?.method) {
    return jsonConfig.publish.method;
  }
  // 2. 环境变量
  const fromEnv = process.env.PUBLISH_METHOD;
  if (fromEnv && ['api', 'browser', 'remote'].includes(fromEnv)) {
    return fromEnv as PublishMethod;
  }
  // 3. .env 文件
  for (const configPath of getEnvPaths(projectRoot)) {
    const env = loadEnvFile(configPath);
    if (env.PUBLISH_METHOD && ['api', 'browser', 'remote'].includes(env.PUBLISH_METHOD)) {
      return env.PUBLISH_METHOD as PublishMethod;
    }
  }
  return 'remote';
}

// ============ API Key ============

/**
 * 加载 Gemini API Key
 */
export function loadApiKey(projectRoot: string): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const configPath of getEnvPaths(projectRoot)) {
    const env = loadEnvFile(configPath);
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  }
  throw new Error(
    "Missing GEMINI_API_KEY.\n" +
      "Get your key at https://aistudio.google.com/apikey\n" +
      "Set via environment variable or in .env file."
  );
}
