# DB init scripts

Every `*.sql` / `*.sql.gz` file in this directory is imported **once**, on the
first `docker compose up` with an empty `db_data` volume (standard `mysql:5.7`
entrypoint behavior). Files are applied in name order into the `songs` database.

- `00_production.sql.gz` — full production dump, created by
  `tools/offline_sync.sh db`. Git-ignored: production data never goes into the
  repo.
- Fresh install without production data: copy
  `database/database_full.sql` and `database/database_full_initial_data.sql`
  here instead (prefix them `01_` / `02_` to keep the order).

Re-import after replacing the dump (wipes the container DB):

    cd docker
    docker compose down -v
    docker compose up -d
