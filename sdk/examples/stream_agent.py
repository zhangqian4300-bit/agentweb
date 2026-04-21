"""
Streaming example: an agent that returns responses chunk by chunk.

Usage:
    python stream_agent.py
"""

import asyncio

from agentweb_sdk import AgentWebPlugin

PLATFORM_URL = "http://localhost:8000"
AGENT_KEY = "ak_your_key_here"

plugin = AgentWebPlugin(platform_url=PLATFORM_URL, agent_key=AGENT_KEY)


@plugin.stream_handler
async def handle_stream(message: str, session_id: str, **kwargs):
    words = message.split()
    for word in words:
        yield word + " "
        await asyncio.sleep(0.1)
    yield {"usage": {"input_tokens": len(message), "output_tokens": len(message)}}


async def main():
    await plugin.register(
        name="Stream Echo Agent",
        description="Echoes input word by word with streaming",
        pricing_per_million_tokens=1.0,
        category="testing",
    )
    await plugin.start()


if __name__ == "__main__":
    asyncio.run(main())
