import React, { useState, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: number;
}

interface FileExplorerTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const detectLanguage = (path: string): string => {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "json";
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "html":
      return "html";
    case "css":
      return "css";
    case "py":
      return "python";
    case "sh":
      return "shell";
    case "yaml":
    case "yml":
      return "yaml";
    case "env":
      return "ini";
    default:
      return "plaintext";
  }
};

export default function FileExplorerTab({ token, addLog }: FileExplorerTabProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [newItemName, setNewItemName] = useState<string>("");
  const [newItemType, setNewItemType] = useState<"file" | "folder">("file");
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [fileError, setFileError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsClient(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const isTestEnv = typeof window === "undefined" || (typeof process !== "undefined" && process.env.NODE_ENV === "test");

  const fetchFiles = useCallback(async (path: string) => {
    setFileError("");
    try {
      const response = await fetch(`http://localhost:8080/api/v1/files/list?path=${encodeURIComponent(path)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(await response.json().then(d => d.detail).catch(() => "Failed to load directory"));
      }

      const data = await response.json();
      setFiles(Array.isArray(data) ? data : []);
      addLog(`Directory loaded: /${path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load files";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [token, addLog]);

  const handleCreateItem = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;

    const targetPath = currentPath ? `${currentPath}/${newItemName}` : newItemName;
    try {
      if (newItemType === "folder") {
        const response = await fetch("http://localhost:8080/api/v1/files/mkdir", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ path: targetPath }),
        });

        if (!response.ok) throw new Error("Failed to create folder");
        addLog(`Created directory: /${targetPath}`);
      } else {
        const response = await fetch("http://localhost:8080/api/v1/files/write", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ path: targetPath, content: "" }),
        });

        if (!response.ok) throw new Error("Failed to create file");
        addLog(`Created file: /${targetPath}`);
      }

      setNewItemName("");
      fetchFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [currentPath, newItemName, newItemType, token, fetchFiles, addLog]);

  const handleReadFile = useCallback(async (path: string) => {
    try {
      const response = await fetch(`http://localhost:8080/api/v1/files/read?path=${encodeURIComponent(path)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to read file");
      
      const data = await response.json();
      setEditingFile({ path: data.path, content: data.content });
      addLog(`Opened file for editing: /${path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cannot read file";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [token, addLog]);

  const handleSaveFile = useCallback(async () => {
    if (!editingFile) return;

    try {
      const response = await fetch("http://localhost:8080/api/v1/files/write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: editingFile.path, content: editingFile.content }),
      });

      if (!response.ok) throw new Error("Failed to save file");
      
      addLog(`Saved file content: /${editingFile.path}`);
      setEditingFile(null);
      fetchFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save file";
      alert(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [editingFile, token, currentPath, fetchFiles, addLog]);

  const handleDeleteItem = useCallback(async (path: string) => {
    if (!confirm(`Are you sure you want to delete /${path}?`)) return;

    try {
      const response = await fetch(`http://localhost:8080/api/v1/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete item");

      addLog(`Deleted item: /${path}`);
      fetchFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [token, currentPath, fetchFiles, addLog]);

  // ZIP and UNZIP operation handlers
  const handleZipItem = useCallback(async (path: string) => {
    addLog(`Compressing /${path} to ZIP...`);
    try {
      const response = await fetch("http://localhost:8080/api/v1/files/zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: "Zip failed" }));
        throw new Error(data.detail || "Failed to compress item");
      }

      addLog(`Compressed /${path} to ZIP archive.`);
      fetchFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Zip failed";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [token, currentPath, fetchFiles, addLog]);

  const handleUnzipItem = useCallback(async (path: string) => {
    addLog(`Decompressing archive /${path}...`);
    try {
      const response = await fetch("http://localhost:8080/api/v1/files/unzip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: "Unzip failed" }));
        throw new Error(data.detail || "Failed to extract zip file");
      }

      addLog(`Extracted ZIP archive successfully: /${path}`);
      fetchFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unzip failed";
      setFileError(msg);
      addLog(`File Manager Error: ${msg}`);
    }
  }, [token, currentPath, fetchFiles, addLog]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const uploadedFiles = e.dataTransfer.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    addLog(`Uploading ${uploadedFiles.length} file(s) via Drag & Drop...`);
    setFileError("");

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`http://localhost:8080/api/v1/files/upload?path=${encodeURIComponent(currentPath)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ detail: "Upload failed" }));
          throw new Error(errData.detail || "Failed to upload file");
        }

        addLog(`Uploaded file: ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setFileError(msg);
        addLog(`File Manager Error: ${msg}`);
      }
    }
    fetchFiles(currentPath);
  };

  const handleNavigateUp = useCallback(() => {
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/"));
  }, [currentPath]);

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchFiles(currentPath);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, currentPath, fetchFiles]);

  return (
    <section className="flex flex-col gap-4">
      {/* File Manager Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setCurrentPath("")}
            className="text-cobalt hover:underline font-bold"
          >
            apps
          </button>
          {currentPath &&
            currentPath.split("/").map((part, index, arr) => {
              const subpath = arr.slice(0, index + 1).join("/");
              return (
                <span key={index} className="flex items-center gap-2">
                  <span className="text-neutral-400">/</span>
                  <button
                    onClick={() => setCurrentPath(subpath)}
                    className="text-cobalt hover:underline"
                  >
                    {part}
                  </button>
                </span>
              );
            })}
        </div>

        {/* Create form */}
        <form onSubmit={handleCreateItem} className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={newItemType}
            onChange={(e) => setNewItemType(e.target.value as "file" | "folder")}
            className="border border-neutral-200 dark:border-neutral-800 text-xs font-mono px-2 py-1.5 rounded-lg bg-background text-foreground"
          >
            <option value="file">File</option>
            <option value="folder">Folder</option>
          </select>
          <input
            type="text"
            required
            placeholder="Name..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="border border-neutral-200 dark:border-neutral-800 text-xs font-mono px-3 py-1.5 rounded-lg bg-background text-foreground focus:outline-none focus:border-cobalt"
          />
          <button
            type="submit"
            className="border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-1.5 text-xs font-mono bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt transition-all"
          >
            CREATE
          </button>
        </form>
      </div>

      {fileError && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {fileError}
        </div>
      )}

      {/* Directory Explorer Panel */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flat-card divide-y divide-neutral-200 dark:divide-neutral-800 relative min-h-37.5"
      >
        {dragging && (
          <div className="absolute inset-0 border-2 border-dashed border-cobalt/60 flex items-center justify-center pointer-events-none z-10 font-mono text-xs font-bold text-cobalt bg-canvas-light/95 dark:bg-canvas-dark/95">
            DROP FILES HERE TO UPLOAD
          </div>
        )}

        {currentPath && (
          <div
            onClick={handleNavigateUp}
            className="flex items-center gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900/20 cursor-pointer font-mono text-xs text-neutral-400 select-none"
          >
            <span>📁</span>
            <span>.. (Up one level)</span>
          </div>
        )}

        {files.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-400 font-mono">
            Empty directory. Create a file or drop one here to upload.
          </div>
        ) : (
          files.map((file) => {
            const isZip = file.name.toLowerCase().endsWith(".zip");
            return (
              <div
                key={file.path}
                className="flex justify-between items-center p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900/20 transition-all font-mono text-xs"
              >
                <div
                  onClick={() => {
                    if (file.is_dir) {
                      setCurrentPath(file.path);
                    } else if (isZip) {
                      // Do nothing or unzip trigger
                    } else {
                      handleReadFile(file.path);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer select-none group flex-1"
                  data-testid={`file-item-${file.name}`}
                >
                  <span>{file.is_dir ? "📁" : isZip ? "📦" : "📄"}</span>
                  <span className="text-foreground group-hover:text-cobalt group-hover:underline">
                    {file.name}
                  </span>
                </div>
                
                <div className="flex items-center gap-6 text-neutral-500">
                  <span>{file.is_dir ? "Folder" : formatBytes(file.size)}</span>
                  <div className="flex items-center gap-3">
                    {isZip ? (
                      <button
                        onClick={() => handleUnzipItem(file.path)}
                        className="hover:text-cobalt text-neutral-400"
                      >
                        UNZIP
                      </button>
                    ) : (
                      !file.is_dir && (
                        <button
                          onClick={() => handleReadFile(file.path)}
                          className="hover:text-cobalt text-neutral-400"
                        >
                          EDIT
                        </button>
                      )
                    )}
                    <button
                      onClick={() => handleZipItem(file.path)}
                      className="hover:text-cobalt text-neutral-400"
                    >
                      ZIP
                    </button>
                    <button
                      onClick={() => handleDeleteItem(file.path)}
                      className="hover:text-red-500 text-neutral-400"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inline Monaco Text Editor (Modal or Overlay) */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-4xl flat-card bg-canvas-dark text-neutral-100 flex flex-col h-[80vh] border-neutral-800 rounded-lg overflow-hidden">
            <header className="flex justify-between items-center p-4 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-mono font-bold text-neutral-400">EDITING FILE</h3>
                <p className="text-xs font-mono text-white mt-0.5">/{editingFile.path}</p>
              </div>
              <button
                onClick={() => setEditingFile(null)}
                className="text-xs text-neutral-400 hover:text-white font-mono"
              >
                CLOSE
              </button>
            </header>
            
            {/* Fallback to standard Textarea in testing/server-side context to avoid JSDOM compatibility crashes */}
            {(!isClient || isTestEnv) ? (
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                className="flex-1 p-4 bg-canvas-dark text-neutral-300 font-mono text-xs resize-none focus:outline-none focus:ring-0 border-0"
                spellCheck={false}
                placeholder="# Write content here..."
              />
            ) : (
              <div className="flex-1 w-full bg-canvas-dark relative min-h-75">
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={detectLanguage(editingFile.path)}
                  value={editingFile.content}
                  onChange={(val) => setEditingFile({ ...editingFile, content: val || "" })}
                  options={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    minimap: { enabled: false },
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                />
              </div>
            )}
            
            <footer className="flex justify-end gap-3 p-4 border-t border-neutral-800 bg-neutral-900/10">
              <button
                onClick={() => setEditingFile(null)}
                className="border border-neutral-800 rounded px-4 py-2 text-xs font-mono text-neutral-400 hover:text-white hover:border-neutral-700 transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleSaveFile}
                className="border border-cobalt rounded px-4 py-2 text-xs font-mono text-white bg-cobalt hover:bg-[#2c4eff] transition-all"
              >
                SAVE CHANGES
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
