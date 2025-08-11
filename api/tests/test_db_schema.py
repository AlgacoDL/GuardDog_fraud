"""
Test database schema for GuardDog AI
Tests that all required tables, primary keys, indexes, and constraints exist
"""

import pytest
import psycopg
import os
from typing import List, Tuple

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost/guarddog_test')

def get_table_info() -> List[Tuple]:
    """Get basic table information from the database."""
    q = """
      select table_name, table_type
      from information_schema.tables
      where table_schema = 'public'
      and table_type = 'BASE TABLE'
      order by table_name;
    """
    with psycopg.connect(DATABASE_URL) as conn:
        return conn.execute(q).fetchall()

def get_primary_keys(table_name: str) -> List[Tuple]:
    """Get primary key information for a specific table."""
    q = """
      select column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu 
        on tc.constraint_name = kcu.constraint_name
      where tc.table_name = %s
      and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position;
    """
    with psycopg.connect(DATABASE_URL) as conn:
        return conn.execute(q, (table_name,)).fetchall()

def get_indexes(table_name: str) -> List[Tuple]:
    """Get index information for a specific table."""
    q = """
      select indexname
      from pg_indexes
      where tablename = %s
      and indexname not like '%%_pkey'
      order by indexname;
    """
    with psycopg.connect(DATABASE_URL) as conn:
        return conn.execute(q, (table_name,)).fetchall()

def test_required_tables_exist():
    """Test that all required tables exist."""
    tables = get_table_info()
    table_names = [t[0] for t in tables]
    
    required_tables = ['idempo_ledger', 'raw_events', 'feat_velocity_hour', 'labels_feedback']
    for table in required_tables:
        assert table in table_names, f"Required table {table} not found"

def test_idempo_ledger_primary_key():
    """Test that idempo_ledger has the correct composite primary key."""
    pk_columns = get_primary_keys('idempo_ledger')
    pk_names = [pk[0] for pk in pk_columns]
    
    expected_pk = ['shop_domain', 'topic', 'webhook_id']
    assert pk_names == expected_pk, f"Expected PK {expected_pk}, got {pk_names}"

def test_feat_velocity_hour_primary_key():
    """Test that feat_velocity_hour has the correct composite primary key."""
    pk_columns = get_primary_keys('feat_velocity_hour')
    pk_names = [pk[0] for pk in pk_columns]
    
    expected_pk = ['shop_domain', 'key_type', 'key_hash', 'bucket_start']
    assert pk_names == expected_pk, f"Expected PK {expected_pk}, got {pk_names}"

def test_raw_events_indexes():
    """Test that raw_events has the required indexes."""
    indexes = get_indexes('raw_events')
    index_names = [idx[0] for idx in indexes]
    
    required_indexes = ['idx_raw_events_shop_ts', 'idx_raw_events_shop_order']
    for index in required_indexes:
        assert index in index_names, f"Required index {index} not found on raw_events"

def test_feat_velocity_hour_indexes():
    """Test that feat_velocity_hour has the required indexes."""
    indexes = get_indexes('feat_velocity_hour')
    index_names = [idx[0] for idx in indexes]
    
    required_indexes = ['idx_feat_velocity_shop_key']
    for index in required_indexes:
        assert index in index_names, f"Required index {index} not found on feat_velocity_hour"

def test_labels_feedback_indexes():
    """Test that labels_feedback has the required indexes."""
    indexes = get_indexes('labels_feedback')
    index_names = [idx[0] for idx in indexes]
    
    required_indexes = ['idx_labels_feedback_shop_order']
    for index in required_indexes:
        assert index in index_names, f"Required index {index} not found on labels_feedback"

def test_ip_trunc_is_cidr():
    """Test that ip_trunc column in raw_events is of CIDR type."""
    q = """
      select data_type
      from information_schema.columns
      where table_name='raw_events' and column_name='ip_trunc';
    """
    with psycopg.connect(DATABASE_URL) as conn:
        result = conn.execute(q).fetchone()
        assert result is not None, "ip_trunc column not found"
        data_type = result[0]
        assert data_type in ('cidr', 'USER-DEFINED'), f"ip_trunc must be CIDR, got {data_type}"

def test_inc_velocity_hour_function_exists():
    """Test that the inc_velocity_hour function exists."""
    q = """
      select routine_name, routine_type
      from information_schema.routines
      where routine_name = 'inc_velocity_hour'
      and routine_schema = 'public';
    """
    with psycopg.connect(DATABASE_URL) as conn:
        result = conn.execute(q).fetchone()
        assert result is not None, "inc_velocity_hour function not found"
        assert result[1] == 'FUNCTION', "inc_velocity_hour should be a function"
