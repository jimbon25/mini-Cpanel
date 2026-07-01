# Backups, Cron Jobs & System API

Covers system database backups, cron job task schedules, host resource telemetry metrics, and global settings.

---

## Backups Management (`/api/v1/backups`)

Enables automated or manual exports of target databases/volumes to S3, Google Drive, or local storage.

### 1. List Backups
* Endpoint: `GET /api/v1/backups`
* Access Level: `super_admin` only

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "backup-1234abcd",
    "project_id": "proj-901c23ab",
    "name": "backup_cpanel_lite_20260701.tar.gz",
    "backup_type": "full",
    "storage_provider": "local",
    "file_path": "/var/backups/cpanel/backup_cpanel_lite_20260701.tar.gz",
    "file_size": 2489012,
    "created_at": "2026-07-01T03:00:00Z"
  }
]
```

### 2. Trigger Manual Backup
* Endpoint: `POST /api/v1/backups`
* Access Level: `super_admin` only

#### Request Payload
```json
{
  "project_id": "proj-901c23ab",
  "backup_type": "full",
  "storage_provider": "local"
}
```

### 3. Download Backup File
* Endpoint: `GET /api/v1/backups/{backup_id}/download`
* Response Type: Binary file stream (`application/octet-stream`)

### 4. Restore Database/System Backup
* Endpoint: `POST /api/v1/backups/{backup_id}/restore`
* Response Schema: `{"status": "success", "message": "Database successfully restored."}`

### 5. Delete Backup File
* Endpoint: `DELETE /api/v1/backups/{backup_id}`

---

## Cron Jobs Scheduler (`/api/v1/projects/{project_id}/cron`)

Schedules background commands on Linux Crontab or Windows Task Scheduler.

### 1. List Cron Jobs
* Endpoint: `GET /api/v1/projects/{project_id}/cron`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "cron-1234abcd",
    "project_id": "proj-901c23ab",
    "name": "system_cleanup_job",
    "schedule": "0 0 * * *",
    "command": "rm -rf /tmp/cache/*",
    "is_active": true,
    "last_run": "2026-07-01T00:00:00Z",
    "last_output": "Cleaned up 14 files."
  }
]
```

### 2. Add Cron Job
* Endpoint: `POST /api/v1/projects/{project_id}/cron`
* Request Payload: `{"name": "cleanup", "schedule": "0 0 * * *", "command": "rm -rf /tmp/*"}`

### 3. Update Cron Job Parameters
* Endpoint: `PUT /api/v1/projects/{project_id}/cron/{cron_id}`
* Request Payload: `{"schedule": "*/5 * * * *", "is_active": false}`

### 4. Delete Cron Job
* Endpoint: `DELETE /api/v1/projects/{project_id}/cron/{cron_id}`

---

## System Metrics & Settings (`/api/v1/system`)

Retrieves server hardware stats, global cPanel logger activity feed, and settings variables.

### 1. Get Telemetry Metrics
* Endpoint: `GET /api/v1/system/metrics`
* Access Level: Authorized (`viewer` | `developer` | `super_admin`)

#### Successful Response (`200 OK`)
```json
{
  "cpu": {
    "usage": 6.3,
    "temp": 49.0,
    "cores": 32,
    "topology": "16 Cores / 32 Threads"
  },
  "ram": {
    "total": 34359738368,
    "used": 4617089024,
    "free": 29742649344,
    "percent": 13.5
  },
  "disk": {
    "total": 1030792151040,
    "used": 201007206400,
    "free": 829784944640,
    "percent": 19.5
  },
  "uptime": "45d 1h 33m 51s",
  "os": "Arch Linux (x86_64)",
  "kernel": "6.9.7-arch1-1"
}
```

### 2. Read Activity Logs
Fetches the last 50 entries recorded in the cPanel-Lite global activity logs table.
* Endpoint: `GET /api/v1/system/activity-logs`

### 3. Get Proxy Settings
* Endpoint: `GET /api/v1/system/settings`
* Response Schema: `{"proxy_type": "caddy", "proxy_log_path": "/var/log/caddy/access.log"}`

### 4. Update Settings
* Endpoint: `POST /api/v1/system/settings`
* Access Level: `super_admin` only
* Request Payload: `{"proxy_type": "caddy", "proxy_log_path": "/var/log/caddy/access.log"}`
