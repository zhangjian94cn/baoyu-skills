# 远程服务器发布配置指南

微信公众号 API 需要 IP 白名单，对于使用代理上网或动态 IP 的用户，推荐使用固定 IP 的云服务器执行发布脚本。

## 一键配置（推荐）

使用自动化脚本一键完成所有配置：

```bash
# Windows (PowerShell)
cd skills/baoyu-post-to-wechat/scripts; npx -y bun setup-remote.ts

# macOS/Linux
cd skills/baoyu-post-to-wechat/scripts && npx -y bun setup-remote.ts
```

脚本会自动检查和配置：SSH 连通性、Bun 运行时、webp 工具、脚本部署、API 凭证同步、获取服务器 IP。

## 一次性配置

### 1. 配置 SSH 免密登录

本地执行：

```bash
# 1. 生成 SSH 密钥（如果没有）
ssh-keygen -t ed25519 -C "your-email@example.com"

# 2. 复制公钥到服务器
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your-server-ip

# 3. 配置 SSH 别名（可选，方便使用）
# 在 ~/.ssh/config 中添加：
# Host wechat-server
#     HostName your-server-ip
#     User your-username
#     IdentityFile ~/.ssh/id_ed25519

# 4. 测试连接
ssh wechat-server "echo 连接成功"
```

### 2. 服务器环境配置

通过 SSH 连接服务器执行：

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 创建工作目录
mkdir -p ~/baoyu-skills/scripts

# 验证安装
~/.bun/bin/bun --version
```

### 3. 上传脚本和依赖

本地执行：

```bash
# 上传脚本
scp ${SKILL_DIR}/scripts/wechat-api.ts wechat-server:~/baoyu-skills/scripts/
scp ${SKILL_DIR}/scripts/package.json wechat-server:~/baoyu-skills/scripts/

# 服务器上安装依赖
ssh wechat-server "cd ~/baoyu-skills/scripts && npm install"
```

### 4. 配置 API 凭证

```bash
# 服务器上创建配置文件
ssh wechat-server "mkdir -p ~/.baoyu-skills && cat > ~/.baoyu-skills/.env << 'EOF'
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret
EOF"
```

### 5. 添加 IP 白名单

1. 获取服务器公网 IP：`ssh wechat-server "curl -s ifconfig.me"`
2. 登录 https://mp.weixin.qq.com
3. 进入：**设置与开发** → **基本配置** → **IP白名单**
4. 添加服务器 IP 并保存

---

## 使用方法

### 一键发布（推荐）

使用封装好的脚本，自动完成上传和远程发布：

```bash
npx -y bun ${SKILL_DIR}/scripts/wechat-remote-publish.ts article.html --title "文章标题"

# 带封面图
npx -y bun ${SKILL_DIR}/scripts/wechat-remote-publish.ts article.html --title "标题" --cover "https://example.com/cover.jpg"

# 预览模式（不实际发布）
npx -y bun ${SKILL_DIR}/scripts/wechat-remote-publish.ts article.html --title "标题" --dry-run
```

### 手动发布（分步执行）

如果需要更多控制，可以手动执行：

#### 发布 HTML 文章

```bash
# 1. 上传文章到服务器
scp your-article.html wechat-server:~/baoyu-skills/

# 2. 远程执行发布（会保存到草稿箱）
ssh wechat-server "cd ~/baoyu-skills && ~/.bun/bin/bun scripts/wechat-api.ts your-article.html --title '文章标题'"
```

### 发布 Markdown 文章

需要先在本地转换为 HTML：

```bash
# 1. 本地转换（使用 baoyu-markdown-to-html 技能）
npx -y bun ${MARKDOWN_SKILL_DIR}/scripts/render.ts article.md -o article.html

# 2. 上传并发布
scp article.html wechat-server:~/baoyu-skills/
ssh wechat-server "cd ~/baoyu-skills && ~/.bun/bin/bun scripts/wechat-api.ts article.html --title '文章标题'"
```

### 常用参数

| 参数                      | 说明                 |
| ------------------------- | -------------------- |
| `--title "标题"`          | 文章标题             |
| `--author "作者"`         | 作者名               |
| `--summary "摘要"`        | 文章摘要             |
| `--cover "图片路径或URL"` | 封面图               |
| `--dry-run`               | 预览模式，不实际发布 |

---

## 常见问题

### IP 不在白名单

错误信息包含 `not in whitelist`：

1. 确认服务器 IP 已添加到白名单
2. 白名单更新后可能需要等待几分钟生效
3. 使用 `ssh wechat-server "curl -s ifconfig.me"` 确认服务器实际 IP

### SSH 连接失败

```bash
# 检查 SSH 配置
ssh -v wechat-server

# 确认密钥权限
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

### 封面图缺失

错误信息包含 `featureImage` 或报需要封面图：

- 在 HTML 中包含 `<img>` 标签（脚本会自动使用第一张图作为封面）
- 或使用 `--cover` 参数指定封面 URL：

```bash
ssh wechat-server "~/.bun/bin/bun scripts/wechat-api.ts article.html --title '标题' --cover 'https://example.com/cover.jpg'"
```

### 服务器脚本版本过旧

如果本地脚本有更新，需要重新上传到服务器：

```bash
scp ${SKILL_DIR}/scripts/wechat-api.ts wechat-server:~/baoyu-skills/scripts/
```

---

## 注意事项

> [!WARNING]
> **本地代理方式不可用**  
> `socks-proxy-agent` + `node-fetch` 组合存在兼容性问题，SSH SOCKS5 隧道无法正确路由流量。**必须在服务器上直接执行脚本**，不要尝试本地通过代理调用 API。

> [!TIP]
> **Windows 用户**  
> PowerShell 不支持 `&&` 连接多个命令，请分开执行 `scp` 和 `ssh` 命令。

> [!NOTE]
> **依赖安装**  
> 服务器上首次运行前需要执行 `npm install`，确保 `node-fetch` 等依赖已安装。
