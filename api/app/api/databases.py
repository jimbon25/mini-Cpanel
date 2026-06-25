from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.dependencies import get_current_user, RoleChecker
from app.core.database import get_db
from app.models.base import User, DatabaseConnection
from app.schemas.databases import (
    DatabaseConnectionCreate,
    DatabaseConnectionResponse,
    QueryRequest,
    QueryResponse
)
from app.core.database_admin import (
    get_dynamic_engine,
    list_tables,
    get_table_schema,
    get_table_data,
    execute_raw_query
)

router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin"]))])

def get_conn_by_id(id: str, db: Session) -> DatabaseConnection:
    if id == "primary-sqlite":
        return DatabaseConnection(
            id="primary-sqlite",
            name="Primary Mini cPanel SQLite (minicpanel.db)",
            db_type="sqlite",
            file_path="minicpanel.db"
        )
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == id).first()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection config not found"
        )
    return conn

@router.get("", response_model=List[DatabaseConnectionResponse])
def list_databases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    connections = db.query(DatabaseConnection).all()
    primary = DatabaseConnection(
        id="primary-sqlite",
        name="Primary Mini cPanel SQLite (minicpanel.db)",
        db_type="sqlite",
        file_path="minicpanel.db"
    )
    return [primary] + connections

@router.post("", response_model=DatabaseConnectionResponse)
def create_database(
    conn_in: DatabaseConnectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = DatabaseConnection(**conn_in.model_dump())
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn

@router.delete("/{id}")
def delete_database(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if id == "primary-sqlite":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete primary database connection"
        )
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == id).first()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database connection not found"
        )
    db.delete(conn)
    db.commit()
    return {"message": "Database connection configuration removed successfully"}

@router.get("/{id}/tables")
def list_database_tables(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = get_conn_by_id(id, db)
    try:
        engine = get_dynamic_engine(conn)
        tables = list_tables(engine)
        engine.dispose()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch tables: {str(e)}"
        )

@router.get("/{id}/tables/{table_name}/schema")
def get_database_table_schema(
    id: str,
    table_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = get_conn_by_id(id, db)
    try:
        engine = get_dynamic_engine(conn)
        schema = get_table_schema(engine, table_name)
        engine.dispose()
        return {"schema": schema}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch table schema: {str(e)}"
        )

@router.get("/{id}/tables/{table_name}/data")
def get_database_table_data(
    id: str,
    table_name: str,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = get_conn_by_id(id, db)
    try:
        engine = get_dynamic_engine(conn)
        data = get_table_data(engine, table_name, page, limit)
        engine.dispose()
        return data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch table data: {str(e)}"
        )

@router.post("/{id}/query", response_model=QueryResponse)
def run_database_query(
    id: str,
    query_in: QueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conn = get_conn_by_id(id, db)
    try:
        engine = get_dynamic_engine(conn)
        result = execute_raw_query(engine, query_in.query)
        engine.dispose()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SQL Execution Error: {str(e)}"
        )
