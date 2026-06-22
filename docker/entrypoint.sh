#!/bin/bash
set -e

if [ "$NODE_ENV" = "production" ]; then
    if [ -z "$BETTER_AUTH_SECRET" ] || [ "$BETTER_AUTH_SECRET" = "dummy-build-secret" ]; then
        echo "Error: BETTER_AUTH_SECRET must be set to a real value in production"
        exit 1
    fi

    if [ -z "$BETTER_AUTH_URL" ]; then
        echo "Error: BETTER_AUTH_URL must be set in production"
        exit 1
    fi
fi

echo "Running database migrations..."
npx --no-install drizzle-kit migrate

# Configure Prowlarr if config path is set and script exists
if [ -n "$PROWLARR_CONFIG_PATH" ] && [ -f "/app/docker/configure-prowlarr.sh" ]; then
    echo "Configuring Prowlarr..."

    # Run configuration script
    # The script outputs logs to stderr and the API key line to stdout
    if CONFIG_OUTPUT=$(/app/docker/configure-prowlarr.sh 2>&1); then
        # Extract API key from output if not already set
        if [ -z "$PROWLARR_API_KEY" ]; then
            EXTRACTED_KEY=$(echo "$CONFIG_OUTPUT" | grep "^PROWLARR_API_KEY=" | cut -d'=' -f2 | tr -d '\n')
            if [ -n "$EXTRACTED_KEY" ]; then
                export PROWLARR_API_KEY="$EXTRACTED_KEY"
                echo "Prowlarr API key configured"
            fi
        else
            echo "Prowlarr API key already set from environment"
        fi
    else
        echo "Warning: Prowlarr configuration failed, but continuing..."
        echo "$CONFIG_OUTPUT"
    fi
fi

echo "Starting application..."

# Execute provided command or default to node build
if [ "$#" -gt 0 ]; then
    exec "$@"
else
    exec node build
fi
