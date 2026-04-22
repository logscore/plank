#!/bin/bash
# Configure Prowlarr via API
# This script:
# 1. Waits for Prowlarr to be ready
# 2. Extracts the API key from Prowlarr's config
# 3. Sets up FlareSolverr as an indexer proxy
# 4. Outputs the API key for use by other services

set -e

# Configuration
PROWLARR_URL="${PROWLARR_URL:-http://prowlarr:9696}"
FLARESOLVERR_URL="${FLARESOLVERR_URL:-http://flaresolverr:8191}"
PROWLARR_CONFIG_PATH="${PROWLARR_CONFIG_PATH:-/prowlarr-config/config.xml}"
MAX_RETRIES="${MAX_RETRIES:-60}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"

# Logging functions (printf for Alpine/BusyBox compatibility)
# All log messages go to stderr so they don't interfere with stdout output
log_info() {
    printf "\033[0;32m[INFO]\033[0m %s\n" "$1" >&2
}

log_warn() {
    printf "\033[1;33m[WARN]\033[0m %s\n" "$1" >&2
}

log_error() {
    printf "\033[0;31m[ERROR]\033[0m %s\n" "$1" >&2
}

# Wait for Prowlarr to be ready using /ping endpoint (no auth required)
wait_for_prowlarr() {
    log_info "Waiting for Prowlarr to be ready at ${PROWLARR_URL}..."
    
    retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        # Use /ping endpoint - returns {"status": "OK"} when ready
        response=$(curl -s --max-time 5 "${PROWLARR_URL}/ping" 2>/dev/null || echo "")
        
        if echo "$response" | grep -q '"status"'; then
            log_info "Prowlarr is ready!"
            return 0
        fi
        
        retries=$((retries + 1))
        log_info "Prowlarr not ready yet (attempt ${retries}/${MAX_RETRIES}), waiting ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
    done
    
    log_error "Prowlarr did not become ready in time"
    return 1
}

# Extract API key from Prowlarr config.xml
# Outputs ONLY the API key to stdout, all logs go to stderr
get_api_key() {
    log_info "Extracting API key from Prowlarr config at ${PROWLARR_CONFIG_PATH}..."
    
    # Wait for config file to exist and contain API key
    retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if [ -f "$PROWLARR_CONFIG_PATH" ]; then
            # Extract API key using grep and sed (works in Alpine/BusyBox)
            api_key=$(grep -o '<ApiKey>[^<]*</ApiKey>' "$PROWLARR_CONFIG_PATH" 2>/dev/null | sed 's/<[^>]*>//g' || echo "")
            
            if [ -n "$api_key" ]; then
                log_info "API key extracted successfully"
                # Output ONLY the API key to stdout
                echo "$api_key"
                return 0
            else
                log_info "Config file exists but API key not found yet..."
            fi
        else
            log_info "Config file does not exist yet at ${PROWLARR_CONFIG_PATH}"
        fi
        
        retries=$((retries + 1))
        log_info "Waiting for config (attempt ${retries}/${MAX_RETRIES}), waiting ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
    done
    
    log_error "Could not extract API key from Prowlarr config"
    return 1
}

extract_tag_id_from_response() {
    label="$1"

    node -e '
const fs = require("fs");
const label = process.argv[1];
const input = fs.readFileSync(0, "utf8").trim();
if (!input) process.exit(0);
const tags = JSON.parse(input);
const tag = Array.isArray(tags) ? tags.find((entry) => entry.label === label) : null;
if (tag?.id != null) process.stdout.write(String(tag.id));
' "$label"
}

extract_proxy_id_from_response() {
    name="$1"

    node -e '
const fs = require("fs");
const name = process.argv[1];
const input = fs.readFileSync(0, "utf8").trim();
if (!input) process.exit(0);
const proxies = JSON.parse(input);
const proxy = Array.isArray(proxies)
  ? proxies.find((entry) => entry.name === name || entry.implementation === "FlareSolverr")
  : null;
if (proxy?.id != null) process.stdout.write(String(proxy.id));
' "$name"
}

