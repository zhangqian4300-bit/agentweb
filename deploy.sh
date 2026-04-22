#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  AgentWeb 生产部署脚本
#
#  用法：
#    ./deploy.sh <公网地址> [LLM_API_KEY]
#
#  示例：
#    ./deploy.sh http://8.136.40.83:3000 sk-xxxx
#
#  功能：
#    1. 自动生成环境配置（调用 setup-env.sh）
#    2. 启动 Docker（PostgreSQL + Redis）
#    3. 安装依赖 + 数据库迁移
#    4. 构建前端（生产模式）
#    5. 启动后端和前端（后台运行，日志写入 logs/）
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# ---- 参数检查 ----
if [ $# -lt 1 ]; then
    echo "用法: $0 <公网地址> [LLM_API_KEY]"
    echo ""
    echo "示例:"
    echo "  $0 http://8.136.40.83:3000 sk-xxxx"
    exit 1
fi

PUBLIC_URL="${1%/}"
LLM_KEY="${2:-}"

# 从公网地址提取前端端口（默认 3000）
FRONTEND_PORT=$(echo "$PUBLIC_URL" | grep -oE ':[0-9]+$' | tr -d ':')
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo ""
echo "========================================="
echo "  AgentWeb 生产部署"
echo "========================================="
echo "  公网地址: ${PUBLIC_URL}"
echo "  前端端口: ${FRONTEND_PORT}"
echo "  后端端口: 8000"
echo "========================================="
echo ""

# ---- Step 1: 环境配置 ----
echo "[1/6] 生成环境配置..."
if [ -n "$LLM_KEY" ]; then
    bash "$SCRIPT_DIR/setup-env.sh" "$PUBLIC_URL" "$LLM_KEY"
else
    bash "$SCRIPT_DIR/setup-env.sh" "$PUBLIC_URL"
fi
echo ""

# ---- Step 2: Docker ----
echo "[2/6] 启动数据库服务..."
docker-compose up -d
echo "  等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
    if docker-compose exec -T postgres pg_isready -U agentweb > /dev/null 2>&1; then
        echo "  PostgreSQL 就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  错误: PostgreSQL 启动超时"
        exit 1
    fi
    sleep 1
done
echo ""

# ---- Step 3: 后端依赖 + 迁移 ----
echo "[3/6] 安装后端依赖 + 数据库迁移..."
pip install -r requirements.txt -q
python3 -m alembic upgrade head
echo ""

# ---- Step 4: 前端构建 ----
echo "[4/6] 安装前端依赖 + 生产构建..."
cd "$SCRIPT_DIR/web"
npm install --silent
npm run build
cd "$SCRIPT_DIR"
echo ""

# ---- Step 5: 停掉旧进程 ----
echo "[5/6] 停止旧进程..."
if [ -f "$LOG_DIR/backend.pid" ]; then
    OLD_PID=$(cat "$LOG_DIR/backend.pid")
    kill "$OLD_PID" 2>/dev/null && echo "  已停止旧后端 (PID $OLD_PID)" || true
    rm -f "$LOG_DIR/backend.pid"
fi
if [ -f "$LOG_DIR/frontend.pid" ]; then
    OLD_PID=$(cat "$LOG_DIR/frontend.pid")
    kill "$OLD_PID" 2>/dev/null && echo "  已停止旧前端 (PID $OLD_PID)" || true
    rm -f "$LOG_DIR/frontend.pid"
fi
echo ""

# ---- Step 6: 启动服务 ----
echo "[6/6] 启动生产服务..."

# 后端
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "  后端已启动 (PID $BACKEND_PID) -> $LOG_DIR/backend.log"

# 前端（生产模式）
cd "$SCRIPT_DIR/web"
nohup npx next start --port "$FRONTEND_PORT" \
    > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"
echo "  前端已启动 (PID $FRONTEND_PID) -> $LOG_DIR/frontend.log"
cd "$SCRIPT_DIR"

# 等待服务就绪
sleep 3

# 检查进程是否存活
BACKEND_OK=false
FRONTEND_OK=false

if kill -0 "$BACKEND_PID" 2>/dev/null; then
    BACKEND_OK=true
fi
if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    FRONTEND_OK=true
fi

echo ""
echo "========================================="
echo "  部署完成"
echo "========================================="
echo "  后端:  http://0.0.0.0:8000  $($BACKEND_OK && echo '[运行中]' || echo '[启动失败]')"
echo "  前端:  ${PUBLIC_URL}  $($FRONTEND_OK && echo '[运行中]' || echo '[启动失败]')"
echo ""
echo "  日志目录: $LOG_DIR/"
echo "    tail -f $LOG_DIR/backend.log"
echo "    tail -f $LOG_DIR/frontend.log"
echo ""
echo "  停止服务:"
echo "    kill \$(cat $LOG_DIR/backend.pid) \$(cat $LOG_DIR/frontend.pid)"
echo "========================================="

if ! $BACKEND_OK || ! $FRONTEND_OK; then
    echo ""
    echo "[!] 有服务启动失败，请检查日志:"
    $BACKEND_OK || echo "    tail -20 $LOG_DIR/backend.log"
    $FRONTEND_OK || echo "    tail -20 $LOG_DIR/frontend.log"
    exit 1
fi
