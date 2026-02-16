# Video Chat Scaffold

This scaffold is a **simple P2P WebRTC video chat** using:
- A FastAPI signaling server (`server/main.py`) that relays WebRTC offers/answers/candidates via WebSocket
- A React client (Vite) that captures media and handles the P2P connection
- Optional: coturn TURN server (Docker) for NAT traversal

**Note:** This is a P2P app. For larger rooms (3+ participants) or SFU features (recording, selective forwarding), upgrade to Janus (see notes below).

Quick start

1. **Start Janus Gateway and coturn TURN relay** (Docker required):

```powershell
cd video-chat
docker compose up -d
```

This starts a coturn TURN server on port 3478. If Docker isn't available, skip this step; the app will still work on local networks.

2. Start the FastAPI signaling server:

```powershell
cd video-chat\server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install 'uvicorn[standard]'
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server listens on `http://0.0.0.0:8000` and relays WebRTC signaling via WebSocket at `ws://localhost:8000/ws/<room>`.

**Note:** `uvicorn[standard]` installs WebSocket support (wsproto/websockets). Without it, the server will reject WebSocket upgrades.

3. Start the React client:

```powershell
cd ..\client
npm install
npm run dev
```

4. Open your browser to the Vite dev server URL (usually `http://localhost:5173`).

5. Allow camera/microphone access, enter a room name, and click **Join Room**.

6. Open the same room URL in another browser tab/window or on another machine (on the same network) to start a call.

Notes

- **P2P topology:** Each peer connects directly to each other peer. Works great for 1:1 calls or small groups (2–4 people). For larger rooms, consider upgrading to Janus.
- **TURN server:** If peers are behind different networks/NATs, the coturn TURN relay helps establish connections. Edit `docker-compose.yml` to enable it.
- **Janus upgrade path:** To support recording, selective forwarding, or many participants, integrate Janus (an SFU) by:
  - Using a Janus Docker image (see `janus-config/` for sample configs).
  - Updating `client/src/App.jsx` to use Janus' VideoRoom plugin.
  - A branch with full Janus integration is available on request.
