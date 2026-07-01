# Authentication API (/api/v1/auth)

Handles secure user login, credential verification, JWT token generation, and current session checks.

---

## Login & Retrieve Token

Authenticates user credentials and returns a JWT access token valid for session API calls.

* Endpoint: `POST /api/v1/auth/login`
* Content-Type: `application/x-www-form-urlencoded` or `application/json`
* Access Level: Public / Unauthenticated

### Request Payload (Form Data)
| Field | Type | Required | Description |
|---|---|---|---|
| `username` | string | Yes | The username of the account. |
| `password` | string | Yes | The plain text password. |

### Successful Response (`200 OK`)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer",
  "role": "super_admin",
  "username": "admin"
}
```

### Error Responses
* `400 Bad Request`: Username/password is missing or invalid.
* `401 Unauthorized`: Invalid username or password.
* `423 Locked`: Account temporarily locked due to excessive failed login attempts (Brute force protection active).

---

## Check Current Session Profile

Retrieves details of the user associated with the active JWT session token.

* Endpoint: `GET /api/v1/auth/me`
* Access Level: Authorized (`viewer` | `developer` | `super_admin`)

### Successful Response (`200 OK`)
```json
{
  "id": "usr-8f9d0c2b",
  "username": "admin",
  "role": "super_admin",
  "created_at": "2026-06-25T14:20:00Z"
}
```
