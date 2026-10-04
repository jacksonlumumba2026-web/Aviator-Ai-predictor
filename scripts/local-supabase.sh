#!/usr/bin/env bash
# Local Supabase-equivalent stack for integration tests:
#   Postgres 16 (system binaries) + PostgREST (docker) + a /rest/v1 prefix proxy.
# Usage: scripts/local-supabase.sh start|stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="${PGDATA_DIR:-/tmp/aal-pgdata}"
PGBIN=/usr/lib/postgresql/16/bin
PORT=55432
JWT_SECRET="${LOCAL_JWT_SECRET:-local-test-jwt-secret-at-least-32-characters}"

case "${1:-start}" in
start)
  if [ ! -d "$PGDATA" ]; then
    mkdir -p "$PGDATA" && chown postgres "$PGDATA"
    su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  fi
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k /tmp' -l $PGDATA/log.txt start" >/dev/null
  sleep 2
  psql -h /tmp -p $PORT -U postgres -c "drop database if exists aal" -c "create database aal" >/dev/null
  psql -h /tmp -p $PORT -U postgres -d aal -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/local/bootstrap.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do psql -h /tmp -p $PORT -U postgres -d aal -v ON_ERROR_STOP=1 -q -f "$f"; done
  docker rm -f aal-postgrest >/dev/null 2>&1 || true
  docker run -d --name aal-postgrest --network host \
    -e PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PORT/aal" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
    -e PGRST_SERVER_PORT=54330 postgrest/postgrest:v12.2.3 >/dev/null
  nohup node "$ROOT/scripts/rest-prefix-proxy.mjs" > /tmp/aal-proxy.log 2>&1 &
  sleep 2
  echo "Supabase-equivalent API at http://127.0.0.1:54321 (db port $PORT)"
  ;;
stop)
  docker rm -f aal-postgrest >/dev/null 2>&1 || true
  pkill -f rest-prefix-proxy.mjs || true
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
  ;;
esac
