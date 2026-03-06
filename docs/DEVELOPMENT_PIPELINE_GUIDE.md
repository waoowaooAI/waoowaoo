# waoowaoo 二开开发与发布流程（固化版）

本文档用于固定团队的本地开发、测试验证、预发部署、生产部署流程。

## 1. 流水线文件清单

- `docker-compose.dev.yml`：开发流水线（容器内热更新）
- `docker-compose.test.yml`：测试依赖流水线（MySQL + Redis）
- `docker-compose.staging.yml`：预发流水线（使用 GHCR 镜像）
- `docker-compose.prod.yml`：生产流水线（使用 GHCR 镜像）

## 2. 标准分支与修改流程

1. 从主分支切功能分支：

```bash
git checkout main
git pull --ff-only
git checkout -b feat/<your-feature>
```

2. 本地开发（推荐容器化开发流水线）：

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

3. 关键访问地址：

- App: `http://localhost:3000`
- Bull Board: `http://localhost:3010/admin/queues`

4. 停止开发流水线：

```bash
docker compose -f docker-compose.dev.yml down
```

## 3. 本地调试与验证规范

每次完成功能后，至少执行：

```bash
npm run lint
npm run build
```

如涉及测试场景，先起测试依赖：

```bash
docker compose -f docker-compose.test.yml up -d
```

再执行对应测试命令（按改动范围选择）：

```bash
npm run test:unit:all
# 或
npm run test:integration:api
```

## 4. 镜像构建与发布（GHCR）

1. 使用当前 commit 作为发布 tag：

```bash
ME=$(gh api user -q .login)
TAG=$(git rev-parse --short HEAD)
IMAGE="ghcr.io/$ME/waoowaoo"
```

2. 构建与推送：

```bash
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .
docker push "$IMAGE:$TAG"
docker push "$IMAGE:latest"
```

## 5. 预发部署（Staging）

使用固定镜像 tag 部署，不建议直接用 `latest`。

```bash
export APP_IMAGE=ghcr.io/<your-org-or-user>/waoowaoo
export APP_TAG=<commit-sha>
export MYSQL_ROOT_PASSWORD=<strong-password>
export NEXTAUTH_SECRET=<strong-secret>
export CRON_SECRET=<strong-secret>
export INTERNAL_TASK_TOKEN=<strong-secret>
export API_ENCRYPTION_KEY=<strong-secret>

docker compose -f docker-compose.staging.yml up -d
```

默认端口：

- App: `13100`
- Bull Board: `13110`

## 6. 生产部署（Production）

```bash
export APP_IMAGE=ghcr.io/<your-org-or-user>/waoowaoo
export APP_TAG=<release-tag>
export MYSQL_ROOT_PASSWORD=<strong-password>
export NEXTAUTH_SECRET=<strong-secret>
export CRON_SECRET=<strong-secret>
export INTERNAL_TASK_TOKEN=<strong-secret>
export API_ENCRYPTION_KEY=<strong-secret>

docker compose -f docker-compose.prod.yml up -d
```

默认端口：

- App: `13000`
- Bull Board: `13010`

## 7. 生产回滚（必须固定）

当新版本异常时，直接切回旧 tag：

```bash
export APP_TAG=<last-good-tag>
docker compose -f docker-compose.prod.yml up -d
```

## 8. Docker daemon 代理配置（可选）

如本机拉取镜像受限，可使用脚本为 **systemd 管理的 Docker Engine** 配置代理。

```bash
scripts/configure-docker-daemon-proxy.sh http://<proxy-host>:<proxy-port>
```

也可通过环境变量：

```bash
PROXY_ADDR=http://<proxy-host>:<proxy-port> scripts/configure-docker-daemon-proxy.sh
```

可选参数：

- `NO_PROXY`：覆盖默认 NO_PROXY 列表
- `SKIP_PULL=1`：跳过 `docker pull mysql:8.0` 冒烟检查

兼容性说明：

- 支持：Linux + systemd + `docker.service`
- 不支持：Docker Desktop、rootless Docker、非 systemd 主机（脚本会直接失败退出）

## 9. 故障排查顺序

1. 服务状态：

```bash
docker compose -f docker-compose.prod.yml ps
```

2. 实时日志：

```bash
docker compose -f docker-compose.prod.yml logs -f app mysql redis
```

3. 常见问题优先级：

- 环境变量缺失（密钥、URL、数据库连接）
- MySQL/Redis 未就绪
- 队列堆积（Bull Board 查看失败任务）
