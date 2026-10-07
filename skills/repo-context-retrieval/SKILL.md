---
name: repo-context-retrieval
description: Retrieve precise repository context with source-level evidence and maintain verified persistent context.
compatibility: opencode
---

# Repository Context Retrieval

Use the `retrieval` MCP server.

## Workflow

1. Call `retrieval_context_lookup` first.
2. If relevant results are `action: use`, answer from them.
3. Otherwise retrieve the minimum authoritative source needed.
4. Prefer exact paths, symbols, references, and line ranges.
5. Persist newly verified facts with `retrieval_context_upsert`.
6. Invalidate contradicted facts with `retrieval_context_invalidate`.
7. Never answer from a context record marked for review without re-checking source.
8. Never modify repository source.
9. Cite file paths and line ranges for non-trivial claims.
10. State uncertainty when repository evidence is insufficient.