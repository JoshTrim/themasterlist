#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-the-master-list:ci}"
SOURCE_NAME="master-list-ci-source"
TARGET_NAME="master-list-ci-target"
SOURCE_VOLUME="master-list-ci-source-data"
TARGET_VOLUME="master-list-ci-target-data"
SOURCE_ORIGIN="http://127.0.0.1:3000"
TARGET_ORIGIN="http://127.0.0.1:3001"
OWNER_NAME="CI Owner"
OWNER_PASSWORD="ci-owner-password-123"
ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
WORK="$(mktemp -d)"

logs() {
  docker logs "$SOURCE_NAME" 2>/dev/null || true
  docker logs "$TARGET_NAME" 2>/dev/null || true
}

cleanup() {
  docker rm --force "$SOURCE_NAME" "$TARGET_NAME" 2>/dev/null || true
  docker volume rm "$SOURCE_VOLUME" "$TARGET_VOLUME" 2>/dev/null || true
  rm -rf "$WORK"
}

trap 'logs' ERR
trap 'cleanup' EXIT

wait_for_health() {
  local origin="$1" name="$2"
  for _attempt in $(seq 1 60); do
    if curl --fail --silent --show-error "$origin/api/healthz" > /dev/null; then return 0; fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)" != "true" ]; then return 1; fi
    sleep 2
  done
  return 1
}

start_instance() {
  local name="$1" volume="$2" port="$3" origin="$4" setup_token="$5"
  docker run --detach --name "$name" \
    --read-only --tmpfs /tmp:size=2G,mode=1777 \
    --security-opt no-new-privileges --cap-drop ALL \
    --publish "127.0.0.1:${port}:3000" \
    --mount "source=${volume},target=/data" \
    --env NODE_ENV=production \
    --env "APP_ORIGIN=${origin}" \
    --env "OWNER_SETUP_TOKEN=${setup_token}" \
    --env "CONNECTIONS_ENCRYPTION_KEY=${ENCRYPTION_KEY}" \
    "$IMAGE" > /dev/null
}

docker volume create "$SOURCE_VOLUME" > /dev/null
docker volume create "$TARGET_VOLUME" > /dev/null
start_instance "$SOURCE_NAME" "$SOURCE_VOLUME" 3000 "$SOURCE_ORIGIN" source-setup-token
wait_for_health "$SOURCE_ORIGIN" "$SOURCE_NAME"

curl --fail --silent --show-error --cookie-jar "$WORK/source.cookies" \
  --header "Origin: ${SOURCE_ORIGIN}" --header 'Content-Type: application/json' \
  --data "{\"name\":\"${OWNER_NAME}\",\"password\":\"${OWNER_PASSWORD}\",\"setupToken\":\"source-setup-token\"}" \
  "$SOURCE_ORIGIN/api/auth/setup" > "$WORK/owner.json"

curl --fail --silent --show-error --cookie "$WORK/source.cookies" \
  --header "Origin: ${SOURCE_ORIGIN}" --header 'Content-Type: application/json' \
  --data '{"artist":"CI Artist","venue":"CI Venue","city":"CI City","date":"2026-08-01","songs":[{"title":"CI Song"}],"performanceRating":5}' \
  "$SOURCE_ORIGIN/api/gigs" > "$WORK/gig.json"
GIG_ID="$(jq -er '.id' "$WORK/gig.json")"

printf '\x89PNG\r\n\x1a\nmaster-list-ci' > "$WORK/photo.png"
curl --fail --silent --show-error --cookie "$WORK/source.cookies" \
  --header "Origin: ${SOURCE_ORIGIN}" --header 'Content-Type: image/png' \
  --header 'X-Media-Filename: ci-photo.png' --data-binary "@$WORK/photo.png" \
  "$SOURCE_ORIGIN/api/gigs/$GIG_ID/media" > "$WORK/media.json"
jq -e '.id and .filename' "$WORK/media.json" > /dev/null

curl --fail --silent --show-error --cookie "$WORK/source.cookies" \
  "$SOURCE_ORIGIN/api/maintenance/diagnostics" > "$WORK/diagnostics.json"
jq -e '.format == "the-master-list-diagnostics-v1" and .archive.shows == 1 and .archive.mediaRecords == 1 and .storage.mediaFiles == 1' "$WORK/diagnostics.json" > /dev/null
if grep -qE 'CI Artist|CI Venue|CI City|ci-owner-password|source-setup-token|AAAAAAAA' "$WORK/diagnostics.json"; then
  echo 'Diagnostics leaked fixture data or configuration values.' >&2
  exit 1
fi

curl --fail --silent --show-error --cookie "$WORK/source.cookies" \
  "$SOURCE_ORIGIN/api/maintenance/instance-export" > "$WORK/source.tml-instance"
test -s "$WORK/source.tml-instance"

start_instance "$TARGET_NAME" "$TARGET_VOLUME" 3001 "$TARGET_ORIGIN" target-setup-token
wait_for_health "$TARGET_ORIGIN" "$TARGET_NAME"
curl --fail --silent --show-error --cookie-jar "$WORK/target.cookies" \
  --header "Origin: ${TARGET_ORIGIN}" --header 'Content-Type: application/json' \
  --data '{"name":"Temporary Owner","password":"temporary-password-123","setupToken":"target-setup-token"}' \
  "$TARGET_ORIGIN/api/auth/setup" > /dev/null
curl --fail --silent --show-error --cookie "$WORK/target.cookies" \
  --header "Origin: ${TARGET_ORIGIN}" --header 'Content-Type: application/vnd.the-master-list.instance' \
  --data-binary "@$WORK/source.tml-instance" \
  "$TARGET_ORIGIN/api/maintenance/instance-import" > "$WORK/import.json"
jq -e '.staged == true and .restartRequired == true and .summary.gigs == 1 and .summary.media == 1' "$WORK/import.json" > /dev/null

docker restart "$TARGET_NAME" > /dev/null
wait_for_health "$TARGET_ORIGIN" "$TARGET_NAME"
curl --fail --silent --show-error --cookie-jar "$WORK/imported.cookies" \
  --header "Origin: ${TARGET_ORIGIN}" --header 'Content-Type: application/json' \
  --data "{\"name\":\"${OWNER_NAME}\",\"password\":\"${OWNER_PASSWORD}\"}" \
  "$TARGET_ORIGIN/api/auth/login" > "$WORK/login.json"
jq -e '.name == "CI Owner"' "$WORK/login.json" > /dev/null
curl --fail --silent --show-error --cookie "$WORK/imported.cookies" "$TARGET_ORIGIN/api/gigs" > "$WORK/imported-gigs.json"
jq -e 'length == 1 and .[0].artist == "CI Artist" and (.[0].media | length) == 1' "$WORK/imported-gigs.json" > /dev/null

echo 'Docker fresh-install, media, export, import and upgrade smoke test passed.'
