# cPanel-Lite API Documentation Overview

Welcome to the cPanel-Lite API Documentation. The backend is built using FastAPI (Python) and serves as the orchestrator for all server operations, including project deployments, file management, database administration, custom proxy routing, and Docker container control.

---

## Base URL & Versions
* Development/Local Base URL: `http://localhost:8080`
* API Prefix: `/api/v1`
* Full URL Example: `http://localhost:8080/api/v1/projects`

---

## Authentication & Authorization

All endpoints (except login and webhook triggers) require a valid JSON Web Token (JWT) passed in the `Authorization` header.

### Authorization Header Format
```http
Authorization: Bearer <your_jwt_access_token>
```

### Role-Based Access Control (RBAC)
The API strictly enforces role checks for security:
1. **super_admin**: Full access to all endpoints, including User Manager, Database Administration, File operations, Custom Ingress routing, Settings, and backups.
2. **developer**: Access to Dashboard metrics, Projects, Docker container operations, File Explorer, Cron jobs, Ingress routing, and App Store installations. Restricted from Database connections management, User account CRUD, and system settings edits.
3. **viewer**: Read-only access to the main dashboard metrics. Restricted from all write, terminal, and management endpoints.

---

## API Reference Index

Detailed route parameters, request payloads, and response JSON schemas are categorized as follows:

1. [Authentication & Token Management](auth.md): Authenticating and retrieving JWTs.
2. [Project & Deployment Manager](projects.md): Configuring git repositories, environment variables, deploying, and domain bindings.
3. [Docker Container Administrator](docker.md): Tracking host containers, viewing live stats/logs, volume, network, and image pruning.
4. [Database GUI Administrator](databases.md): Connecting to SQLite/PostgreSQL/MySQL, querying tables, schema details, and SQL execution.
5. [File Explorer Manager](files.md): File listings, creation, edits, uploading, zip extraction, and downloads.
6. [Ingress Proxy Router](ingress.md): Creating custom reverse proxy routes (Caddy/Nginx) for any port or address.
7. [Backups, Cron Jobs & System Metrics](backups_cron_system.md): Backing up databases, managing scheduled cron jobs, reading live RAM/CPU telemetry, and system settings.
8. [App Store, Web Terminal, Alerting & Users](notifications_marketplace_terminal_users.md): 1-click template installers, SSH terminal websockets, Discord/Telegram webhook alert rules, and user account management.
