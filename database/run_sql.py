"""Chạy file SQL lên Supabase Postgres (công cụ dev, không deploy cùng frontend).

Usage: python database/run_sql.py database/01_database.sql
Mật khẩu DB đọc từ biến môi trường SUPABASE_DB_PASSWORD.
"""
import os
import sys

import psycopg2

PROJECT_REF = "laoxrsdemwvwcpqjqecq"
REGIONS = ["ap-southeast-1", "ap-northeast-1", "ap-northeast-2", "ap-south-1", "ap-southeast-2",
           "us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-central-1", "eu-west-1",
           "eu-west-2", "eu-west-3", "eu-north-1", "ca-central-1", "sa-east-1"]


def candidate_dsns(password):
    yield dict(host="aws-0-ap-northeast-1.pooler.supabase.com", port=5432,
               user=f"postgres.{PROJECT_REF}")
    yield dict(host=f"db.{PROJECT_REF}.supabase.co", port=5432, user="postgres")
    for prefix in ("aws-0", "aws-1"):
        for region in REGIONS:
            yield dict(host=f"{prefix}-{region}.pooler.supabase.com", port=5432,
                       user=f"postgres.{PROJECT_REF}")


def connect(password):
    for dsn in candidate_dsns(password):
        try:
            conn = psycopg2.connect(dbname="postgres", password=password, connect_timeout=8,
                                    sslmode="require", **dsn)
            print("Connected:", dsn["host"])
            return conn
        except psycopg2.OperationalError as error:
            message = str(error).strip().splitlines()[0]
            if "password authentication failed" in message:
                raise
    raise SystemExit("Không kết nối được database.")


def main():
    password = os.environ["SUPABASE_DB_PASSWORD"]
    conn = connect(password)
    conn.autocommit = True
    with conn.cursor() as cur:
        for path in sys.argv[1:]:
            with open(path, encoding="utf-8") as f:
                cur.execute(f.read())
            print("OK:", path)
    conn.close()


if __name__ == "__main__":
    main()
