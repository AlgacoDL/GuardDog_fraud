#!/bin/bash

# Migration script for GuardDog AI database
# Usage: ./migrate.sh [DATABASE_URL] [--dry-run]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DRY_RUN=false
MIGRATIONS_DIR="$(dirname "$0")/../migrations"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [DATABASE_URL] [--dry-run]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be executed without running"
            echo "  --help, -h   Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  DATABASE_URL  PostgreSQL connection string"
            echo ""
            echo "Examples:"
            echo "  $0 postgresql://user:pass@localhost:5432/guarddog"
            echo "  $0 --dry-run"
            exit 0
            ;;
        *)
            if [[ -z "$DATABASE_URL" ]]; then
                DATABASE_URL="$1"
            else
                echo -e "${RED}Error: Unknown argument $1${NC}"
                exit 1
            fi
            shift
            ;;
    esac
done

# Check if DATABASE_URL is set
if [[ -z "$DATABASE_URL" ]]; then
    if [[ -n "$DATABASE_URL" ]]; then
        DATABASE_URL="$DATABASE_URL"
    else
        echo -e "${RED}Error: DATABASE_URL not provided${NC}"
        echo "Usage: $0 [DATABASE_URL] [--dry-run]"
        echo "Or set DATABASE_URL environment variable"
        exit 1
    fi
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found. Please install PostgreSQL client.${NC}"
    exit 1
fi

# Check if migrations directory exists
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    echo -e "${RED}Error: Migrations directory not found: $MIGRATIONS_DIR${NC}"
    exit 1
fi

echo -e "${BLUE}GuardDog AI Database Migration${NC}"
echo "=================================="
echo "Database: $DATABASE_URL"
echo "Migrations: $MIGRATIONS_DIR"
echo "Dry run: $DRY_RUN"
echo ""

# Test database connection
echo -e "${YELLOW}Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to database${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"

# Create migrations table if it doesn't exist
echo -e "${YELLOW}Checking migrations table...${NC}"
if [[ "$DRY_RUN" == "false" ]]; then
    psql "$DATABASE_URL" -c "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    " > /dev/null 2>&1
fi
echo -e "${GREEN}✓ Migrations table ready${NC}"

# Get list of migration files
MIGRATION_FILES=($(ls "$MIGRATIONS_DIR"/*.sql | sort))

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No migration files found${NC}"
    exit 0
fi

echo -e "${YELLOW}Found ${#MIGRATION_FILES[@]} migration files:${NC}"
for file in "${MIGRATION_FILES[@]}"; do
    echo "  - $(basename "$file")"
done
echo ""

# Get already applied migrations
if [[ "$DRY_RUN" == "false" ]]; then
    APPLIED_MIGRATIONS=($(psql "$DATABASE_URL" -t -c "SELECT version FROM schema_migrations ORDER BY version;" 2>/dev/null | tr -d ' ' | grep -v '^$' || true))
else
    APPLIED_MIGRATIONS=()
fi

echo -e "${YELLOW}Applied migrations:${NC}"
if [[ ${#APPLIED_MIGRATIONS[@]} -eq 0 ]]; then
    echo "  (none)"
else
    for migration in "${APPLIED_MIGRATIONS[@]}"; do
        echo "  - $migration"
    done
fi
echo ""

# Process each migration file
for file in "${MIGRATION_FILES[@]}"; do
    filename=$(basename "$file")
    version="${filename%.*}"
    
    # Check if already applied
    if [[ " ${APPLIED_MIGRATIONS[*]} " =~ " ${version} " ]]; then
        echo -e "${BLUE}✓ $filename already applied${NC}"
        continue
    fi
    
    echo -e "${YELLOW}Applying $filename...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${BLUE}[DRY RUN] Would execute:${NC}"
        echo "  psql \"$DATABASE_URL\" -f \"$file\""
        echo "  psql \"$DATABASE_URL\" -c \"INSERT INTO schema_migrations (version) VALUES ('$version');\""
    else
        # Apply migration
        if psql "$DATABASE_URL" -f "$file" > /dev/null 2>&1; then
            # Record successful migration
            psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (version) VALUES ('$version');" > /dev/null 2>&1
            echo -e "${GREEN}✓ $filename applied successfully${NC}"
        else
            echo -e "${RED}✗ Failed to apply $filename${NC}"
            echo "Please check the migration file and database logs"
            exit 1
        fi
    fi
done

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${BLUE}Dry run completed. No changes were made.${NC}"
else
    echo -e "${GREEN}All migrations completed successfully!${NC}"
fi

# Show final status
if [[ "$DRY_RUN" == "false" ]]; then
    echo ""
    echo -e "${YELLOW}Final migration status:${NC}"
    psql "$DATABASE_URL" -c "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;" 2>/dev/null || true
fi

