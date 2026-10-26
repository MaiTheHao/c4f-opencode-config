---
name: oc-retrieval
description: Retrieve precise repository context with source-level evidence and maintain verified persistent context.
compatibility: opencode
---

# Repository Context Retrieval

Answer repository questions with source-cited evidence and maintain the verified context store. Read-only on repository source.

Code Mode tools, namespace `c4f-retrieval`: `tools['c4f-retrieval'].context_lookup`, `.code_outline`, `.context_upsert`, `.context_invalidate`. Batch independent calls in one script (`Promise.all`). Everything else uses native `grep` / `read` / `glob` / `shell` (git).

## 1. Lookup first

Call `context_lookup` once per distinct concept (symbol, flow, component) before reading source. Each hit has `action`:

| `action` | Meaning                                              | Do                                            |
| -------- | ---------------------------------------------------- | --------------------------------------------- |
| `use`    | All stamped sources unchanged                        | Answer from it; still cite its sources        |
| `review` | Stale or unverifiable (`freshness.reasons` says why) | Hint only: re-check against source before use |

No hit, or only `review` hits → go to step 2.

## 2. Investigate narrowly

Read the minimum source that proves each claim.

| Need                                                                 | Tool                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Declaration outline: classes, methods, line ranges (py, java, ts/js) | `code_outline` (use `name_contains` on large files; ranges are approximate) |
| Text search, references, file discovery                              | `grep` / `glob`                                                             |
| Exact lines                                                          | `read` with a line range                                                    |
| HEAD, branch, dirty state                                            | `shell` git                                                                 |

Prefer `code_outline` then a ranged `read` over reading a whole module. Stop as soon as every part of the question is backed by a citation.

## 3. Persist

For each verified fact cluster, `context_upsert` one record:

```json
{
  "id": "area.component.topic",
  "summary": "One verified, self-contained statement.",
  "sources": [{ "path": "src/a/b.py", "lines": "40-88" }],
  "relations": ["other.record.id"]
}
```

- `id`: stable dotted name; reuse the same id to update, never create near-duplicates.
- `sources`: every file the claim depends on (freshness is checked by file hash). A record without sources can only be checked against HEAD.
- If the result has `unstamped` or `warnings`, fix the paths and upsert again.
- Fact no longer true → `context_invalidate` with a `reason`. Check `missing` in the result.
- One cluster per record. NEVER store guesses; NEVER replace a precise record with a vaguer one.

## 4. Answer

1. Re-check each claim against the evidence you collected.
2. Cite `path/to/file.py:LINE-LINE` for every non-trivial claim.
3. State uncertainty explicitly; NEVER infer undocumented runtime behavior.
4. On tool failure or insufficient evidence, reply `BLOCKED: <what is missing>`; never guess.

## Constraints

- Repository source is authoritative; the store is only a cache and navigation layer.
- NEVER modify repository files. The only allowed mutations are `context_upsert` and `context_invalidate`.
