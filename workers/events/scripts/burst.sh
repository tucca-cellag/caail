#!/usr/bin/env bash
#
# Measure what the deployed rate limit actually does.
#
# The reason this exists: `wrangler deploy --dry-run` proves the binding is
# configured, `wrangler dev` proves the handler enforces it, and neither proves
# anything about production. The binding is local-simulation only in dev, and in
# production Cloudflare caches the counter on the machine running the Worker and
# reconciles it asynchronously. So the deployed cap bites later, and leakier,
# than the configured number reads. The only way to know by how much is to
# measure it, and the only honest way to cite a figure in wrangler.toml is to
# name the command that reproduces it.
#
#   ./scripts/burst.sh                        # defaults below
#   ./scripts/burst.sh 600 6                  # 600 requests, 6 at a time
#   URL=http://127.0.0.1:8799 ./scripts/burst.sh 150 20
#
# Posts a rejected event name, so nothing reaches Analytics Engine: the limiter
# is charged before the name is checked, which is what makes this measurable
# without writing junk into the dataset it is protecting.

set -euo pipefail

URL="${URL:-https://caail-events.bromberg-benji.workers.dev}"
COUNT="${1:-600}"
CONCURRENCY="${2:-6}"
ORIGIN="${ORIGIN:-https://tucca-cellag.github.io}"

codes=$(mktemp)
trap 'rm -f "$codes"' EXIT

echo "POST $URL"
echo "$COUNT requests, $CONCURRENCY at a time"

start=$(date +%s)
seq 1 "$COUNT" | xargs -P "$CONCURRENCY" -I{} \
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" \
    -H "Origin: $ORIGIN" \
    --data '{"name":"not_an_event"}' > "$codes"
elapsed=$(( $(date +%s) - start ))

echo
echo "elapsed: ${elapsed}s"
sort "$codes" | uniq -c

refused=$(grep -c 429 "$codes" || true)
if [ "$refused" -gt 0 ]; then
  first=$(grep -n -m1 429 "$codes" | cut -d: -f1)
  echo "refused: $refused of $COUNT"
  # Deliberately "response", not "request". xargs -P writes each line when its
  # curl finishes, so this file is in completion order, not dispatch order. At
  # concurrency > 1 the two differ by up to about one window, and reading this
  # as "the Nth request sent was the first refused" claims a precision the
  # measurement does not have. The ratio above is the trustworthy number.
  if [ "$CONCURRENCY" -gt 1 ]; then
    echo "first refusal: response $first of $COUNT (completion order, +/- ~$CONCURRENCY in dispatch order)"
  else
    echo "first refusal: request $first of $COUNT"
  fi
else
  echo "no 429: the cap did not engage at this volume or rate"
fi
