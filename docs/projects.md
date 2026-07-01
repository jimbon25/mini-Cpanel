# Projects & Deployment API (/api/v1/projects)

Manages code repository parameters, environment configurations, systemd/Docker lifecycle actions, and SSL bindings.

---

## Project Configuration (CRUD)

### 1. List Projects
* Endpoint: `GET /api/v1/projects`
* Access Level: `developer` | `super_admin`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "proj-901c23ab",
    "name": "tdrive-client-nextjs",
    "provider": "docker",
    "git_repo": "https://github.com/example/tdrive-client-nextjs.git",
    "branch": "main",
    "port": 3000,
    "status": "online",
    "env_vars": "PORT=3000\nNODE_ENV=production",
    "last_deployed": "2026-07-01T08:32:42Z",
    "webhook_secret": "whsec_...",
    "ping_latency_ms": 14,
    "ping_error_detail": null,
    "enable_http_ping": true
  }
]
```

### 2. Create Project
* Endpoint: `POST /api/v1/projects`
* Access Level: `developer` | `super_admin`

#### Request Payload
```json
{
  "name": "tdrive-client-nextjs",
  "provider": "docker",
  "git_repo": "https://github.com/example/tdrive-client-nextjs.git",
  "branch": "main",
  "port": 3000,
  "env_vars": "PORT=3000\nNODE_ENV=production",
  "enable_http_ping": true
}
```

#### Successful Response (`201 Created`)
Returns the created project object with an assigned `id` and `webhook_secret`.

### 3. Update Project Configuration
* Endpoint: `PUT /api/v1/projects/{project_id}`
* Access Level: `developer` | `super_admin`

#### Request Payload (All fields optional)
Supports updating `git_repo`, `branch`, `port`, `env_vars`, and `enable_http_ping`.

### 4. Delete Project
* Endpoint: `DELETE /api/v1/projects/{project_id}`
* Access Level: `developer` | `super_admin`
* Successful Response: `204 No Content`

---

## Deployment & Lifecycle Controls

### 1. Deploy Project
Pulls the latest code from git, builds resources, writes config layouts, and starts the runtime service.
* Endpoint: `POST /api/v1/projects/{project_id}/deploy`
* Access Level: `developer` | `super_admin`

### 2. Start Project Service
* Endpoint: `POST /api/v1/projects/{project_id}/start`
* Access Level: `developer` | `super_admin`

### 3. Stop Project Service
* Endpoint: `POST /api/v1/projects/{project_id}/stop`
* Access Level: `developer` | `super_admin`

### 4. Fetch Build Logs
* Endpoint: `GET /api/v1/projects/{project_id}/logs`
* Access Level: `developer` | `super_admin`
* Response Schema: `{"logs": "build logs text..."}`

---

## Project Domains & SSL bindings

### 1. List Project Domains
* Endpoint: `GET /api/v1/projects/{project_id}/domains`

### 2. Map New Domain
* Endpoint: `POST /api/v1/projects/{project_id}/domains`
* Request Payload: `{"domain_name": "tdrive.example.com"}`

### 3. Remove Domain Map
* Endpoint: `DELETE /api/v1/projects/{project_id}/domains/{domain_id}`

### 4. Configure Let's Encrypt SSL
Triggers standalone certbot certificate requests for the domain in the background.
* Endpoint: `POST /api/v1/projects/{project_id}/domains/{domain_id}/ssl`

---

## Git Webhook & Auto Deployment

Supports automated deployment triggers when Git push events occur (compatible with GitHub/GitLab).

### 1. Trigger Webhook Deployment
* Endpoint: `POST /api/v1/projects/webhook/{project_id}`
* Access Level: Public (Validates signature headers using webhook secret)
* Response Schema: `{"status": "success", "message": "Deployment task queued."}`

### 2. Generate/Update Webhook Secret
* Endpoint: `POST /api/v1/projects/{project_id}/webhook/secret`
* Access Level: `developer` | `super_admin`
* Response Schema: `{"webhook_secret": "whsec_..."}`

### 3. Remove/Disable Webhook Secret
* Endpoint: `DELETE /api/v1/projects/{project_id}/webhook/secret`
* Access Level: `developer` | `super_admin`
* Response Schema: `{"status": "success", "message": "Webhook secret deleted."}`

