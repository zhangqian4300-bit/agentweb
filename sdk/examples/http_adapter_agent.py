"""
HTTP Adapter example: forward requests to an existing HTTP service.

The target service should accept POST with:
    {"message": "...", "session_id": "...", "metadata": {...}}
And return:
    {"content": "...", "usage": {"input_tokens": N, "output_tokens": N}}

Usage:
    python http_adapter_agent.py
"""

import asyncio

from agentweb_sdk import AgentWebPlugin, HTTPAdapter

PLATFORM_URL = "http://localhost:8000"
AGENT_KEY = "ak_your_key_here"
TARGET_ENDPOINT = "http://localhost:5000/chat"

plugin = AgentWebPlugin(platform_url=PLATFORM_URL, agent_key=AGENT_KEY)
plugin.use_adapter(HTTPAdapter(TARGET_ENDPOINT))


async def main():
    await plugin.register(
        name="My HTTP Agent",
        description="Forwards requests to a local HTTP service",
        pricing_per_million_tokens=10.0,
    )
    await plugin.start()


if __name__ == "__main__":
    asyncio.run(main())
