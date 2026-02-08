/**
 * src/config.ts 单元测试
 *
 * 运行方式: npx -y bun test tests/config.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadEnvFile,
  getScriptDir,
  getProjectRoot,
  getEnvPaths,
  loadRemoteConfig,
  loadCoverProvider,
  loadApiKey,
} from "../src/config.ts";

// ============ 测试用临时目录 ============

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baoyu-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============ loadEnvFile ============

describe("loadEnvFile", () => {
  test("解析标准 key=value 对", () => {
    const envPath = path.join(tmpDir, "test1.env");
    fs.writeFileSync(envPath, "FOO=bar\nBAZ=qux\n");

    const result = loadEnvFile(envPath);
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("跳过注释行和空行", () => {
    const envPath = path.join(tmpDir, "test2.env");
    fs.writeFileSync(envPath, "# comment\n\nKEY=value\n  \n# another\n");

    const result = loadEnvFile(envPath);
    expect(result).toEqual({ KEY: "value" });
  });

  test("处理带引号的值", () => {
    const envPath = path.join(tmpDir, "test3.env");
    fs.writeFileSync(envPath, 'DOUBLE="hello world"\nSINGLE=\'foo bar\'\n');

    const result = loadEnvFile(envPath);
    expect(result).toEqual({
      DOUBLE: "hello world",
      SINGLE: "foo bar",
    });
  });

  test("处理值中包含等号", () => {
    const envPath = path.join(tmpDir, "test4.env");
    fs.writeFileSync(envPath, "URL=https://example.com?foo=bar&baz=1\n");

    const result = loadEnvFile(envPath);
    expect(result.URL).toBe("https://example.com?foo=bar&baz=1");
  });

  test("文件不存在时返回空对象", () => {
    const result = loadEnvFile(path.join(tmpDir, "nonexistent.env"));
    expect(result).toEqual({});
  });

  test("空文件返回空对象", () => {
    const envPath = path.join(tmpDir, "empty.env");
    fs.writeFileSync(envPath, "");

    const result = loadEnvFile(envPath);
    expect(result).toEqual({});
  });
});

// ============ getScriptDir ============

describe("getScriptDir", () => {
  test("返回当前脚本所在目录", () => {
    const dir = getScriptDir(import.meta.url);
    expect(dir).toContain("tests");
  });
});

// ============ getProjectRoot ============

describe("getProjectRoot", () => {
  test("从 scripts 目录推算出项目根目录", () => {
    const scriptDir = path.resolve("c:/a/b/skills/baoyu-post-to-wechat/scripts");
    const root = getProjectRoot(scriptDir);
    expect(root).toBe(path.resolve("c:/a/b"));
  });
});

// ============ getEnvPaths ============

describe("getEnvPaths", () => {
  test("返回 3 个搜索路径", () => {
    const paths = getEnvPaths("/some/project");
    expect(paths).toHaveLength(3);
    expect(paths[0]).toContain(".env");
  });
});

// ============ loadRemoteConfig ============

describe("loadRemoteConfig", () => {
  test("从 .env 文件加载远程配置", () => {
    const fakeRoot = path.join(tmpDir, "project-remote");
    fs.mkdirSync(fakeRoot, { recursive: true });
    fs.writeFileSync(
      path.join(fakeRoot, ".env"),
      "REMOTE_SERVER_HOST=my-server\nREMOTE_SERVER_DIR=/data/app\nREMOTE_SERVER_BUN_PATH=/usr/local/bin/bun\n"
    );

    const config = loadRemoteConfig(fakeRoot);
    expect(config.remoteHost).toBe("my-server");
    expect(config.remoteDir).toBe("/data/app");
    expect(config.bunPath).toBe("/usr/local/bin/bun");
  });

  test("无 .env 文件时使用默认值", () => {
    const emptyRoot = path.join(tmpDir, "project-empty");
    fs.mkdirSync(emptyRoot, { recursive: true });

    const config = loadRemoteConfig(emptyRoot);
    expect(config.remoteHost).toBe("tencent-server");
    expect(config.remoteDir).toBe("~/baoyu-skills");
    expect(config.bunPath).toBe("~/.bun/bin/bun");
  });
});

// ============ loadCoverProvider ============

describe("loadCoverProvider", () => {
  test("从 .env 文件读取封面方案", () => {
    const fakeRoot = path.join(tmpDir, "project-cover");
    fs.mkdirSync(fakeRoot, { recursive: true });
    fs.writeFileSync(path.join(fakeRoot, ".env"), "COVER_PROVIDER=web\n");

    const provider = loadCoverProvider(fakeRoot);
    expect(provider).toBe("web");
  });

  test("无配置时返回 null", () => {
    const emptyRoot = path.join(tmpDir, "project-no-cover");
    fs.mkdirSync(emptyRoot, { recursive: true });

    const provider = loadCoverProvider(emptyRoot);
    expect(provider).toBeNull();
  });
});

// ============ loadApiKey ============

describe("loadApiKey", () => {
  test("从 .env 文件读取 API Key", () => {
    const fakeRoot = path.join(tmpDir, "project-api");
    fs.mkdirSync(fakeRoot, { recursive: true });
    fs.writeFileSync(path.join(fakeRoot, ".env"), "GEMINI_API_KEY=test-key-12345\n");

    const key = loadApiKey(fakeRoot);
    expect(key).toBe("test-key-12345");
  });

  test("无 API Key 时抛出错误", () => {
    const emptyRoot = path.join(tmpDir, "project-no-api");
    fs.mkdirSync(emptyRoot, { recursive: true });

    // 临时清除环境变量
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() => loadApiKey(emptyRoot)).toThrow("Missing GEMINI_API_KEY");

    if (saved) process.env.GEMINI_API_KEY = saved;
  });
});
