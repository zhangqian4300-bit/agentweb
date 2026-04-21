# AgentWeb 部署指南

> 本文档面向 AI Agent 或自动化工具，按步骤执行即可完成部署。人类读者同样适用。

## 前置条件

- Linux 服务器（Ubuntu 20.04+ 推荐）
- Docker + Docker Compose
- Python 3.9+（推荐 3.11）
- Node.js 18+（前端构建）
- 一个域名（可选，无域名用 IP+端口也行）

## 部署架构

```
                    ┌─ Nginx (:80/:443) ─┐
                    │                     │
        /api/*  ──▶ │  Backend (:8000)    │
        /ws/*   ──▶ │  (uvicorn+FastAPI)  │
        /*      ──▶ │  Frontend (:3000)   │
                    │  (Next.js)          │
                    └─────────────────────┘
                          │        │
                    PostgreSQL   Redis
                     (:5432)    (:6379)
```

生产环境用 Nginx 做反向代理，将 API 和前端统一到一个域名下。

---

## Step 1: 克隆代码

```bash
git clone git@github.com:zhangqian4300-bit/agentweb.git
cd agentweb
```

## Step 2: 启动数据库

```bash
docker-compose up -d
```

验证：
```bash
docker-compose ps
# postgres 和 redis 均应为 running 状态
```

如果生产环境已有独立的 PostgreSQL/Redis 实例，跳过此步，直接在 .env 中配置连接串。

## Step 3: 配置后端环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须修改**的项：

```ini
# 数据库连接（如用 docker-compose 默认配置则不需改）
DATABASE_URL=postgresql+asyncpg://agentweb:agentweb@localhost:5433/agentweb
REDIS_URL=redis://localhost:6379/0

# !! 生产环境必须换成随机字符串 !!
JWT_SECRET_KEY=<用 openssl rand -hex 32 生成>

# 前端域名，逗号分隔，不要用 * 
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

生成 JWT 密钥：
```bash
openssl rand -hex 32
```

## Step 4: 安装后端依赖并迁移数据库

```bash
pip install -r requirements.txt
python3 -m alembic upgrade head
```

验证：
```bash
python3 -c "from app.main import app; print('OK')"
```

## Step 5: 启动后端

开发环境：
```bash
python3 -m uvicorn app.main:app --reload --port 8000
```

生产环境（推荐 gunicorn + uvicorn worker）：
```bash
pip install gunicorn
gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  -b 0.0.0.0:8000 \
  --access-logfile -
```

或使用 systemd 管理：

```ini
# /etc/systemd/system/agentweb-api.service
[Unit]
Description=AgentWeb API
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/agentweb
EnvironmentFile=/opt/agentweb/.env
ExecStart=/opt/agentweb/venv/bin/gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  -b 127.0.0.1:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now agentweb-api
```

验证后端：
```bash
curl http://localhost:8000/docs
# 应返回 Swagger UI HTML
```

## Step 6: 构建并启动前端

```bash
cd web
npm install
```

创建前端环境变量：
```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://yourdomain.com
EOF
```

> `NEXT_PUBLIC_API_URL` 填后端 API 的公网地址。如果 Nginx 将 `/api` 和前端放在同域下，填当前域名即可。

构建并启动：
```bash
npm run build
npm run start    # 默认监听 :3000
```

生产环境用 PM2 管理：
```bash
npm install -g pm2
pm2 start npm --name agentweb-web -- start
pm2 save
pm2 startup
```

验证前端：
```bash
curl http://localhost:3000
# 应返回 HTML
```

## Step 7: 配置 Nginx 反向代理

```nginx
# /etc/nginx/sites-available/agentweb
server {
    listen 80;
    server_name yourdomain.com;

    # API 和 WebSocket
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # 前端
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/agentweb /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS（用 certbot）：
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Step 8: 验证完整流程

```bash
# 1. 注册用户
curl -X POST https://yourdomain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456","display_name":"Tester"}'

# 2. 登录拿 token
TOKEN=$(curl -s -X POST https://yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 3. 创建消费方 API Key
API_KEY=$(curl -s -X POST https://yourdomain.com/api/v1/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key_type":"consumer_key","name":"test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['raw_key'])")

echo "Consumer API Key: $API_KEY"

# 4. 创建 Agent（以 Hermes 为例）
AGENT_ID=$(curl -s -X POST https://yourdomain.com/api/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hermes Agent",
    "description": "Hermes AI Assistant",
    "version": "1.0.0",
    "category": "代码",
    "pricing_per_million_tokens": 10,
    "endpoint_url": "http://your-agent-host:8642",
    "endpoint_api_key": "your-agent-api-key",
    "capabilities": []
  }' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Agent ID: $AGENT_ID"

# 5. 调用 Agent（非流式）
curl -X POST "https://yourdomain.com/api/v1/agent/$AGENT_ID/invoke" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "stream": false}'

# 6. 调用 Agent（流式）
curl -N "https://yourdomain.com/api/v1/agent/$AGENT_ID/invoke" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "stream": true}'
```

每一步都应返回 200。如果某步失败，检查对应服务的日志。

## 排障

| 问题 | 排查 |
|------|------|
| 数据库连接失败 | `docker-compose ps` 确认 postgres 在运行；检查 `DATABASE_URL` 端口 |
| Redis 连接失败 | `docker-compose ps` 确认 redis 在运行；检查 `REDIS_URL` |
| CORS 错误 | 检查 `.env` 中 `CORS_ORIGINS` 是否包含前端域名 |
| Agent 调用 404 | 确认 `endpoint_url` 不要重复包含 `/v1/chat/completions`，平台会自动拼接 |
| Invalid API key | 确认使用的是 `sk_` 开头的消费方 key，不是 JWT token |
| WebSocket 断连 | 检查 Nginx 的 `proxy_read_timeout` 是否足够长 |

## 数据库备份

```bash
docker-compose exec postgres pg_dump -U agentweb agentweb > backup_$(date +%Y%m%d).sql
```

恢复：
```bash
cat backup_20260421.sql | docker-compose exec -T postgres psql -U agentweb agentweb
```
