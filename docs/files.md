# File Explorer API (/api/v1/files)

Manages filesystem operations relative to the application's root directory. Accessible by `super_admin` and `developer` accounts.

---

## File & Directory Actions

### 1. List Directory Contents
* Endpoint: `GET /api/v1/files/list`
* Query Parameter: `path` (string, optional: relative path from project root).

#### Successful Response (`200 OK`)
```json
[
  {
    "name": "package.json",
    "path": "package.json",
    "is_dir": false,
    "size": 1824,
    "last_modified": "2026-06-30T17:49:35Z"
  },
  {
    "name": "src",
    "path": "src",
    "is_dir": true,
    "size": 4096,
    "last_modified": "2026-06-30T17:50:00Z"
  }
]
```

### 2. Read File Contents
Reads text files.
* Endpoint: `GET /api/v1/files/read`
* Query Parameter: `path` (string, required: relative path of target file).
* Response Schema: `{"path": "package.json", "content": "{ ... }"}`

### 3. Create or Edit File (Write)
Writes text data to a file. Overwrites existing contents if the file already exists.
* Endpoint: `POST /api/v1/files/write`

#### Request Payload
```json
{
  "path": "new_file.txt",
  "content": "Hello, world!"
}
```

### 4. Create New Directory (mkdir)
* Endpoint: `POST /api/v1/files/mkdir`

#### Request Payload
```json
{
  "path": "src/components/MyNewFolder"
}
```

### 5. Upload Binary File
Uploads a file via multipart form-data.
* Endpoint: `POST /api/v1/files/upload`
* Query Parameter: `path` (string, optional: target relative directory to save the file inside).
* Request Payload (multipart/form-data): File field named `file`.
* Response Schema: `{"filename": "logo.png", "success": true}`

### 6. Delete File or Folder
Recursively deletes files or directories.
* Endpoint: `DELETE /api/v1/files`
* Query Parameter: `path` (string, required: relative path to delete).
* Response Schema: `{"path": "src/temp", "success": true}`

---

## Archive Operations

### 1. Compress into ZIP (Zip)
* Endpoint: `POST /api/v1/files/zip`

#### Request Payload
```json
{
  "path": "src"
}
```
* Response Schema: `{"zip_path": "src.zip", "success": true}`

### 2. Extract ZIP Archive (Unzip)
Decompresses a ZIP file in its parent directory.
* Endpoint: `POST /api/v1/files/unzip`

#### Request Payload
```json
{
  "path": "src.zip"
}
```
* Response Schema: `{"zip_path": "src.zip", "success": true}`
