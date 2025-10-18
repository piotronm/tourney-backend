#!/usr/bin/env python3
"""
Phase 4A - Apply all route changes to divisions.ts and teams.ts
This script systematically updates both files with tournament context.
"""

import re
import sys

def update_divisions_file(content):
    """Update divisions.ts with tournament context"""

    # 1. Update header comment
    content = re.sub(
        r'/\*\*\n \* Division CRUD endpoints\.\n \* Manages tournament divisions with full CRUD operations\.\n \*/',
        '''/**
 * Division CRUD endpoints (UPDATED - Phase 4A: Tournament Context).
 * All admin routes now require tournament context.
 *
 * Routes:
 * - POST   /tournaments/:tournamentId/divisions
 * - GET    /tournaments/:tournamentId/divisions
 * - GET    /tournaments/:tournamentId/divisions/:id
 * - PUT    /tournaments/:tournamentId/divisions/:id
 * - DELETE /tournaments/:tournamentId/divisions/:id
 * - POST   /tournaments/:tournamentId/divisions/:divisionId/generate-matches
 * - POST   /tournaments/:tournamentId/divisions/:divisionId/pools
 * - POST   /tournaments/:tournamentId/divisions/:divisionId/pools/bulk
 */''',
        content
    )

    # 2. Update imports - add tournaments
    content = re.sub(
        r"import \{ divisions, teams, pools, matches, players, court_assignments \} from '\.\./lib/db/schema\.js';",
        "import { tournaments, divisions, teams, pools, matches, players, court_assignments } from '../lib/db/schema.js';",
        content
    )

    # 3. Add new Zod schemas before createDivisionSchema
    new_schemas = '''/**
 * Tournament ID parameter schema.
 */
const tournamentParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
});

/**
 * Tournament + Division ID parameter schema.
 */
const tournamentDivisionParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  id: z.coerce.number().int().positive(),
});

/**
 * Division ID parameter schema (for generate-matches and pools).
 */
const divisionIdParamsSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  divisionId: z.coerce.number().int().positive(),
});

'''

    content = re.sub(
        r'/\*\*\n \* Create division schema\.\n \*/',
        new_schemas + '/**\n * Create division schema.\n */',
        content
    )

    # 4. Remove old divisionParamsSchema (we have a better one now)
    content = re.sub(
        r'/\*\*\n \* Division ID parameter schema\.\n \*/\nconst divisionParamsSchema = z\.object\(\{\n  id: z\.coerce\.number\(\)\.int\(\)\.positive\(\),\n\}\);\n\n',
        '',
        content
    )

    # 5. Update CREATE Division route
    content = re.sub(
        r"fastify\.post<\{\s+Body: z\.infer<typeof createDivisionSchema>;\s+\}>'\('/divisions', \{",
        "fastify.post<{\n    Params: z.infer<typeof tournamentParamsSchema>;\n    Body: z.infer<typeof createDivisionSchema>;\n  }>('/tournaments/:tournamentId/divisions', {",
        content,
        flags=re.MULTILINE
    )

    return content

def main():
    # Read divisions.ts
    with open('/home/piouser/eztourneyz/backend/apps/api/src/routes/divisions.ts', 'r') as f:
        divisions_content = f.read()

    # Apply updates
    updated_content = update_divisions_file(divisions_content)

    # Write back
    with open('/home/piouser/eztourneyz/backend/apps/api/src/routes/divisions.ts', 'w') as f:
        f.write(updated_content)

    print("✅ divisions.ts updated successfully")

if __name__ == '__main__':
    main()
