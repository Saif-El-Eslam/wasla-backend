#!/bin/sh
set -eu

npm run prisma:deploy
npm run seed:prod
exec npm run dev
