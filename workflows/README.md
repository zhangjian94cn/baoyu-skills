# workflows/

编排多个 skill 完成端到端业务流程。

## 设计理念

```
workflows/     用户/Agent 入口 → 编排多个 skill （thin wrapper）
skills/        原子能力 + pipeline 层 → 核心逻辑
```

- **Workflow 调用 skill，skill 不调用 workflow**
- 每个 workflow 是独立的 TypeScript 脚本，可直接 `npx -y bun` 执行
- 核心逻辑在对应 skill 中实现，workflow 文件为轻量转发入口

## 已有 Workflow

| 入口文件            | Skill                    | 功能                 |
| ------------------- | ------------------------ | -------------------- |
| `publish-wechat.ts` | `baoyu-wechat-pipeline`  | 微信公众号发布全流程 |

详细文档见 skill: `skills/baoyu-wechat-pipeline/SKILL.md`

## 添加新 Workflow

1. 在 `skills/` 下创建 pipeline skill（包含 SKILL.md + scripts/）
2. 在 `workflows/` 下新建 thin wrapper `.ts` 文件，import skill 入口
3. 更新本 README
