# ADR-0004 — Deleted-order token release

Format: agent-common `templates/ADR-0000.md`.

- Date: 20 November 2026
- Who: ChatGPT implementation branch; requested by Steve while resolving Issue #1
- Owner: Steve
- Status: Accepted for review in PR #2
- End condition: Applies to token allocation under F-13 unless Steve changes the rule.

## Context

The operation log retains `order.delete` as a tombstone so deletion is synchronised and remains auditable. The token allocator previously counted deleted orders when finding the highest token for the day and device range. Deleting the latest order therefore left its number reserved indefinitely, even though the order was no longer active (Issue #1).

The previous architecture note said a deleted order left a gap. Steve has now reported that the deleted token should be released.

## Decision

- Keep the delete tombstone in the operation log; do not physically remove the order's history.
- Exclude deleted orders from `nextToken()` when finding the highest allocated token for that day and device range.
- Continue ascending/high-water allocation. When the latest token is deleted, the next order may reuse it.
- Do not backfill an earlier gap below a later-issued non-deleted token. This preserves the existing F-13 sequential allocation rule.
- Token ranges, per-day reset, and wrap behaviour remain unchanged.

## Consequences

- The deleted-order token is reusable without weakening operation-log sync or audit history.
- A token from a deleted order below a later-issued token remains a gap until the normal range sequence cycles; this is intentional under ascending allocation.
- `src/store/rules/tokens.test.ts` covers reuse of a deleted trailing token and release of the only token in a day/range.
