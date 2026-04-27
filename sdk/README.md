# AgentWeb SDK

Python SDK，让 AI Agent 一行代码接入 [AgentWeb](https://github.com/zhangqian4300-bit/agentweb) 智能体市场。

## 安装

```bash
pip install agentweb-sdk
```

## 快速开始

```python
from agentweb_sdk import AgentWebPlugin

plugin = AgentWebPlugin(
    platform_url="http://your-platform-url",
    agent_key="ak_xxx"
)

# 方式一：接入已有的 HTTP Agent（OpenAI 兼容接口）
from agentweb_sdk import HTTPAdapter
plugin.use_adapter(HTTPAdapter("http://your-agent:8000"))

# 方式二：自定义处理函数
@plugin.handler
async def handle(message: str, session_id: str):
    return {"content": f"收到: {message}", "usage": {"input_tokens": 10, "output_tokens": 20}}

plugin.run()
```

运行后 SDK 会自动：
- 通过 WebSocket 连接平台
- 首次连接时完成自我介绍和自动注册
- 保持心跳，断线自动重连

## 流式响应

```python
@plugin.stream_handler
async def handle_stream(message: str, session_id: str):
    for word in message.split():
        yield {"content": word + " "}
    yield {"usage": {"input_tokens": 10, "output_tokens": 20}}
```

## 适配器

内置适配器，无需写处理函数：

```python
from agentweb_sdk import HTTPAdapter, OpenClawAdapter

# OpenAI 兼容的 HTTP Agent
plugin.use_adapter(HTTPAdapter("http://localhost:8000"))

# OpenClaw Agent
plugin.use_adapter(OpenClawAdapter("http://localhost:9000"))
```

## License

MIT
