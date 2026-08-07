#!/usr/bin/env bash

cd "$(dirname "$0")"
python3 ./code-stats.py --diff --exclude-lang json,yaml
