"""
OpenClaw adapter example: bridge an OpenClaw gateway to AgentWeb.

Prerequisites:
    1. OpenClaw gateway running at http://127.0.0.1:18789
    2. OpenClaw chat completions endpoint enabled
    3. AgentWeb platform running

Usage:
    python openclaw_agent.py
"""

import asyncio

from agentweb_sdk import AgentWebPlugin, OpenClawAdapter

PLATFORM_URL = "http://localhost:8000"
AGENT_KEY = "ak_your_key_here"

OPENCLAW_GATEWAY = "http://127.0.0.1:18789"
OPENCLAW_TOKEN = ""

plugin = AgentWebPlugin(platform_url=PLATFORM_URL, agent_key=AGENT_KEY)
plugin.use_adapter(OpenClawAdapter(
    gateway_url=OPENCLAW_GATEWAY,
    token=OPENCLAW_TOKEN,
    model="openclaw",
))


async def main():
    await plugin.register(
        name="OpenClaw Agent",
        description="Powered by OpenClaw gateway",
        pricing_per_million_tokens=20.0,
    )
    await plugin.start()


if __name__ == "__main__":
    asyncio.run(main())
