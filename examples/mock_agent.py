"""
一个最小的 OpenAI 兼容 Mock Agent，模拟一个分子对接助手。
运行: python3 examples/mock_agent.py
端点: http://localhost:9100
"""

import json
import time
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

AGENT_CARD = {
    "name": "分子对接助手",
    "description": "AI 驱动的分子对接与虚拟筛选 Agent，支持蛋白-配体结合分析",
    "version": "1.0.0",
    "capabilities": [
        {"name": "分子对接", "description": "预测小分子与靶蛋白的结合模式和亲和力"},
        {"name": "虚拟筛选", "description": "从化合物库中筛选潜在活性分子"},
    ],
}


@app.get("/.well-known/agent.json")
async def agent_json():
    return AGENT_CARD


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    user_msg = messages[-1]["content"] if messages else ""
    stream = body.get("stream", False)

    reply = f"【分子对接助手】收到问题：「{user_msg}」\n\n基于分子动力学模拟，这是一个模拟回复。在实际场景中，这里会给出对接打分、结合位点分析和构象预测结果。\n\n以上为计算预测结果，建议结合实验验证。"

    if stream:
        return StreamingResponse(_stream(reply), media_type="text/event-stream")

    return {
        "id": f"chatcmpl-mock-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "mock-docking",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": len(user_msg), "completion_tokens": len(reply), "total_tokens": len(user_msg) + len(reply)},
    }


async def _stream(text: str):
    chunk_id = f"chatcmpl-mock-{int(time.time())}"
    for i, char in enumerate(text):
        chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": "mock-docking",
            "choices": [{"index": 0, "delta": {"content": char}, "finish_reason": None}],
        }
        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        if i % 5 == 0:
            import asyncio
            await asyncio.sleep(0.02)

    done_chunk = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "mock-docking",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": len(text), "total_tokens": 10 + len(text)},
    }
    yield f"data: {json.dumps(done_chunk, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


if __name__ == "__main__":
    print("Mock Agent (分子对接助手) 启动在 http://localhost:9100")
    print("Agent Card: http://localhost:9100/.well-known/agent.json")
    print("Chat API:   http://localhost:9100/v1/chat/completions")
    uvicorn.run(app, host="0.0.0.0", port=9100)
