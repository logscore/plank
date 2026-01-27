#!/bin/bash
# Start the development environment with Docker

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
else
    echo "Warning: .env file not found. Ensure environment variables are set."
fi

echo "Starting Plank Development Environment..."
docker compose -f docker/docker-compose.dev.yml up --build
