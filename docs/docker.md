# Docker Manager API (/api/v1/docker)

Provides global management and monitoring of the host's Docker daemon. Restricted to `super_admin` and `developer` roles.

---

## Container Management

### 1. List All Containers
Retrieves all active and stopped containers running on the host system.
* Endpoint: `GET /api/v1/docker/containers`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "c1b2c3d4e5f6",
    "name": "nginx-ingress-controller",
    "image": "nginx:alpine",
    "status": "Up 4 hours",
    "state": "running",
    "ports": "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp"
  }
]
```

### 2. Get Container Stats
Fetches real-time CPU and memory usage statistics.
* Endpoint: `GET /api/v1/docker/containers/{container_id}/stats`

#### Successful Response (`200 OK`)
```json
{
  "cpu": "1.45%",
  "mem_usage": "48.2MiB / 32.0GB",
  "mem_perc": "0.15%"
}
```

### 3. Container Lifecycle Action
Executes start, stop, restart, or removal commands on a target container.
* Endpoint: `POST /api/v1/docker/containers/{container_id}/action`

#### Request Payload
```json
{
  "action": "stop" 
}
```
*Options for `"action"`:* `start` | `stop` | `restart` | `remove`

### 4. Fetch Container Logs
* Endpoint: `GET /api/v1/docker/containers/{container_id}/logs`
* Query Parameter: `tail` (int, default: 200)
* Response Schema: `{"logs": "standard container output logs..."}`

---

## Docker System Resources

### 1. List Images
* Endpoint: `GET /api/v1/docker/images`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "sha256:8f9d0c2b...",
    "repository": "postgres",
    "tag": "15-alpine",
    "size": "240 MB",
    "created": "2 weeks ago"
  }
]
```

### 2. Prune Images
Triggers removal of dangling, unused Docker images to reclaim disk space.
* Endpoint: `POST /api/v1/docker/images/prune`
* Response Schema: `{"status": "success", "message": "Total reclaimed space: 1.84 GB"}`

### 3. List Volumes
* Endpoint: `GET /api/v1/docker/volumes`
* Response Schema: `List[{"name": "vol_name", "driver": "local"}]`

### 4. List Networks
* Endpoint: `GET /api/v1/docker/networks`
* Response Schema: `List[{"id": "net_id", "name": "net_name", "driver": "bridge", "scope": "local"}]`
