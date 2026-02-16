from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Simple in-memory rooms mapping: room_id -> set of WebSocket
rooms: dict[str, set[WebSocket]] = {}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "rooms": len(rooms)}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    logging.info(f"WebSocket connected: room={room_id}")
    if room_id not in rooms:
        rooms[room_id] = set()
    rooms[room_id].add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logging.info(f"Received in room={room_id}: {data[:200]}")
            # Relay the raw message to all other peers in the room
            peers = list(rooms.get(room_id, []))
            for peer in peers:
                if peer is not websocket:
                    try:
                        await peer.send_text(data)
                    except Exception as e:
                        logging.warning(f"Failed sending to peer in room={room_id}: {e}")
    except WebSocketDisconnect:
        logging.info(f"WebSocket disconnected: room={room_id}")
        try:
            rooms[room_id].remove(websocket)
        except Exception:
            pass
        if not rooms.get(room_id):
            rooms.pop(room_id, None)