get_or_create_flaresolverr_tag() {
    api_key="$1"

    log_info "Ensuring FlareSolverr tag 'flaresolverr' exists..."

    response=$(curl -s --max-time 10 -X GET \
        -H "X-Api-Key: ${api_key}" \
        -H "Content-Type: application/json" \
        "${PROWLARR_URL}/api/v1/tag" 2>/dev/null || echo "")

    tag_id=$(printf "%s" "$response" | extract_tag_id_from_response "flaresolverr")
    if [ -n "$tag_id" ]; then
        log_info "Using existing FlareSolverr tag ID ${tag_id}"
        echo "$tag_id"
        return 0
    fi

    response=$(curl -s --max-time 10 -X POST \
        -H "X-Api-Key: ${api_key}" \
        -H "Content-Type: application/json" \
        -d '{"label":"flaresolverr"}' \
        "${PROWLARR_URL}/api/v1/tag" 2>/dev/null || echo "")

    tag_id=$(printf "%s" "$response" | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8").trim();
if (!input) process.exit(0);
const tag = JSON.parse(input);
if (tag?.id != null) process.stdout.write(String(tag.id));
')

    if [ -n "$tag_id" ]; then
        log_info "Created FlareSolverr tag ID ${tag_id}"
        echo "$tag_id"
        return 0
    fi

    log_error "Failed to create FlareSolverr tag"
    return 1
}

# Setup FlareSolverr as an indexer proxy in Prowlarr
setup_flaresolverr() {
    api_key="$1"
    tag_id="$2"
    
    log_info "Setting up FlareSolverr proxy in Prowlarr..."
    
    response=$(curl -s --max-time 10 -X GET \
        -H "X-Api-Key: ${api_key}" \
        -H "Content-Type: application/json" \
        "${PROWLARR_URL}/api/v1/indexerproxy" 2>/dev/null || echo "")

    proxy_id=$(printf "%s" "$response" | extract_proxy_id_from_response "FlareSolverr")
    json_payload="{\"name\":\"FlareSolverr\",\"implementation\":\"FlareSolverr\",\"configContract\":\"FlareSolverrSettings\",\"fields\":[{\"name\":\"host\",\"value\":\"${FLARESOLVERR_URL}\"},{\"name\":\"requestTimeout\",\"value\":60}],\"tags\":[${tag_id}]}"

    if [ -n "$proxy_id" ]; then
        log_info "Updating existing FlareSolverr proxy ${proxy_id} with tag ${tag_id}"
        response=$(curl -s --max-time 30 -X PUT \
            -H "X-Api-Key: ${api_key}" \
            -H "Content-Type: application/json" \
            -d "{\"id\":${proxy_id},${json_payload#\{}" \
            "${PROWLARR_URL}/api/v1/indexerproxy/${proxy_id}" 2>/dev/null || echo "")
    else
        log_info "Creating FlareSolverr proxy with URL: ${FLARESOLVERR_URL} and tag ${tag_id}"
        response=$(curl -s --max-time 30 -X POST \
            -H "X-Api-Key: ${api_key}" \
            -H "Content-Type: application/json" \
            -d "$json_payload" \
            "${PROWLARR_URL}/api/v1/indexerproxy" 2>/dev/null || echo "")
    fi

    if echo "$response" | grep -q '"id"'; then
        log_info "FlareSolverr proxy configured successfully"
        return 0
    fi

    log_warn "FlareSolverr setup response: $response"
    log_error "Failed to configure FlareSolverr proxy"
    return 1
}

# Test FlareSolverr connectivity
test_flaresolverr() {
    log_info "Testing FlareSolverr connectivity at ${FLARESOLVERR_URL}..."
    
    response=$(curl -s --max-time 10 -X POST \
        -H "Content-Type: application/json" \
        -d '{"cmd":"request.get","url":"https://httpbin.org/ip","maxTimeout":60000}' \
        "${FLARESOLVERR_URL}/v1" 2>/dev/null || echo "")
    
    if echo "$response" | grep -q '"status":"ok"'; then
        log_info "FlareSolverr is working correctly"
        return 0
    else
        log_warn "FlareSolverr may not be fully operational yet"
        return 1
    fi
}

# Write API key to a file for other services to use
save_api_key() {
    api_key="$1"
    output_file="${API_KEY_OUTPUT_FILE:-/tmp/prowlarr-api-key}"
    
    echo "$api_key" > "$output_file"
    log_info "API key saved to ${output_file}"
}

# Main execution
main() {
    log_info "Starting Prowlarr configuration..."
    
    # Wait for Prowlarr
    wait_for_prowlarr || exit 1
    
    # Get API key (capture stdout only, logs go to stderr)
    API_KEY=$(get_api_key)
    if [ -z "$API_KEY" ]; then
        log_error "Failed to get API key"
        exit 1
    fi
    
    # Save API key for other services
    save_api_key "$API_KEY"

    # Ensure the FlareSolverr proxy tag exists before wiring the proxy
    FLARESOLVERR_TAG_ID=$(get_or_create_flaresolverr_tag "$API_KEY")
    if [ -z "$FLARESOLVERR_TAG_ID" ]; then
        log_error "Failed to get FlareSolverr tag ID"
        exit 1
    fi
    
    # Test FlareSolverr (don't fail if not working yet)
    test_flaresolverr || log_warn "FlareSolverr test failed, but continuing..."
    
    # Setup FlareSolverr proxy
    setup_flaresolverr "$API_KEY" "$FLARESOLVERR_TAG_ID" || log_warn "FlareSolverr proxy setup failed, but continuing..."
    
    log_info "Prowlarr configuration complete!"
    log_info "API Key: ${API_KEY}"
    
    # Output API key to stdout for capture by calling process
    echo "PROWLARR_API_KEY=${API_KEY}"
}

main "$@"
