# Alerting, App Store, Terminal & Users API

Documents alert notifications webhooks, Marketplace template installations, SSH terminal websockets, and user account management.

---

## Alert Notifications (`/api/v1/notifications`)

Manages Telegram bots and Discord webhooks configured to dispatch alerts when server CPU/RAM thresholds are breached or deployed services crash.

### 1. List Notification Channels
* Endpoint: `GET /api/v1/notifications/channels`
* Access Level: `super_admin` only

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "channel-1234abcd",
    "channel_type": "discord",
    "webhook_url": "https://discord.com/api/webhooks/...",
    "bot_token": null,
    "chat_id": null,
    "is_active": true,
    "alert_rules": "{\"cpu_threshold\": 95, \"ram_threshold\": 90}"
  }
]
```

### 2. Configure Channel
* Endpoint: `POST /api/v1/notifications/channels`
* Request Payload (Discord example):
```json
{
  "channel_type": "discord",
  "webhook_url": "https://discord.com/api/webhooks/...",
  "is_active": true,
  "alert_rules": "{\"cpu_threshold\": 95}"
}
```

### 3. Update Channel
* Endpoint: `PUT /api/v1/notifications/channels/{channel_id}`

### 4. Delete Channel
* Endpoint: `DELETE /api/v1/notifications/channels/{channel_id}`

---

## App Store Marketplace (`/api/v1/marketplace`)

Offers 1-click installer configurations for popular utilities (PostgreSQL, Redis, pgAdmin, Vaultwarden, Caddy, n8n, portainer) via Docker Compose templates.

### 1. List Available App Templates
* Endpoint: `GET /api/v1/marketplace/templates`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "redis",
    "name": "Redis Cache Server",
    "description": "High performance in-memory key-value data store.",
    "version": "7.0-alpine",
    "image": "redis:7.0-alpine",
    "ports": {"6379": "6379"},
    "volumes": {"redis_data": "/data"}
  }
]
```

### 2. Install App
Triggers an automated docker-compose generator, binds volumes, and starts the container block.
* Endpoint: `POST /api/v1/marketplace/templates/{template_id}/install`
* Request Payload: `{"port": 6379}`
* Response Schema: `{"status": "success", "message": "Redis installed and running on port 6379."}`

---

## Web Terminal SSH Websocket (`/api/v1/system/terminal/ws`)

Establishes a low-latency bidirectional pipeline to the host shell terminal session using WebSockets.

* Endpoint: `WS /api/v1/system/terminal/ws`
* Query Parameter: `token` (string, required JWT access token)
* Access Level: `super_admin` only

### WebSocket Communication Protocol
1. Pty Resize Event (Client ➡️ Server):
   Client maps terminal window resizes by sending JSON strings:
   ```json
   {"resize": {"cols": 80, "rows": 24}}
   ```
2. Standard Input (Client ➡️ Server):
   Client maps user keyboard strokes by sending raw text/binary strings:
   ```json
   "ls -la\r"
   ```
3. Standard Output (Server ➡️ Client):
   Server streams shell terminal responses back to the client as raw text strings.

---

## User Account Manager (`/api/v1/users`)

Enables administrators to manage developer and viewer credentials.

### 1. List Users
* Endpoint: `GET /api/v1/users`
* Access Level: `super_admin` only

### 2. Create User
* Endpoint: `POST /api/v1/users`
* Request Payload:
```json
{
  "username": "developer_bob",
  "password": "securepassword123",
  "role": "developer"
}
```

### 3. Update User (Role/Password)
* Endpoint: `PUT /api/v1/users/{user_id}`

### 4. Delete User
* Endpoint: `DELETE /api/v1/users/{user_id}`
