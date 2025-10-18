#!/bin/bash
# This script updates divisions.ts routes from /divisions to /tournaments/:tid/divisions

FILE="/home/piouser/eztourneyz/backend/apps/api/src/routes/divisions.ts"

# Backup
cp "$FILE" "${FILE}.pre-phase4a"

# 1. Update imports to include tournaments
sed -i "s/import { divisions, teams/import { tournaments, divisions, teams/" "$FILE"

# 2. Update route paths
sed -i "s|'>('/divisions'|'>('/tournaments/:tournamentId/divisions'|g" "$FILE"
sed -i "s|'>('/divisions/:id'|'>('/tournaments/:tournamentId/divisions/:id'|g" "$FILE"
sed -i "s|'>('/divisions/:divisionId/generate-matches'|'>('/tournaments/:tournamentId/divisions/:divisionId/generate-matches'|g" "$FILE"
sed -i "s|'>('/divisions/:divisionId/pools'|'>('/tournaments/:tournamentId/divisions/:divisionId/pools'|g" "$FILE"
sed -i "s|'>('/divisions/:divisionId/pools/bulk'|'>('/tournaments/:tournamentId/divisions/:divisionId/pools/bulk'|g" "$FILE"

echo "✅ Route paths updated in divisions.ts"
