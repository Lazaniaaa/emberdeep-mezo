#!/bin/bash
# Builds the attestation server and installs or updates it on your Vultr server. From the project root in Git Bash:
#   bash deploy/attest.sh 203.0.113.5                 first time: prints the signer address for deploying the Hall
#   bash deploy/attest.sh 203.0.113.5 0xHallAddress   after the Hall is deployed: starts the server for that Hall
#   bash deploy/attest.sh 203.0.113.5                 later updates keep the Hall address already set
#   bash deploy/attest.sh 203.0.113.5 "" 0xMezoHall   adds the Hall on Mezo (the Ember Pot on Mezo is always on)
# It asks for the server's root password a few times, like deploy.sh.
set -euo pipefail
SERVER="${1:?Usage: bash deploy/attest.sh <server IP> [Hall address]}"
HALL="${2:-}"
MEZO_HALL="${3:-}"
HOST="root@${SERVER}"

npm run server:build
test -f server-dist/attest.mjs

scp server-dist/attest.mjs "$HOST:/tmp/emberdeep-attest.mjs"
scp deploy/attest-setup.sh "$HOST:/tmp/emberdeep-attest-setup.sh"
ssh "$HOST" "sed -i 's/\r$//' /tmp/emberdeep-attest-setup.sh; bash /tmp/emberdeep-attest-setup.sh '$HALL' '$MEZO_HALL'; rm -f /tmp/emberdeep-attest-setup.sh /tmp/emberdeep-attest.mjs"
