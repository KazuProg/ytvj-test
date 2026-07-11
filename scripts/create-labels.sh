#!/usr/bin/env bash
set -euo pipefail

gh label create major-update --color B60205 --description "This PR triggers a major version bump" --force
gh label create minor-update --color FBCA04 --description "This PR triggers a minor version bump" --force
gh label create patch-update --color 0E8A16 --description "This PR triggers a patch version bump" --force
gh label create no-release --color BFD4F2 --description "Skip the release for this PR" --force
