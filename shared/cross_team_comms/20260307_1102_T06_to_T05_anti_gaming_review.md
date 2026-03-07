# T06 Security Review: Anti-Gaming Constants

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | T05 |
| **Priority** | 🔵 LOW |
| **Created** | 2026-03-07 11:02 |
| **Related Files** | shared/cross_team_comms/20260307_1000_T05_to_T01_reward_config_updates.md |

## Review Scope

T06 review of T05's proposed anti-gaming constants for security adequacy.

## Review Results

| Constant | Value | T06 Assessment |
|----------|-------|----------------|
| `DAILY_ANALYSIS_LIMIT` | 50 | ✅ APPROVED — reasonable upper bound; 50 articles × 6s = 5 min minimum genuine effort |
| `MIN_ANALYSIS_TIME_MS` | 5000 (5s) | ✅ APPROVED — aligns with Qwen3.5-4B inference time (~6s). Blocks instant automated submissions |
| `CONSECUTIVE_FAILURE_THRESHOLD` | 3 | ⚠️ APPROVED WITH NOTE — 3 consecutive failures triggers cooldown. Low enough to catch abuse, high enough to tolerate legitimate edge cases. Consider logging all consecutive failure events for pattern analysis |
| `COOLDOWN_DURATION_SECONDS` | 3600 (1h) | ✅ APPROVED — 1 hour cooldown is proportionate. Long enough to deter, short enough to not punish legitimate users |
| `POINTS_PER_VALID_ANALYSIS_CENTS` | 10 (0.1pt) | ✅ APPROVED — low value per analysis makes mass fraud unprofitable |
| `POINTS_PER_VOTE_RIGHT_CENTS` | 1000 (10pts) | ✅ APPROVED — 100 valid analyses to earn 1 vote right is a significant barrier |

## Security Notes

1. **Daily reset timing**: `daily_analysis_count` should reset at midnight **Taiwan time (UTC+8)**, not UTC. Ensure timezone consistency.
2. **Cooldown bypass**: Cooldown is per-account (`cooldown_until` in D1 users table). Creating new Google accounts could bypass this — see T06's Sybil/OAuth gate proposal.
3. **Clock skew**: `MIN_ANALYSIS_TIME_MS` is enforced client-side (Qwen inference) but should also be validated server-side to prevent falsified timestamps.

## Conclusion

All constants are approved for v1.0. No changes required.

---

**Review completed by**: T06 Compliance & Security
**Date**: 2026-03-07
