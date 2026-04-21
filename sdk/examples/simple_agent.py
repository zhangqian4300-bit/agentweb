"""
Minimal example: a simple echo agent that connects to AgentWeb.

Usage:
    1. Register on the platform and get an agent_key (ak_xxx)
    2. Update AGENT_KEY below
    3. Run: python simple_agent.py
"""

import asyncio

from agentweb_sdk import AgentWebPlugin

PLATFORM_URL = "http://localhost:8000"
AGENT_KEY = "ak_your_key_here"

plugin = AgentWebPlugin(platform_url=PLATFORM_URL, agent_key=AGENT_KEY)


@plugin.handler
async def handle(message: str, session_id: str, **kwargs) -> dict:
    response_text = f"Echo: {message}"
    return {
        "content": response_text,
        "usage": {
            "input_tokens": len(message),
            "output_tokens": len(response_text),
        },
    }


async def main():
    await plugin.register(
        name="Echo Agent",
        description="A simple echo agent for testing",
        pricing_per_million_tokens=1.0,
        category="testing",
    )
    await plugin.start()


if __name__ == "__main__":
    asyncio.run(main())
