---
name: approval-rubric
description: Evaluate approval packets for policy, brand risk, rollback safety, spend controls, and credential handling. Use when approving/rejecting sensitive changes and when summarizing weekly rejection reasons.
---

# Approval Rubric

Apply this rubric to every ApprovalPacket.

## Decision Labels
- `Approved`
- `Rejected`
- `NeedsInfo`

## Required Checks
1. **Rollback Feasibility**
   - Snapshot/version exists
   - Trigger thresholds defined
   - Revert steps and ETA included
2. **Claims Compliance**
   - No prohibited guarantees or deceptive claims
   - Regulated claims have approved language/proof
3. **Spend Guardrails**
   - Budget bounds defined
   - Stop-loss thresholds and action owner defined
4. **Security/Credentials**
   - No plaintext token exposure
   - Principle of least privilege maintained
5. **Blast Radius**
   - Affected systems/users identified
   - Containment plan documented

## Weekly Learning Loop
- Aggregate rejection reasons by category:
  - compliance
  - rollback_missing
  - spend_unbounded
  - credential_risk
  - unclear_impact
- Rank top 3 recurring reasons.
- Add one rubric clarification per recurring reason.

## Output Contract
Return `ApprovalDecision` JSON:
- `decision`
- `requiredConditions`
- `notes`
- `rejectionReasonCategory` (if rejected)
