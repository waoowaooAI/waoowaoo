#!/bin/bash
#
# 存储迁移快捷脚本
# 用法: ./scripts/migrate-to-minio.sh [选项]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}     Local Storage → MinIO Migration Tool${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo

# 检查 MinIO 是否运行
if ! curl -sf http://127.0.0.1:19000/minio/health/live >/devdev/null 2>&1; then
    echo -e "${YELLOW}⚠ MinIO 未检测到在 127.0.0.1:19000${NC}"
    echo "  请先启动 MinIO: docker compose up -d minio"
    echo
    read -p "是否尝试自动启动 MinIO? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        docker compose up -d minio minio-init
        echo -e "${GREEN}✓ MinIO 启动中，等待 5 秒...${NC}"
        sleep 5
    else
        exit 1
    fi
fi

echo -e "${GREEN}✓ MinIO 服务正常${NC}"
echo

# 检查本地数据目录
if [ ! -d "./data/uploads" ]; then
    echo -e "${YELLOW}⚠ 本地数据目录 ./data/uploads 不存在${NC}"
    echo "  无需迁移"
    exit 0
fi

FILE_COUNT=$(find ./data/uploads -type f 2>/dev/null | wc -l)
if [ "$FILE_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠ 本地数据目录为空${NC}"
    echo "  无需迁移"
    exit 0
fi

echo "本地文件数: $FILE_COUNT"
echo

# 运行干运行模式预览
echo -e "${YELLOW}▶ 干运行预览 (Dry Run)...${NC}"
MIGRATE_DRY_RUN=true npx tsx scripts/migrate-to-minio.ts
echo

# 确认执行
read -p "是否开始实际迁移? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}已取消迁移${NC}"
    exit 0
fi

echo
echo -e "${GREEN}▶ 开始迁移...${NC}"
npx tsx scripts/migrate-to-minio.ts

if [ $? -eq 0 ]; then
    echo
    echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}              迁移成功完成!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
    echo
    echo "后续步骤:"
    echo "  1. 验证 MinIO 控制台: http://127.0.0.1:19001"
    echo "     账号: minioadmin / minioadmin"
    echo "  2. 更新 .env: STORAGE_TYPE=minio"
    echo "  3. 重启应用: docker compose restart app"
    echo "  4. 测试图片/视频访问"
    echo "  5. 确认无误后删除本地数据: rm -rf ./data/uploads"
    echo
else
    echo
    echo -e "${RED}══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}                迁移失败${NC}"
    echo -e "${RED}══════════════════════════════════════════════════════════${NC}"
    echo
    echo "可重新运行继续迁移:"
    echo "  ./scripts/migrate-to-minio.sh"
    exit 1
fi
