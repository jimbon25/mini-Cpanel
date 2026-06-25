import React, { useState, useEffect, useCallback } from "react";

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
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>("primary-sqlite");
  
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableTab, setTableTab] = useState<"browse" | "structure">("browse");
  
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [schema, setSchema] = useState<TableColumn[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const constLimit = 20;

  const [isQueryView, setIsQueryView] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: unknown[][];
    rows_affected: number;
    execution_time_ms: number;
    error?: string;
  } | null>(null);

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
      const response = await fetch("http://localhost:8080/api/v1/databases", {
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
      const response = await fetch(`http://localhost:8080/api/v1/databases/${dbId}/tables`, {
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
      const response = await fetch(`http://localhost:8080/api/v1/databases/${dbId}/tables/${tbl}/schema`, {
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
      const response = await fetch(
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
      const response = await fetch("http://localhost:8080/api/v1/databases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to register database connection");
      
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

  const handleDeleteDb = async (id: string, name: string) => {
    if (id === "primary-sqlite") return;
    if (!confirm(`Are you sure you want to remove database connection '${name}'?`)) return;
    
    try {
      const response = await fetch(`http://localhost:8080/api/v1/databases/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to unregister database connection");
      
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
      alert(msg);
      addLog(`Database Admin Error: ${msg}`);
    }
  };

  const handleExecuteQuery = async () => {
    if (!rawQuery.trim()) return;
    setLoading(true);
    setQueryResult(null);
    addLog(`Executing custom SQL query on selected database...`);

    try {
      const response = await fetch(`http://localhost:8080/api/v1/databases/${selectedDbId}/query`, {
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
      <aside className="lg:col-span-1 flex flex-col gap-4 border-r border-neutral-200 dark:border-neutral-800 pr-0 lg:pr-6">
        {/* Database selector */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm text-neutral-400 font-mono tracking-wider uppercase">Active Databases</h3>
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
                    ? "bg-neutral-900 border-cobalt text-white font-bold"
                    : "bg-neutral-50/50 dark:bg-neutral-900/10 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-foreground hover:border-neutral-400"
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
            className="flex flex-col gap-3 p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-lg text-sm font-mono"
          >
            <h4 className="text-xs text-neutral-400 uppercase tracking-widest font-bold border-b border-neutral-200 dark:border-neutral-800 pb-1.5">
              New DB Connection
            </h4>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-neutral-400">CONN NAME *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                placeholder="My MySQL DB"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-neutral-400">TYPE</label>
              <select
                value={formDbType}
                onChange={(e) => setFormDbType(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
              >
                <option value="sqlite">SQLite</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>

            {formDbType === "sqlite" ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-neutral-400">FILE PATH *</label>
                <input
                  type="text"
                  required
                  value={formFilePath}
                  onChange={(e) => setFormFilePath(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                  placeholder="/home/user/my_db.db"
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400">HOST</label>
                    <input
                      type="text"
                      required
                      value={formHost}
                      onChange={(e) => setFormHost(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400">PORT</label>
                    <input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                      placeholder={formDbType === "postgresql" ? "5432" : "3306"}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400">USER</label>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                      placeholder="root"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400">PASSWORD</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
                      placeholder="pass"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-neutral-400">DB NAME</label>
                  <input
                    type="text"
                    required
                    value={formDbName}
                    onChange={(e) => setFormDbName(e.target.value)}
                    className="bg-neutral-900 border border-neutral-800 rounded p-1 text-white text-xs"
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
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Tables List</h3>
          {tables.length === 0 ? (
            <div className="text-xs font-mono text-neutral-500 italic p-3 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
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
                      ? "border-cobalt bg-cobalt/10 text-white"
                      : "border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-foreground hover:bg-neutral-50/30"
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
        <div className="flex flex-wrap justify-between items-center p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-lg gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-widest">
              Selected Database
            </span>
            <span className="text-sm font-bold tracking-tight">
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
                : "border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-foreground"
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
          <div className="flex flex-col gap-4 border border-neutral-200 dark:border-neutral-800 p-4 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/10">
            <h3 className="text-xs font-mono text-neutral-400 tracking-wider uppercase border-b border-neutral-200 dark:border-neutral-800 pb-2">
              Execute SQL query on dynamic connection
            </h3>

            <div className="flex flex-col gap-2 mt-2">
              <textarea
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                rows={5}
                className="bg-neutral-950 text-neutral-100 font-mono text-xs border border-neutral-800 rounded-lg p-2.5 w-full focus:outline-none focus:border-cobalt"
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
              <div className="flex flex-col gap-3 mt-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
                <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono uppercase">
                  <span>Execution Time: {queryResult.execution_time_ms} ms</span>
                  <span>Rows Affected: {queryResult.rows_affected}</span>
                </div>

                {queryResult.error ? (
                  <div className="text-xs text-red-400 font-mono border border-red-500/20 bg-red-500/5 p-3 rounded-lg">
                    ERROR: {queryResult.error}
                  </div>
                ) : queryResult.columns.length === 0 ? (
                  <div className="text-xs text-neutral-400 font-mono p-3 border border-neutral-800 rounded-lg bg-neutral-900/40 italic">
                    Query successfully executed. No output returned.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg max-h-96">
                    <table className="w-full border-collapse text-left font-mono text-xs text-neutral-300">
                      <thead className="bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 font-bold text-neutral-400">
                        <tr>
                          {queryResult.columns.map((col) => (
                            <th key={col} className="p-2.5 border-r border-neutral-800">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {queryResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-800/30">
                            {row.map((val, cellIdx) => (
                              <td key={cellIdx} className="p-2.5 border-r border-neutral-800 truncate max-w-xs">
                                {val === null ? (
                                  <span className="text-neutral-600 italic">NULL</span>
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
          <div className="flex flex-col gap-4 border border-neutral-200 dark:border-neutral-800 p-4 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/10">
            {/* Table inner sub tabs */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => setTableTab("browse")}
                className={`py-1.5 px-3 font-mono text-xs uppercase border-b-2 transition-all ${
                  tableTab === "browse"
                    ? "border-cobalt text-foreground font-bold"
                    : "border-transparent text-neutral-400 hover:text-foreground"
                }`}
              >
                Browse Data
              </button>
              <button
                onClick={() => setTableTab("structure")}
                className={`py-1.5 px-3 font-mono text-xs uppercase border-b-2 transition-all ${
                  tableTab === "structure"
                    ? "border-cobalt text-foreground font-bold"
                    : "border-transparent text-neutral-400 hover:text-foreground"
                }`}
              >
                Structure / Schema
              </button>
            </div>

            {tableTab === "structure" ? (
              /* TABLE SCHEMA STRUCTURE VIEW */
              <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg mt-2">
                <table className="w-full border-collapse text-left font-mono text-xs text-neutral-300">
                  <thead className="bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 font-bold text-neutral-400">
                    <tr>
                      <th className="p-2.5">COLUMN</th>
                      <th className="p-2.5">TYPE</th>
                      <th className="p-2.5">NULLABLE</th>
                      <th className="p-2.5">KEY</th>
                      <th className="p-2.5">DEFAULT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-neutral-900/10">
                    {schema.map((col) => (
                      <tr key={col.name} className="hover:bg-neutral-800/30">
                        <td className="p-2.5 font-bold text-neutral-200">{col.name}</td>
                        <td className="p-2.5 text-neutral-400">{col.type}</td>
                        <td className="p-2.5">{col.nullable ? "Yes" : "No"}</td>
                        <td className="p-2.5 text-cobalt">{col.primary_key ? "PRIMARY" : ""}</td>
                        <td className="p-2.5">
                          {col.default === null ? (
                            <span className="text-neutral-600 italic">None</span>
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
                <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg max-h-125">
                  <table className="w-full border-collapse text-left font-mono text-xs text-neutral-300">
                    <thead className="bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 font-bold text-neutral-400">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="p-2 border-r border-neutral-800">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 bg-neutral-900/10">
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={columns.length || 1}
                            className="p-4 text-center text-neutral-500 italic"
                          >
                            Table contains no rows
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-800/30">
                            {row.map((val, cellIdx) => (
                              <td key={cellIdx} className="p-2 border-r border-neutral-800 truncate max-w-xs">
                                {val === null ? (
                                  <span className="text-neutral-600 italic">NULL</span>
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
                      className="border border-neutral-200 dark:border-neutral-800 rounded px-2.5 py-1 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      &lt; PREV
                    </button>
                    <span className="text-neutral-400 text-[10px]">
                      PAGE {page} OF {Math.ceil(totalRecords / constLimit)} ({totalRecords} RECORDS)
                    </span>
                    <button
                      disabled={page * constLimit >= totalRecords}
                      onClick={() => setPage(page + 1)}
                      className="border border-neutral-200 dark:border-neutral-800 rounded px-2.5 py-1 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
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
          <div className="border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg p-12 text-center text-neutral-400 font-mono text-xs flex flex-col justify-center items-center gap-3">
            <svg
              className="w-12 h-12 text-neutral-600"
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
            <p className="text-neutral-600 text-[10px]">
              Or open the SQL Query Editor at the top to write raw commands
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
