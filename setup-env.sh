#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  AgentWeb 一键环境配置脚本
#
#  用法：
#    ./setup-env.sh <公网地址> [LLM_API_KEY]
#
#  示例：
#    ./setup-env.sh http://8.136.40.83:3000
#    ./setup-env.sh http://8.136.40.83:3000 sk-xxxx
#    ./setup-env.sh https://agentweb.example.com sk-xxxx
#
#  效果：
#    自动生成 .env（后端）和 web/.env（前端），
#    所有地址相关变量统一正确填写，不再出现 localhost。
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ $# -lt 1 ]; then
    echo "用法: $0 <公网地址> [LLM_API_KEY]"
    echo ""
    echo "示例:"
    echo "  $0 http://8.136.40.83:3000"
    echo "  $0 http://8.136.40.83:3000 sk-xxxx"
    echo "  $0 https://agentweb.example.com sk-xxxx"
    exit 1
fi

PUBLIC_URL="${1%/}"
LLM_KEY="${2:-}"

# 验证 URL 格式
if [[ ! "$PUBLIC_URL" =~ ^https?:// ]]; then
    echo "错误: 地址必须以 http:// 或 https:// 开头"
    exit 1
fi

# 生成随机 JWT 密钥
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")

# 读取已有的 .env 中的值（如果存在），避免覆盖用户已设置的密钥
EXISTING_JWT=""
EXISTING_LLM_KEY=""
EXISTING_DB_URL=""
EXISTING_REDIS_URL=""

if [ -f "$SCRIPT_DIR/.env" ]; then
    EXISTING_JWT=$(grep -E "^JWT_SECRET_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    EXISTING_LLM_KEY=$(grep -E "^LLM_API_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    EXISTING_DB_URL=$(grep -E "^DATABASE_URL=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    EXISTING_REDIS_URL=$(grep -E "^REDIS_URL=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
fi

# 优先级：命令行参数 > 已有 .env > 默认值
JWT_SECRET="${EXISTING_JWT:-$JWT_SECRET}"
LLM_KEY="${LLM_KEY:-${EXISTING_LLM_KEY:-}}"
DB_URL="${EXISTING_DB_URL:-postgresql+asyncpg://agentweb:agentweb@localhost:5433/agentweb}"
REDIS_URL="${EXISTING_REDIS_URL:-redis://localhost:6379/0}"

# ---- 生成后端 .env ----
cat > "$SCRIPT_DIR/.env" << EOF
# AgentWeb 后端配置 (由 setup-env.sh 生成)
DATABASE_URL=${DB_URL}
REDIS_URL=${REDIS_URL}

JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

PLATFORM_COMMISSION_RATE=0.18

SITE_URL=${PUBLIC_URL}
CORS_ORIGINS=${PUBLIC_URL}

LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=${LLM_KEY}
LLM_MODEL=qwen-plus
EOF

echo "[OK] 后端配置 -> .env"

# ---- 生成前端 web/.env ----
mkdir -p "$SCRIPT_DIR/web"
cat > "$SCRIPT_DIR/web/.env" << EOF
# AgentWeb 前端配置 (由 setup-env.sh 生成)
NEXT_PUBLIC_API_URL=${PUBLIC_URL}
NEXT_PUBLIC_SITE_URL=${PUBLIC_URL}
EOF

echo "[OK] 前端配置 -> web/.env"

# ---- 汇总 ----
echo ""
echo "========================================="
echo "  环境配置完成"
echo "========================================="
echo "  公网地址:     ${PUBLIC_URL}"
echo "  数据库:       ${DB_URL}"
echo "  Redis:        ${REDIS_URL}"
if [ -n "$LLM_KEY" ]; then
    echo "  LLM API Key:  ${LLM_KEY:0:8}..."
else
    echo "  LLM API Key:  [未设置] 请编辑 .env 填写"
fi
echo "========================================="
echo ""
echo "下一步:"
echo "  1. docker-compose up -d"
echo "  2. python3 -m alembic upgrade head"
echo "  3. python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo "  4. cd web && npm install && npm run dev"
if [ -z "$LLM_KEY" ]; then
    echo ""
    echo "  [!] 记得在 .env 中填写 LLM_API_KEY，否则 Agent 分类/测试评分会报错"
fi
