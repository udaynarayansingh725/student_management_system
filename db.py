import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn


def init_db():
    with open(os.path.join(os.path.dirname(__file__), "schema.sql"), "r") as f:
        schema = f.read()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(schema)