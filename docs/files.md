# File Access (TMUX_WEB_FS_ROOTS)

tmux-weblink provides a basic file browser and editor for **local files only**.
Remote FTP/SFTP access is not supported — use the extension SDK for that.

## Configuration

Set the `TMUX_WEB_FS_ROOTS` environment variable to a colon-separated list of
directories:

```
TMUX_WEB_FS_ROOTS=/home/me/projects:/var/log/myapp
```

When this variable is unset or empty, all file API endpoints return **403
Forbidden** (fail-closed).

## Endpoints

| Method | Path              | Description                                         |
|--------|-------------------|-----------------------------------------------------|
| GET    | `/api/file?path=` | Read a file's content (max 1 MiB)                   |
| PUT    | `/api/file`       | Write a file (body: `{path, content}`, atomic write) |
| POST   | `/api/file/delete`| Delete a file (body: `{path}`, directories refused)  |
| POST   | `/api/file/touch` | Create an empty file (body: `{path}`, 409 if exists) |

All endpoints require authentication.

## Limits

- **Max file size**: 1 MiB (1,048,576 bytes). Larger files return 413.
- **Recursive listing**: Max 5000 entries, max depth 8.
- **Path traversal**: All paths are normalized and must fall within a configured
  root. `../../../etc/passwd` is rejected.

## Security

- Paths are resolved with `path.resolve` + `path.normalize` and checked against
  every configured root directory.
- Writes use atomic write (write to temp file, then rename) to prevent partial
  writes.
- Directory deletion is explicitly refused (`isFile()` check).
- `touch` returns 409 Conflict if the file already exists.
