/**
 * Thin wrapper — 转发到 baoyu-wechat-pipeline skill
 *
 * 用法不变:
 *   npx -y bun workflows/publish-wechat.ts <file.md> --cover <cover.jpg> [options]
 */
import "../skills/baoyu-wechat-pipeline/scripts/publish-wechat.ts";
