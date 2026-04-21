"""
一个最小的 OpenAI 兼容 Mock Agent，模拟一个法律顾问。
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
    "name": "法律小助手",
    "description": "专业法律咨询 Agent，擅长合同审查、法规解读、劳动法答疑",
    "version": "1.0.0",
    "capabilities": [
        {"name": "合同审查", "description": "分析合同条款，识别潜在风险"},
        {"name": "法规解读", "description": "解读法律法规，提供通俗解释"},
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

    reply = f"【法律小助手】收到问题：「{user_msg}」\n\n根据相关法律规定，这是一个模拟回复。在实际场景中，这里会给出专业的法律分析和建议。\n\n以上仅供参考，建议咨询专业律师。"

    if stream:
        return StreamingResponse(_stream(reply), media_type="text/event-stream")

    return {
        "id": f"chatcmpl-mock-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "mock-legal",
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
            "model": "mock-legal",
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
        "model": "mock-legal",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": len(text), "total_tokens": 10 + len(text)},
    }
    yield f"data: {json.dumps(done_chunk, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


if __name__ == "__main__":
    print("Mock Agent 启动在 http://localhost:9100")
    print("Agent Card: http://localhost:9100/.well-known/agent.json")
    print("Chat API:   http://localhost:9100/v1/chat/completions")
    uvicorn.run(app, host="0.0.0.0", port=9100)
