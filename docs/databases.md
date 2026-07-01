# Database Administrator API (/api/v1/databases)

Manages client connections to SQLite, PostgreSQL, or MySQL databases, and provides GUI capabilities for browsing tables, schemas, and executing raw SQL queries.

---

## Connection Management (CRUD)

### 1. List Database Connections
* Endpoint: `GET /api/v1/databases`
* Access Level: `super_admin` only

#### Successful Response (`200 OK`)
```json
[
  {
    "id": "db-connection-1",
    "name": "postgres-main-db",
    "db_type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "username": "postgres",
    "password": "encrypted_password",
    "database_name": "app_production",
    "file_path": null
  }
]
```

### 2. Add Connection
* Endpoint: `POST /api/v1/databases`
* Access Level: `super_admin` only

#### Request Payload (PostgreSQL/MySQL Example)
```json
{
  "name": "postgres-main-db",
  "db_type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "username": "postgres",
  "password": "your_secure_password",
  "database_name": "app_production"
}
```

#### Request Payload (SQLite Example)
```json
{
  "name": "local-sqlite-db",
  "db_type": "sqlite",
  "file_path": "/home/j1mb/app_data.db"
}
```

### 3. Update Connection
* Endpoint: `PUT /api/v1/databases/{db_id}`
* Access Level: `super_admin` only

### 4. Delete Connection
* Endpoint: `DELETE /api/v1/databases/{db_id}`
* Access Level: `super_admin` only

### 5. Test Connection Credentials
Validates database connection parameters before saving them to the database.
* Endpoint: `POST /api/v1/databases/test`
* Access Level: `super_admin` only
* Response Schema: `{"status": "success", "message": "Connection established successfully."}`

---

## Database GUI Explorer & SQL Client

### 1. List Tables
* Endpoint: `GET /api/v1/databases/{db_id}/tables`
* Response Schema: `{"tables": ["users", "posts", "comments"]}`

### 2. Show Table Schema Structure
* Endpoint: `GET /api/v1/databases/{db_id}/tables/{table_name}/schema`
* Response Schema: `List[{"column": "id", "type": "INTEGER", "nullable": false, "primary_key": true}]`

### 3. Browse Table Rows
Retrieves paginated row data from a specific table.
* Endpoint: `GET /api/v1/databases/{db_id}/tables/{table_name}/data`
* Query Parameters:
  * `page` (int, default: 1)
  * `limit` (int, default: 20)
* Response Schema:
```json
{
  "columns": ["id", "username", "role"],
  "rows": [
    [1, "admin", "super_admin"],
    [2, "developer_bob", "developer"]
  ],
  "total": 45,
  "page": 1,
  "pages": 3
}
```

### 4. Run Raw SQL Query
Executes a raw SQL statement on the connected database. Restricted to `super_admin` accounts.
* Endpoint: `POST /api/v1/databases/{db_id}/query`

#### Request Payload
```json
{
  "query": "SELECT * FROM users WHERE role = 'developer' LIMIT 5"
}
```

#### Successful Response (`200 OK`)
Returns the same column/rows format as the Browse Table Rows endpoint.
