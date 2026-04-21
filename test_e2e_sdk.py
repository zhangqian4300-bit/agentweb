"""End-to-end test: register user -> create agent_key -> SDK register agent -> SDK connect -> invoke agent"""

import asyncio
import json
import sys
import time

import httpx

BASE = "http://localhost:8000"


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as c:
        # 1. Register user
        print("1. Registering user...")
        r = await c.post("/api/v1/auth/register", json={
            "email": f"sdk_test_{int(time.time())}@test.com",
            "password": "test1234",
            "display_name": "SDK Tester",
        })
        assert r.status_code == 200, f"Register failed: {r.text}"
        user = r.json()
        print(f"   User ID: {user['id']}")

        # 2. Login
        print("2. Logging in...")
        r = await c.post("/api/v1/auth/login", json={
            "email": user["email"],
            "password": "test1234",
        })
        assert r.status_code == 200, f"Login failed: {r.text}"
        tokens = r.json()
        jwt_token = tokens["access_token"]

        # 3. Create agent_key
        print("3. Creating agent_key...")
        r = await c.post(
            "/api/v1/keys",
            json={"key_type": "agent_key", "name": "test-sdk-key"},
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        assert r.status_code == 200, f"Create key failed: {r.text}"
        key_data = r.json()
        agent_key = key_data["key"]
        print(f"   Agent key: {agent_key[:16]}...")

        # 4. SDK: Register agent via agent_key
        print("4. SDK registering agent...")
        r = await c.post(
            "/api/v1/agents/register",
            json={
                "name": "E2E Test Agent",
                "description": "Agent for E2E testing",
                "pricing_per_million_tokens": 5.0,
                "capabilities": [],
            },
            headers={"Authorization": f"Bearer {agent_key}"},
        )
        assert r.status_code == 200, f"Register agent failed: {r.text}"
        agent = r.json()
        agent_id = agent["id"]
        print(f"   Agent ID: {agent_id}")

        # 5. SDK: Connect via WebSocket + handle request
        print("5. Connecting SDK via WebSocket...")
        import websockets

        ws_url = f"ws://localhost:8000/ws/agent?agent_key={agent_key}"
        ws = await websockets.connect(ws_url)

        # Expect connected message
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        msg = json.loads(raw)
        assert msg["type"] == "connected", f"Expected connected, got: {msg}"
        print(f"   Connected! Agent IDs: {msg['agent_ids']}")

        # 6. Add balance to user and create api_key for consumer
        print("6. Adding balance and creating consumer api_key...")
        r = await c.patch(
            f"/api/v1/users/me",
            json={"balance": "100.0"},
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        # If no PATCH balance endpoint, use DB directly
        if r.status_code != 200:
            import asyncpg
            conn = await asyncpg.connect("postgresql://agentweb:agentweb@localhost:5433/agentweb")
            await conn.execute(f"UPDATE users SET balance = 100.0 WHERE id = '{user['id']}'")
            await conn.close()
            print("   Balance added via DB")
        r = await c.post(
            "/api/v1/keys",
            json={"key_type": "api_key", "name": "test-consumer-key"},
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        assert r.status_code == 200, f"Create consumer key failed: {r.text}"
        consumer_key = r.json()["key"]
        print(f"   Consumer key: {consumer_key[:16]}...")

        # We need balance for the consumer. Let's add it via DB for testing.
        # For now, let's just try and see if the balance check blocks us.

        # 7. Invoke agent (in background, we respond via WS)
        print("7. Invoking agent...")

        async def do_invoke():
            r = await c.post(
                f"/api/v1/agent/{agent_id}/invoke",
                json={"message": "Hello from E2E test!", "stream": False},
                headers={"Authorization": f"Bearer {consumer_key}"},
            )
            return r

        invoke_task = asyncio.create_task(do_invoke())

        # Give platform time to route the request
        await asyncio.sleep(0.5)

        # 8. Receive request on WS and respond
        # We may get a ping first, handle it
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(raw)
            if data["type"] == "ping":
                await ws.send(json.dumps({"type": "pong"}))
                continue
            if data["type"] == "request":
                print(f"   Received request: {data['request_id']}")
                # Send response
                await ws.send(json.dumps({
                    "type": "response",
                    "request_id": data["request_id"],
                    "content": f"Echo: {data['message']}",
                    "usage": {"input_tokens": 10, "output_tokens": 15},
                }))
                break

        # 9. Get invoke result
        r = await invoke_task
        print(f"   Invoke status: {r.status_code}")
        if r.status_code == 200:
            result = r.json()
            print(f"   Response: {result['response']}")
            print(f"   Usage: {result['usage']}")
            print(f"   Cost: {result['cost']}")
        else:
            print(f"   Error: {r.text}")

        await ws.close()

    print("\nE2E test completed!")


if __name__ == "__main__":
    asyncio.run(main())
