#!/bin/sh
set -eu

pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy
exec pnpm dev
