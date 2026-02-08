# workflows/

编排多个 skill 完成端到端业务流程。

## 设计理念

```
workflows/     用户/Agent 入口 → 编排多个 skill
skills/        原子能力层     → 单一职责
```

- **Workflow 调用 skill，skill 不调用 workflow**
- 每个 workflow 是独立的 TypeScript 脚本，可直接 `npx -y bun` 执行
- Workflow 负责：参数解析、步骤编排、错误处理、进度输出

## 已有 Workflow

| 文件                | 功能                 | 依赖的 Skill                                                                                      |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `publish-wechat.ts` | 微信公众号发布全流程 | `baoyu-image-gen` · `baoyu-danger-gemini-web` · `baoyu-markdown-to-html` · `baoyu-post-to-wechat` |

## 添加新 Workflow

1. 在 `workflows/` 下新建 `.ts` 文件
2. 通过 `spawnSync` / `runCommand` 调用 skill 脚本
3. 更新本 README
