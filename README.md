# waoowaoo Fork — Secondary Development Workspace

本仓库用于在 `waoowaoo` 上进行二次开发（功能定制、部署流程固化、持续迭代）。

## 1) 原始 README 归档

上游原始 README 已归档到：

- `docs/archive/README.upstream.a909abf.md`

这样可以保证：

- 保留上游产品说明与历史上下文
- 当前 README 专注“本 fork 的开发与交付流程”

## 2) 开发者快速开始

### 2.1 克隆与分支

```bash
git clone git@github.com:duoglas/waoowaoo.git
cd waoowaoo
git checkout -b feat/<your-feature>
```

### 2.2 本地开发（推荐）

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

访问：

- App: `http://localhost:3000`
- Queue(Bull Board): `http://localhost:3010/admin/queues`

停止：

```bash
docker compose -f docker-compose.dev.yml down
```

## 3) 流水线 compose 文件

- `docker-compose.dev.yml`：开发流水线（热更新、本地调试）
- `docker-compose.test.yml`：测试依赖流水线（MySQL/Redis）
- `docker-compose.staging.yml`：预发流水线（固定镜像 tag 验证）
- `docker-compose.prod.yml`：生产流水线（固定镜像 tag 发布）

## 4) 开发流程文档（必读）

请优先阅读：

- `docs/DEVELOPMENT_PIPELINE_GUIDE.md`

文档包含：

- 修改 → 调试 → 验证 → 发布标准流程
- GHCR 镜像构建/推送规范
- staging/prod 部署步骤
- 回滚与故障排查

## 5) 发布基线

已验证可用镜像（当前 fork）：

- `ghcr.io/duoglas/waoowaoo:a909abf`
- `ghcr.io/duoglas/waoowaoo:latest`

## 6) 维护约定

- 新功能开发统一走功能分支
- 部署优先使用固定 tag（避免直接使用 `latest`）
- 文档变更与流程变更必须同步更新 `docs/DEVELOPMENT_PIPELINE_GUIDE.md`
