/**
 * src/command.ts 单元测试
 *
 * 运行方式: npx -y bun test tests/command.test.ts
 */

import { describe, test, expect } from "bun:test";
import { runCommand, isUrl, isRemotePath } from "../src/command.ts";

// ============ runCommand ============

describe("runCommand", () => {
  test("执行成功的命令", () => {
    const result = runCommand("echo", ["hello"], { silent: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  test("执行失败的命令", () => {
    const result = runCommand("exit", ["1"], { silent: true });
    expect(result.success).toBe(false);
  });

  test("静默模式不输出到控制台", () => {
    const result = runCommand("echo", ["silent-test"], { silent: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain("silent-test");
  });
});

// ============ isUrl ============

describe("isUrl", () => {
  test("识别 http URL", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  test("识别 https URL", () => {
    expect(isUrl("https://example.com/path?q=1")).toBe(true);
  });

  test("拒绝非 URL 字符串", () => {
    expect(isUrl("/home/user/file.txt")).toBe(false);
    expect(isUrl("./relative/path")).toBe(false);
    expect(isUrl("ftp://server")).toBe(false);
    expect(isUrl("")).toBe(false);
  });
});

// ============ isRemotePath ============

describe("isRemotePath", () => {
  test("识别 /home/ 开头的路径", () => {
    expect(isRemotePath("/home/ubuntu/file")).toBe(true);
  });

  test("识别 ~ 开头的路径", () => {
    expect(isRemotePath("~/baoyu-skills")).toBe(true);
  });

  test("识别 $HOME 开头的路径", () => {
    expect(isRemotePath("$HOME/project")).toBe(true);
  });

  test("拒绝本地相对路径", () => {
    expect(isRemotePath("./local/file")).toBe(false);
    expect(isRemotePath("file.txt")).toBe(false);
  });

  test("拒绝 URL", () => {
    expect(isRemotePath("https://example.com")).toBe(false);
  });
});
