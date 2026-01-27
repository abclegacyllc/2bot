#!/bin/bash
set -e

# This script runs on first postgres container startup
# It ensures proper password auth and configures pg_hba.conf

echo "🔧 Configuring PostgreSQL authentication..."

# Set password encryption to md5 (compatible with all pg drivers)
# and ensure the password is correctly set for the postgres user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SET password_encryption = 'md5';
    ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';
EOSQL

# Replace scram-sha-256 with md5 for better driver compatibility
sed -i 's/scram-sha-256/md5/g' /var/lib/postgresql/data/pg_hba.conf

# Add md5 auth for all external connections (docker network)
echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/data/pg_hba.conf

echo "✅ PostgreSQL initialized with md5 password authentication"
