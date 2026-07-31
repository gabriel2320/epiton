#!/usr/bin/env bash
set -euo pipefail

CONF=/etc/tryton/trytond.conf
DB="${DB_NAME:-epiton_lab}"

export TRYTONPASSFILE=/tmp/trytonpass
printf '%s\n' 'admin' > "$TRYTONPASSFILE"
chmod 600 "$TRYTONPASSFILE"

ADMIN_EMAIL="${EPITON_ADMIN_EMAIL:-admin@gmail.com}"

trytond-admin -c "$CONF" -d "$DB" --all --email="$ADMIN_EMAIL" -vv
# Activate referential modules one-by-one with deps.
for mod in country currency party company; do
  trytond-admin -c "$CONF" -d "$DB" -u "$mod" --email="$ADMIN_EMAIL" -vv || true
done
trytond-admin -c "$CONF" -d "$DB" -p -vv || true

exec trytond -c "$CONF"
