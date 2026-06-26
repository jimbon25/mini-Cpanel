import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/app/utils/apiClient";
import { useNotification } from "@/app/context/NotificationContext";

interface DatabaseConnection {
  id: string;
  name: string;
  db_type: string;
  host: string | null;
  port: number | null;
  username: string | null;
  database_name: string | null;
  file_path: string | null;
}

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primary_key: boolean;
}

interface DatabasesTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

export default function DatabasesTab({ token, addLog }: DatabasesTabProps) {
  const { showToast, confirm } = useNotification();
  // Database list states
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>("primary-sqlite");
  
  // Table inspection states
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableTab, setTableTab] = useState<"browse" | "structure">("browse");
  
  // Table schema & data states
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [schema, setSchema] = useState<TableColumn[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const constLimit = 20;

  // Raw Query states
  const [isQueryView, setIsQueryView] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: unknown[][];
    rows_affected: number;
    execution_time_ms: number;
    error?: string;
  } | null>(null);

  // New Connection Form States
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDbType, setFormDbType] = useState("sqlite");
  const [formFilePath, setFormFilePath] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDbName, setFormDbName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDatabases = useCallback(async () => {
    setError("");
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/databases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load databases list");
      const data: DatabaseConnection[] = await response.json();
      console.log("FETCHED DATABASES DATA:", data);
      setDatabases(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load databases error";
      setError(msg);
      addLog(`Database Admin Error: ${msg}`);
    }
  }, [token, addLog]);

  const fetchTables = useCallback(async (dbId: string) => {
    setError("");
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/databases/${dbId}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch database tables");
      const data = await response.json();
      setTables(data.tables || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch tables error";
      setError(msg);
      addLog(`Database Admin Error: ${msg}`);
    }
  }, [token, addLog]);

  const fetchTableSchema = useCallback(async (dbId: string, tbl: string) => {
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/databases/${dbId}/tables/${tbl}/schema`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch table schema");
      const data = await response.json();
      setSchema(data.schema || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch schema error";
      addLog(`Database Admin Error: ${msg}`);
    }
  }, [token, addLog]);

  const fetchTableData = useCallback(async (dbId: string, tbl: string, currentPage: number) => {
    try {
      const response = await apiClient.fetch(
        `http://localhost:8080/api/v1/databases/${dbId}/tables/${tbl}/data?page=${currentPage}&limit=${constLimit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Failed to fetch table data");
      const data = await response.json();
      setColumns(data.columns || []);
      setRows(data.rows || []);
      setTotalRecords(data.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch data error";
      addLog(`Database Admin Error: ${msg}`);
    }
  }, [token, addLog]);

  // Handle db change
  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchDatabases();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, fetchDatabases]);

  useEffect(() => {
    if (token && selectedDbId) {
      const timer = setTimeout(() => {
        fetchTables(selectedDbId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, selectedDbId, fetchTables]);

  useEffect(() => {
    if (token && selectedDbId && selectedTable) {
      const timer = setTimeout(() => {
        if (tableTab === "structure") {
          fetchTableSchema(selectedDbId, selectedTable);
        } else {
          fetchTableData(selectedDbId, selectedTable, page);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, selectedDbId, selectedTable, tableTab, page, fetchTableSchema, fetchTableData]);

  const handleRegisterDb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;
    setLoading(true);
    setError("");
    
    const payload = {
      name: formName,
      db_type: formDbType,
      file_path: formFilePath || null,
      host: formHost || null,
      port: formPort ? parseInt(formPort) : null,
      username: formUsername || null,
      password: formPassword || null,
      database_name: formDbName || null,
    };

    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/databases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to register database connection");
      
      showToast(`Database connection '${formName}' registered successfully`, "success");
      addLog(`Registered database connection '${formName}'.`);
      setFormName("");
      setFormFilePath("");
      setFormHost("");
      setFormPort("");
      setFormUsername("");
      setFormPassword("");
      setFormDbName("");
      setShowAddForm(false);
      fetchDatabases();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
      addLog(`Database Admin Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDb = (id: string, name: string) => {
    if (id === "primary-sqlite") return;
    confirm({
      message: `Are you sure you want to remove database connection '${name}'?`,
      onConfirm: async () => {
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/databases/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) throw new Error("Failed to unregister database connection");
          
          showToast(`Database connection '${name}' removed successfully`, "success");
          addLog(`Removed database connection '${name}'.`);
          if (selectedDbId === id) {
            setSelectedDbId("primary-sqlite");
            setSelectedTable(null);
            setColumns([]);
            setRows([]);
            setQueryResult(null);
          }
          fetchDatabases();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Deletion failed";
          showToast(msg, "error");
          addLog(`Database Admin Error: ${msg}`);
        }
      }
    });
  };

  const handleExecuteQuery = async () => {
    if (!rawQuery.trim()) return;
    setLoading(true);
    setQueryResult(null);
    addLog(`Executing custom SQL query on selected database...`);

    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/databases/${selectedDbId}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: rawQuery }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Query execution failed");
      }

      setQueryResult(data);
      addLog(`Query completed successfully in ${data.execution_time_ms}ms.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SQL execution failed";
      setQueryResult({
        columns: [],
        rows: [],
        rows_affected: 0,
        execution_time_ms: 0,
        error: msg,
      });
      addLog(`Database Admin Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sidebar - Connection List & Tables list */}
      <aside className="lg:col-span-1 flex flex-col gap-4 border-r border-border-sem pr-0 lg:pr-6">
        {/* Database selector */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm text-muted-sem font-mono tracking-wider uppercase">Active Databases</h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-xs text-cobalt font-mono border border-cobalt/20 hover:border-cobalt/60 px-2 py-0.5 rounded transition-all"
            >
              + ADD NEW
            </button>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            {databases.map((db) => (
              <div
                key={db.id}
                className={`flex justify-between items-center p-2 rounded-lg border text-xs font-mono transition-all ${
                  selectedDbId === db.id
                    ? "bg-foreground-sem border-cobalt text-background-sem font-bold"
                    : "bg-card-sem border-border-sem text-muted-sem hover:text-foreground-sem hover:border-neutral-400"
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedDbId(db.id);
                    setIsQueryView(false);
                    setSelectedTable(null);
                    setColumns([]);
                    setRows([]);
                    setQueryResult(null);
                  }}
                  className="flex-1 text-left truncate"
                >
                  {db.name}
                </button>
                {db.id !== "primary-sqlite" && (
                  <button
                    onClick={() => handleDeleteDb(db.id, db.name)}
                    className="text-red-500/60 hover:text-red-500 pl-2 text-xs"
                  >
                    DEL
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Database Registration Form Drawer */}
        {showAddForm && (
          <form
            onSubmit={handleRegisterDb}
            className="flex flex-col gap-3 p-4 border border-border-sem bg-card-sem rounded-lg text-sm font-mono"
          >
            <h4 className="text-xs text-muted-sem uppercase tracking-widest font-bold border-b border-border-sem pb-1.5">
              New DB Connection
            </h4>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-sem">CONN NAME *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                placeholder="My MySQL DB"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-sem">TYPE</label>
              <select
                value={formDbType}
                onChange={(e) => setFormDbType(e.target.value)}
                className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
              >
                <option value="sqlite">SQLite</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>

            {formDbType === "sqlite" ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-sem">FILE PATH *</label>
                <input
                  type="text"
                  required
                  value={formFilePath}
                  onChange={(e) => setFormFilePath(e.target.value)}
                  className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                  placeholder="/home/user/my_db.db"
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] text-muted-sem">HOST</label>
                    <input
                      type="text"
                      required
                      value={formHost}
                      onChange={(e) => setFormHost(e.target.value)}
                      className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-sem">PORT</label>
                    <input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                      className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                      placeholder={formDbType === "postgresql" ? "5432" : "3306"}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-sem">USER</label>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                      placeholder="root"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-sem">PASSWORD</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                      placeholder="pass"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-sem">DB NAME</label>
                  <input
                    type="text"
                    required
                    value={formDbName}
                    onChange={(e) => setFormDbName(e.target.value)}
                    className="bg-input-sem border border-border-sem rounded p-1 text-foreground-sem text-xs"
                    placeholder="my_database"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-cobalt hover:bg-cobalt/80 text-white rounded p-1.5 text-xs font-bold transition-all disabled:opacity-50"
            >
              {loading ? "SAVING..." : "REGISTER DB"}
            </button>
          </form>
        )}

        {/* List of Tables */}
        <div className="flex flex-col gap-2 mt-2">
          <h3 className="text-xs text-muted-sem font-mono tracking-wider uppercase">Tables List</h3>
          {tables.length === 0 ? (
            <div className="text-xs font-mono text-muted-sem italic p-3 border border-dashed border-border-sem rounded-lg text-center">
              No tables found
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-96 overflow-y-auto font-mono text-xs">
              {tables.map((tbl) => (
                <button
                  key={tbl}
                  onClick={() => {
                    setSelectedTable(tbl);
                    setIsQueryView(false);
                    setPage(1);
                  }}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    selectedTable === tbl && !isQueryView
                      ? "border-cobalt bg-cobalt/10 text-cobalt font-bold"
                      : "border-border-sem text-muted-sem hover:text-foreground-sem hover:bg-input-sem"
                  }`}
                >
                  {tbl}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <article className="lg:col-span-3 flex flex-col gap-6">
        {/* Top Control Bar */}
        <div className="flex flex-wrap justify-between items-center p-4 border border-border-sem bg-card-sem rounded-lg gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-sem font-mono uppercase tracking-widest">
              Selected Database
            </span>
            <span className="text-sm font-bold tracking-tight text-foreground-sem">
              {databases.find((d) => d.id === selectedDbId)?.name || "cPanel SQLite DB"}
            </span>
          </div>

          <button
            onClick={() => {
              setIsQueryView(true);
              setSelectedTable(null);
            }}
            className={`px-3 py-1.5 font-mono text-xs rounded border transition-all ${
              isQueryView
                ? "bg-cobalt border-cobalt text-white font-bold"
                : "border-border-sem text-muted-sem hover:text-foreground-sem"
            }`}
          >
            SQL QUERY EDITOR
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
            {error}
          </div>
        )}

        {/* Dynamic Inner Panel */}
        {isQueryView ? (
          /* RAW SQL QUERY VIEWER */
          <div className="flex flex-col gap-4 border border-border-sem p-4 rounded-lg bg-card-sem">
            <h3 className="text-xs font-mono text-muted-sem tracking-wider uppercase border-b border-border-sem pb-2">
              Execute SQL query on dynamic connection
            </h3>

            <div className="flex flex-col gap-2 mt-2">
              <textarea
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                rows={5}
                className="bg-input-sem text-foreground-sem font-mono text-xs border border-border-sem rounded-lg p-2.5 w-full focus:outline-none focus:border-cobalt"
                placeholder="SELECT * FROM users LIMIT 10;"
              />
            </div>

            <div className="flex">
              <button
                onClick={handleExecuteQuery}
                disabled={loading || !rawQuery.trim()}
                className="bg-cobalt hover:bg-cobalt/90 text-white font-mono text-xs px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
              >
                {loading ? "EXECUTING SQL..." : "RUN QUERY"}
              </button>
            </div>

            {queryResult && (
              <div className="flex flex-col gap-3 mt-4 border-t border-border-sem pt-4">
                <div className="flex justify-between items-center text-[10px] text-muted-sem font-mono uppercase">
                  <span>Execution Time: {queryResult.execution_time_ms} ms</span>
                  <span>Rows Affected: {queryResult.rows_affected}</span>
                </div>

                {queryResult.error ? (
                  <div className="text-xs text-red-400 font-mono border border-red-500/20 bg-red-500/5 p-3 rounded-lg">
                    ERROR: {queryResult.error}
                  </div>
                ) : queryResult.columns.length === 0 ? (
                  <div className="text-xs text-muted-sem font-mono p-3 border border-border-sem rounded-lg bg-input-sem italic">
                    Query successfully executed. No output returned.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-border-sem rounded-lg max-h-96">
                    <table className="w-full border-collapse text-left font-mono text-xs text-foreground-sem">
                      <thead className="bg-input-sem border-b border-border-sem font-bold text-muted-sem">
                        <tr>
                          {queryResult.columns.map((col) => (
                            <th key={col} className="p-2.5 border-r border-border-sem">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-sem">
                        {queryResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-input-sem">
                            {row.map((val, cellIdx) => (
                              <td key={cellIdx} className="p-2.5 border-r border-border-sem truncate max-w-xs">
                                {val === null ? (
                                  <span className="text-muted-sem italic">NULL</span>
                                ) : typeof val === "boolean" ? (
                                  val ? "TRUE" : "FALSE"
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : selectedTable ? (
          /* TABLE BROWSING / SCHEMA VIEW */
          <div className="flex flex-col gap-4 border border-border-sem p-4 rounded-lg bg-card-sem">
            {/* Table inner sub tabs */}
            <div className="flex border-b border-border-sem">
              <button
                onClick={() => setTableTab("browse")}
                className={`py-1.5 px-3 font-mono text-xs uppercase border-b-2 transition-all ${
                  tableTab === "browse"
                    ? "border-cobalt text-foreground-sem font-bold"
                    : "border-transparent text-muted-sem hover:text-foreground-sem"
                }`}
              >
                Browse Data
              </button>
              <button
                onClick={() => setTableTab("structure")}
                className={`py-1.5 px-3 font-mono text-xs uppercase border-b-2 transition-all ${
                  tableTab === "structure"
                    ? "border-cobalt text-foreground-sem font-bold"
                    : "border-transparent text-muted-sem hover:text-foreground-sem"
                }`}
              >
                Structure / Schema
              </button>
            </div>

            {tableTab === "structure" ? (
              /* TABLE SCHEMA STRUCTURE VIEW */
              <div className="overflow-x-auto border border-border-sem rounded-lg mt-2">
                <table className="w-full border-collapse text-left font-mono text-xs text-foreground-sem">
                  <thead className="bg-input-sem border-b border-border-sem font-bold text-muted-sem">
                    <tr>
                      <th className="p-2.5">COLUMN</th>
                      <th className="p-2.5">TYPE</th>
                      <th className="p-2.5">NULLABLE</th>
                      <th className="p-2.5">KEY</th>
                      <th className="p-2.5">DEFAULT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-sem bg-input-sem/10">
                    {schema.map((col) => (
                      <tr key={col.name} className="hover:bg-input-sem">
                        <td className="p-2.5 font-bold text-foreground-sem">{col.name}</td>
                        <td className="p-2.5 text-muted-sem">{col.type}</td>
                        <td className="p-2.5">{col.nullable ? "Yes" : "No"}</td>
                        <td className="p-2.5 text-cobalt">{col.primary_key ? "PRIMARY" : ""}</td>
                        <td className="p-2.5">
                          {col.default === null ? (
                            <span className="text-muted-sem italic">None</span>
                          ) : (
                            col.default
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* TABLE BROWSE DATA VIEW */
              <div className="flex flex-col gap-4 mt-2">
                <div className="overflow-x-auto border border-border-sem rounded-lg max-h-125">
                  <table className="w-full border-collapse text-left font-mono text-xs text-foreground-sem">
                    <thead className="bg-input-sem border-b border-border-sem font-bold text-muted-sem">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="p-2 border-r border-border-sem">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-sem bg-input-sem/10">
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={columns.length || 1}
                            className="p-4 text-center text-muted-sem italic"
                          >
                            Table contains no rows
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-input-sem">
                            {row.map((val, cellIdx) => (
                              <td key={cellIdx} className="p-2 border-r border-border-sem truncate max-w-xs">
                                {val === null ? (
                                  <span className="text-muted-sem italic">NULL</span>
                                ) : typeof val === "boolean" ? (
                                  val ? "TRUE" : "FALSE"
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination bar */}
                {totalRecords > constLimit && (
                  <div className="flex justify-between items-center font-mono text-xs mt-2 select-none">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="border border-border-sem rounded px-2.5 py-1 hover:bg-input-sem disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      &lt; PREV
                    </button>
                    <span className="text-muted-sem text-[10px]">
                      PAGE {page} OF {Math.ceil(totalRecords / constLimit)} ({totalRecords} RECORDS)
                    </span>
                    <button
                      disabled={page * constLimit >= totalRecords}
                      onClick={() => setPage(page + 1)}
                      className="border border-border-sem rounded px-2.5 py-1 hover:bg-input-sem disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      NEXT &gt;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* INITIAL EMPTY VIEW */
          <div className="border border-dashed border-border-sem rounded-lg p-12 text-center text-muted-sem font-mono text-xs flex flex-col justify-center items-center gap-3">
            <svg
              className="w-12 h-12 text-muted-sem"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 7v10c0 2 2 3 6 3s6-1 6-3V7M4 7c0 2 2 3 6 3s6-1 6-3M4 7c0-2 2-3 6-3s6 1 6 3m0 5c0 2-2 3-6 3s-6-1-6-3"
              />
            </svg>
            <p>Select a table from the sidebar list to browse schema / rows</p>
            <p className="text-muted-sem text-[10px]">
              Or open the SQL Query Editor at the top to write raw commands
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
