#!/usr/bin/env python
"""Read-only inspector for the production songs database.

Usage:
    python tools/db_inspect.py "SELECT ... / SHOW ... / DESCRIBE ... / EXPLAIN ..."

Credentials come from tools/db_ro.json (git-ignored) — copy
tools/db_ro.example.json and fill in the songs_ro (SELECT-only) user.
Refuses anything that is not a single read statement, caps output at
MAX_ROWS, and uses short timeouts so a dead network fails fast instead
of hanging the session.
"""
import io
import json
import os
import sys

MAX_ROWS = 200
ALLOWED = ('SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN')


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def main():
    # Windows console defaults to cp1251 and crashes on some Cyrillic/emoji.
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    if len(sys.argv) < 2 or not sys.argv[1].strip():
        fail(__doc__)

    sql = sys.argv[1].strip().rstrip(';').strip()
    if ';' in sql:
        fail('refused: multiple statements are not allowed')
    if sql.split(None, 1)[0].upper() not in ALLOWED:
        fail('refused: only ' + '/'.join(ALLOWED) + ' statements are allowed')

    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db_ro.json')
    if not os.path.exists(cfg_path):
        fail('missing tools/db_ro.json — copy tools/db_ro.example.json and fill in the songs_ro credentials')
    with open(cfg_path, encoding='utf-8') as f:
        cfg = json.load(f)

    try:
        import pymysql
    except ImportError:
        fail('pymysql is required: pip install pymysql')

    try:
        conn = pymysql.connect(
            host=cfg['host'], port=int(cfg.get('port', 3306)),
            user=cfg['user'], password=cfg['password'],
            database=cfg.get('database', 'songs'),
            charset='utf8mb4', connect_timeout=10, read_timeout=30,
        )
    except Exception as e:
        fail('connection failed: %s' % e)

    try:
        with conn.cursor() as c:
            c.execute(sql)
            if c.description:
                print('\t'.join(d[0] for d in c.description))
            rows = c.fetchmany(MAX_ROWS + 1)
            for r in rows[:MAX_ROWS]:
                print('\t'.join('NULL' if v is None else str(v) for v in r))
            if len(rows) > MAX_ROWS:
                print('... truncated at %d rows' % MAX_ROWS, file=sys.stderr)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
