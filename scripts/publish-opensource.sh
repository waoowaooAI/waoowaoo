#!/bin/bash
# ============================================================
# 开源版本发布脚本 (orphan branch 方式，无 git 历史)
# 用法: bash scripts/publish-opensource.sh
# ============================================================

set -e

echo ""
echo "🚀 开始发布开源版本..."

# 确保当前在 main 分支，且工作区干净
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ 请先切换到 main 分支再运行发布脚本"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ 工作区有未提交的改动，请先 commit 再发布"
  exit 1
fi

# 1. 创建无历史的孤儿分支
echo "📦 创建干净的孤儿分支..."
git checkout --orphan release-public

# 2. 暂存所有文件（.gitignore 自动排除 logs、data 等）
git add -A

# 3. 从提交中移除不应公开的内容
echo "🧹 清理私有内容..."
git rm --cached .env -f 2>/dev/null || true                  # 本地 env（含真实配置）
git rm -r --cached .github/workflows/ 2>/dev/null || true    # CI 流水线（不对外）
git rm -r --cached .agent/ 2>/dev/null || true               # AI 工具目录
git rm -r --cached .artifacts/ 2>/dev/null || true           # AI 工具数据
git rm -r --cached .shared/ 2>/dev/null || true              # AI 工具数据

# 4. 提交快照
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "release: opensource snapshot $TIMESTAMP"
echo "✅ 快照 commit 已创建"

# 5. 强推到公开仓库的 main 分支
echo "⬆️  推送到公开仓库..."
git push public release-public:main --force

echo ""
echo "=============================================="
echo "✅ 开源版本发布成功！"
echo "🔗 https://github.com/saturndec/waoowaoo"
echo "=============================================="
echo ""

# 6. 切回 main 分支，删除临时孤儿分支
git checkout main
git branch -D release-public

echo "🔙 已切回 main 分支，孤儿分支已清理"
echo ""
