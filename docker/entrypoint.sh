#!/usr/bin/env bash
set -euo pipefail

CONF=/etc/tryton/trytond.conf
DB="${DB_NAME:-epiton_lab}"

export TRYTONPASSFILE=/tmp/trytonpass
printf '%s\n' 'admin' > "$TRYTONPASSFILE"
chmod 600 "$TRYTONPASSFILE"

# Use a deliverable domain so trytond email validation passes in the lab.
ADMIN_EMAIL="${EPITON_ADMIN_EMAIL:-admin@gmail.com}"

trytond-admin -c "$CONF" -d "$DB" --all --email="$ADMIN_EMAIL" -vv
trytond-admin -c "$CONF" -d "$DB" -u party -u country -u company --email="$ADMIN_EMAIL" -vv || true
trytond-admin -c "$CONF" -d "$DB" -p -vv || true

exec trytond -c "$CONF"
