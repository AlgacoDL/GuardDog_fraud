@echo off
REM Migration script for GuardDog AI database (Windows)
REM Usage: migrate.bat [DATABASE_URL] [--dry-run]

setlocal enabledelayedexpansion

REM Default values
set DRY_RUN=false
set MIGRATIONS_DIR=%~dp0..\migrations

REM Parse command line arguments
:parse_args
if "%~1"=="" goto :end_parse
if "%~1"=="--dry-run" (
    set DRY_RUN=true
    shift
    goto :parse_args
)
if "%~1"=="--help" (
    goto :show_help
)
if "%~1"=="-h" (
    goto :show_help
)
if "%DATABASE_URL%"=="" (
    set DATABASE_URL=%~1
) else (
    echo Error: Unknown argument %~1
    goto :show_help
)
shift
goto :parse_args
:end_parse

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo Error: DATABASE_URL not provided
    echo Usage: %~nx0 [DATABASE_URL] [--dry-run]
    echo Or set DATABASE_URL environment variable
    exit /b 1
)

REM Check if psql is available
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: psql command not found. Please install PostgreSQL client.
    exit /b 1
)

REM Check if migrations directory exists
if not exist "%MIGRATIONS_DIR%" (
    echo Error: Migrations directory not found: %MIGRATIONS_DIR%
    exit /b 1
)

echo GuardDog AI Database Migration
echo ==================================
echo Database: %DATABASE_URL%
echo Migrations: %MIGRATIONS_DIR%
echo Dry run: %DRY_RUN%
echo.

REM Test database connection
echo Testing database connection...
psql "%DATABASE_URL%" -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Cannot connect to database
    exit /b 1
)
echo ✓ Database connection successful

REM Create migrations table if it doesn't exist
echo Checking migrations table...
if "%DRY_RUN%"=="false" (
    psql "%DATABASE_URL%" -c "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());" >nul 2>&1
)
echo ✓ Migrations table ready

REM Get list of migration files
set MIGRATION_COUNT=0
for %%f in ("%MIGRATIONS_DIR%\*.sql") do (
    set /a MIGRATION_COUNT+=1
    set "MIGRATION_FILE_!MIGRATION_COUNT!=%%f"
)

if %MIGRATION_COUNT% equ 0 (
    echo No migration files found
    exit /b 0
)

echo Found %MIGRATION_COUNT% migration files:
for /l %%i in (1,1,%MIGRATION_COUNT%) do (
    echo   - %%~nxMIGRATION_FILE_%%i%
)
echo.

REM Get already applied migrations
if "%DRY_RUN%"=="false" (
    for /f "tokens=*" %%a in ('psql "%DATABASE_URL%" -t -c "SELECT version FROM schema_migrations ORDER BY version;" 2^>nul') do (
        if not "%%a"=="" (
            set "APPLIED_%%a=1"
        )
    )
)

echo Applied migrations:
set APPLIED_COUNT=0
for /l %%i in (1,1,%MIGRATION_COUNT%) do (
    for %%f in ("!MIGRATION_FILE_%%i!") do (
        set "filename=%%~nf"
        if defined APPLIED_!filename! (
            echo   - !filename!
            set /a APPLIED_COUNT+=1
        )
    )
)
if %APPLIED_COUNT% equ 0 (
    echo   (none)
)
echo.

REM Process each migration file
for /l %%i in (1,1,%MIGRATION_COUNT%) do (
    for %%f in ("!MIGRATION_FILE_%%i!") do (
        set "filename=%%~nf"
        set "filepath=%%f"
        
        REM Check if already applied
        if defined APPLIED_!filename! (
            echo ✓ !filename! already applied
            goto :continue
        )
        
        echo Applying !filename!...
        
        if "%DRY_RUN%"=="true" (
            echo [DRY RUN] Would execute:
            echo   psql "%DATABASE_URL%" -f "!filepath!"
            echo   psql "%DATABASE_URL%" -c "INSERT INTO schema_migrations (version) VALUES ('!filename!');"
        ) else (
            REM Apply migration
            psql "%DATABASE_URL%" -f "!filepath!" >nul 2>&1
            if !ERRORLEVEL! equ 0 (
                REM Record successful migration
                psql "%DATABASE_URL%" -c "INSERT INTO schema_migrations (version) VALUES ('!filename!');" >nul 2>&1
                echo ✓ !filename! applied successfully
            ) else (
                echo ✗ Failed to apply !filename!
                echo Please check the migration file and database logs
                exit /b 1
            )
        )
        
        :continue
    )
)

echo.
if "%DRY_RUN%"=="true" (
    echo Dry run completed. No changes were made.
) else (
    echo All migrations completed successfully!
)

REM Show final status
if "%DRY_RUN%"=="false" (
    echo.
    echo Final migration status:
    psql "%DATABASE_URL%" -c "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;" 2>nul
)

exit /b 0

:show_help
echo Usage: %~nx0 [DATABASE_URL] [--dry-run]
echo.
echo Options:
echo   --dry-run    Show what would be executed without running
echo   --help, -h   Show this help message
echo.
echo Environment variables:
echo   DATABASE_URL  PostgreSQL connection string
echo.
echo Examples:
echo   %~nx0 postgresql://user:pass@localhost:5432/guarddog
echo   %~nx0 --dry-run
exit /b 0

