import json
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

LLM_TIMEOUT = 60.0


async def chat_completion(
    messages: list[Dict[str, str]],
    *,
    json_mode: bool = False,
    model: Optional[str] = None,
    temperature: float = 0.7,
) -> str:
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is not configured")

    url = f"{settings.llm_api_base.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.llm_api_key}",
    }
    payload: Dict[str, Any] = {
        "model": model or settings.llm_model,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=LLM_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

    return data["choices"][0]["message"]["content"]


async def chat_completion_json(
    messages: list[Dict[str, str]],
    *,
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> Any:
    content = await chat_completion(
        messages, json_mode=True, model=model, temperature=temperature
    )
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(content)
