import time
from typing import Dict, Any, List
from sqlalchemy import create_engine, inspect, text, Table, MetaData, select, func
from app.models.base import DatabaseConnection
from app.core.config import settings

def get_dynamic_engine(db_conn: DatabaseConnection):
    """
    Returns an SQLAlchemy engine for the given connection config.
    Caller MUST call engine.dispose() when finished to clean up connections.
    """
    if db_conn.db_type == "sqlite":
        path = db_conn.file_path
        if not path:
            raise ValueError("File path is required for SQLite connection.")
        if path in ("cpanel_lite.db", "minicpanel.db"):
            path = str(settings.CPANEL_DATA_DIR / path)
        return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    
    elif db_conn.db_type == "postgresql":
        if not db_conn.host or not db_conn.database_name:
            raise ValueError("Host and Database name are required for PostgreSQL.")
        port_str = f":{db_conn.port}" if db_conn.port else ""
        auth_str = ""
        if db_conn.username:
            pwd = db_conn.password or ""
            auth_str = f"{db_conn.username}:{pwd}@"
        return create_engine(f"postgresql://{auth_str}{db_conn.host}{port_str}/{db_conn.database_name}")
        
    elif db_conn.db_type == "mysql":
        if not db_conn.host or not db_conn.database_name:
            raise ValueError("Host and Database name are required for MySQL.")
        port_str = f":{db_conn.port}" if db_conn.port else ""
        auth_str = ""
        if db_conn.username:
            pwd = db_conn.password or ""
            auth_str = f"{db_conn.username}:{pwd}@"
        return create_engine(f"mysql+pymysql://{auth_str}{db_conn.host}{port_str}/{db_conn.database_name}")
        
    else:
        raise ValueError(f"Unsupported database type: {db_conn.db_type}")

def list_tables(engine) -> List[str]:
    inspector = inspect(engine)
    return inspector.get_table_names()

def get_table_schema(engine, table_name: str) -> List[Dict[str, Any]]:
    inspector = inspect(engine)
    columns = inspector.get_columns(table_name)
    schema_info = []
    for col in columns:
        schema_info.append({
            "name": col["name"],
            "type": str(col["type"]),
            "nullable": col["nullable"],
            "default": str(col["default"]) if col.get("default") is not None else None,
            "primary_key": col.get("primary_key", False)
        })
    return schema_info

def get_table_data(engine, table_name: str, page: int = 1, limit: int = 50) -> Dict[str, Any]:
    metadata = MetaData()
    try:
        table = Table(table_name, metadata, autoload_with=engine)
    except Exception as e:
        raise ValueError(f"Table '{table_name}' does not exist or schema could not be loaded: {e}")
    
    count_query = select(func.count()).select_from(table)
    select_query = select(table).limit(limit).offset((page - 1) * limit)
    
    with engine.connect() as connection:
        total_records = connection.scalar(count_query)
        result = connection.execute(select_query)
        columns = list(result.keys())
        rows = [list(row) for row in result]
        
    return {
        "columns": columns,
        "rows": rows,
        "total": total_records,
        "page": page,
        "limit": limit
    }

def execute_raw_query(engine, query_str: str) -> Dict[str, Any]:
    start_time = time.time()
    with engine.connect() as connection:
        trans = connection.begin()
        try:
            result = connection.execute(text(query_str))
            columns = list(result.keys()) if result.returns_rows else []
            rows = [list(row) for row in result] if result.returns_rows else []
            rows_affected = result.rowcount
            trans.commit()
        except Exception as e:
            trans.rollback()
            raise e
            
    execution_time_ms = (time.time() - start_time) * 1000
    return {
        "columns": columns,
        "rows": rows,
        "rows_affected": rows_affected if rows_affected is not None else 0,
        "execution_time_ms": round(execution_time_ms, 2)
    }
