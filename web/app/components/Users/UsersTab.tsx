import React, { useState, useEffect, useCallback } from "react";
import { parseUTCDate } from "@/app/utils/date";


export interface UserResponse {
  id: string;
  username: string;
  role: string;
  created_at: string;
}

interface UsersTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

function getActiveUsername(token: string | null): string | null {
  if (!token) return null;
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload).sub || null;
  } catch {
    return null;
  }
}

export default function UsersTab({ token, addLog }: UsersTabProps) {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("developer");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");

  const currentUsername = getActiveUsername(token);

  const fetchUsers = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/api/v1/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Access denied: Restricted to Super Admins.");
        }
        throw new Error("Failed to load user accounts list.");
      }
      const data: UserResponse[] = await response.json();
      setUsers(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load failed";
      setError(msg);
      addLog(`User Management Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [token, addLog]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      alert("Username and password are required.");
      return;
    }
    if (newUsername.length < 3) {
      alert("Username must be at least 3 characters long.");
      return;
    }
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    addLog(`Creating new user account: ${newUsername} with role: ${newRole}...`);

    try {
      const response = await fetch("http://localhost:8080/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Create failed" }));
        throw new Error(errData.detail || "Failed to create user");
      }

      const created: UserResponse = await response.json();
      addLog(`User account created successfully: ${created.username}`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("developer");
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      alert(msg);
      addLog(`User Management Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, username: string) => {
    if (editPassword && editPassword.length < 6) {
      alert("Password must be at least 6 characters long if specified.");
      return;
    }

    setLoading(true);
    addLog(`Updating user settings for account: ${username}...`);

    try {
      const payload: Record<string, string> = { role: editRole };
      if (editPassword) {
        payload.password = editPassword;
      }

      const response = await fetch(`http://localhost:8080/api/v1/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Update failed" }));
        throw new Error(errData.detail || "Failed to update user");
      }

      addLog(`User account updated successfully: ${username}`);
      setEditingUserId(null);
      setEditPassword("");
      setEditRole("");
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      alert(msg);
      addLog(`User Management Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === currentUsername) {
      alert("Self-deletion is restricted. You cannot delete the currently logged in administrator account.");
      return;
    }

    if (!confirm(`Are you sure you want to delete user account '${username}'?`)) {
      return;
    }

    setLoading(true);
    addLog(`Deleting user account: ${username}...`);

    try {
      const response = await fetch(`http://localhost:8080/api/v1/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Delete failed" }));
        throw new Error(errData.detail || "Failed to delete user");
      }

      addLog(`User account deleted successfully: ${username}`);
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      alert(msg);
      addLog(`User Management Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (user: UserResponse) => {
    setEditingUserId(user.id);
    setEditRole(user.role);
    setEditPassword("");
  };

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, fetchUsers]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <span className="text-white bg-cobalt font-bold font-mono px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
            super admin
          </span>
        );
      case "developer":
        return (
          <span className="text-neutral-300 bg-neutral-800 border border-neutral-700 font-medium font-mono px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
            developer
          </span>
        );
      case "viewer":
      default:
        return (
          <span className="text-neutral-400 bg-neutral-900 border border-neutral-800 font-light font-mono px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
            viewer
          </span>
        );
    }
  };

  return (
    <section className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10 rounded-lg">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">User Management</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Manage administrative accounts, access credentials, and role permissions.</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User Form Card */}
        <article className="flat-card p-6 flex flex-col gap-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-lg h-fit">
          <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Add New Account</h3>
          </div>

          <form onSubmit={handleCreateUser} data-testid="create-user-form" className="flex flex-col gap-4 font-mono text-xs mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cobalt"
                placeholder="who is json?"
                required
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cobalt"
                placeholder="******"
                required
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Role Permission</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                data-testid="create-role-select"
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cobalt font-mono"
                disabled={loading}
              >
                <option value="viewer">Viewer (Read-only dashboard metrics)</option>
                <option value="developer">Developer (Manage apps, crons, projects, file browser)</option>
                <option value="super_admin">Super Admin (All operations + database, backups, terminal, users)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="border border-neutral-200 dark:border-neutral-800 rounded px-4 py-2.5 text-xs font-mono bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt disabled:opacity-50 transition-all font-bold mt-2"
            >
              {loading ? "CREATING..." : "CREATE USER ACCOUNT"}
            </button>
          </form>
        </article>

        {/* User List Table Card */}
        <article className="flat-card p-6 flex flex-col gap-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-lg lg:col-span-2">
          <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Active Users</h3>
          </div>

          <div className="overflow-x-auto w-full mt-2">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                  <th className="py-2.5 px-3">Account</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-neutral-500">
                      {loading ? "Loading users..." : "No user accounts found."}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const isSelf = user.username === currentUsername;
                    const isEditing = editingUserId === user.id;

                    return (
                      <tr key={user.id} className="hover:bg-neutral-500/5 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center font-bold text-neutral-400">
                              {user.username.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="font-semibold text-white">
                              {user.username}
                              {isSelf && (
                                <span className="ml-2 text-[10px] text-cobalt font-bold uppercase tracking-wider">
                                  (You)
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {isEditing ? (
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              disabled={isSelf} // Self-demotion block in frontend
                              data-testid="edit-role-select"
                              className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white font-mono text-xs"
                            >
                              <option value="viewer">viewer</option>
                              <option value="developer">developer</option>
                              <option value="super_admin">super_admin</option>
                            </select>
                          ) : (
                            getRoleBadge(user.role)
                          )}
                        </td>
                        <td className="py-3 px-3 text-neutral-400 text-[10px]">
                          {parseUTCDate(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-1 items-center">
                              <input
                                type="password"
                                placeholder="New password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 text-white font-mono text-xs w-28 placeholder:text-neutral-600 focus:outline-none focus:border-cobalt"
                              />
                              <button
                                onClick={() => handleUpdateUser(user.id, user.username)}
                                className="border border-cobalt/40 text-cobalt hover:bg-cobalt hover:text-white px-2 py-0.5 rounded text-[10px] font-bold transition-all uppercase"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="border border-neutral-700 text-neutral-400 hover:text-white px-2 py-0.5 rounded text-[10px] transition-all uppercase"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2 items-center">
                              <button
                                onClick={() => startEditing(user)}
                                className="text-neutral-400 hover:text-white hover:underline text-[11px]"
                              >
                                EDIT
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                disabled={isSelf}
                                className={`text-[11px] ${
                                  isSelf
                                    ? "text-neutral-600 cursor-not-allowed"
                                    : "text-red-500/80 hover:text-red-500 hover:underline"
                                }`}
                                title={isSelf ? "Self-deletion restricted" : "Delete user"}
                              >
                                {isSelf ? "PADLOCKED" : "DELETE"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
