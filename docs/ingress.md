# Ingress Proxy Router API (/api/v1/ingress)

Configures custom reverse proxy server rules (Caddy/Nginx) mapping domain routes to local port processes or external server IP addresses. Restricted to `super_admin` and `developer` roles.

---

## Custom Ingress Rules (CRUD)

### 1. List Ingress Rules
* Endpoint: `GET /api/v1/ingress/rules`

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "ing-1234abcd",
    "domain_name": "portainer.example.com",
    "target_type": "port",
    "target_value": "9000",
    "max_body_size": "100M",
    "cors_enabled": false,
    "ssl_enabled": true,
    "ssl_expiry": "2026-09-30T10:00:00Z",
    "created_at": "2026-07-01T09:55:00Z"
  }
]
```

### 2. Create Ingress Rule
* Endpoint: `POST /api/v1/ingress/rules`

#### Request Payload
```json
{
  "domain_name": "redis-ui.example.com",
  "target_type": "port",
  "target_value": "8084",
  "max_body_size": "50M",
  "cors_enabled": true
}
```
*Options for `"target_type"`:* `port` (e.g. 8084) | `url` (e.g. `http://192.168.1.100:3000`)

#### Successful Response (`201 Created`)
Returns the created `IngressRule` object. Writes configuration template blocks to Caddy/Nginx folder structures and triggers asynchronous reverse proxy hot reloads automatically.

### 3. Update Ingress Rule
* Endpoint: `PUT /api/v1/ingress/rules/{rule_id}`

#### Request Payload (All fields optional)
```json
{
  "target_value": "8085",
  "max_body_size": "10M",
  "cors_enabled": false
}
```

### 4. Delete Ingress Rule
* Endpoint: `DELETE /api/v1/ingress/rules/{rule_id}`
* Successful Response: `204 No Content`
Removes the proxy configuration file and triggers a reverse proxy hot reload.

---

## Automated SSL/HTTPS Configuration

### 1. Request Let's Encrypt SSL
Instructs Certbot standalone challenges to request and install free SSL certificates for the ingress domain.
* Endpoint: `POST /api/v1/ingress/rules/{rule_id}/ssl`
* Successful Response (`200 OK`): Returns the rule object with updated `ssl_enabled = true`.
