import asyncio
import logging
from typing import Dict, List, Set
from fastapi import WebSocket

logger = logging.getLogger("cpanel_lite.broadcaster")

class DeploymentBroadcaster:
    def __init__(self):
        self.active_logs: Dict[str, List[str]] = {}
        self.subscribers: Dict[str, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def register(self, deployment_id: str):
        async with self.lock:
            if deployment_id not in self.active_logs:
                self.active_logs[deployment_id] = []
            if deployment_id not in self.subscribers:
                self.subscribers[deployment_id] = set()
            logger.info(f"Registered broadcaster for deployment {deployment_id}")

    async def unregister(self, deployment_id: str):
        async with self.lock:
            websockets = self.subscribers.pop(deployment_id, set())
            self.active_logs.pop(deployment_id, None)
            logger.info(f"Unregistered broadcaster for deployment {deployment_id}. Active subscribers closed: {len(websockets)}")

        for ws in websockets:
            try:
                await ws.close(code=1000, reason="Deployment finished")
            except Exception as e:
                logger.debug(f"Error closing subscriber websocket: {e}")

    async def log(self, deployment_id: str, text: str):
        async with self.lock:
            if deployment_id in self.active_logs:
                self.active_logs[deployment_id].append(text)
            websockets = list(self.subscribers.get(deployment_id, []))

        for ws in websockets:
            try:
                await ws.send_text(text)
            except Exception as e:
                logger.debug(f"Failed to send log to subscriber: {e}")

    async def subscribe(self, deployment_id: str, websocket: WebSocket) -> List[str]:
        async with self.lock:
            if deployment_id not in self.subscribers:
                self.subscribers[deployment_id] = set()
            self.subscribers[deployment_id].add(websocket)
            return list(self.active_logs.get(deployment_id, []))

    async def unsubscribe(self, deployment_id: str, websocket: WebSocket):
        async with self.lock:
            if deployment_id in self.subscribers:
                self.subscribers[deployment_id].discard(websocket)

deployment_broadcaster = DeploymentBroadcaster()
