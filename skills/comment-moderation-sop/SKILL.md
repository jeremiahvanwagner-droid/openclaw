---
name: comment-moderation-sop
description: Classify social comments and generate compliant response options with escalation decisions. Use when handling comment queues, moderation batches, sensitive replies, harassment threats, refund/payment complaints, or policy-risk topics.
---

# Comment Moderation SOP

Classify each comment, propose safe replies, and decide hide/delete/escalate actions.

## Output Contract
Return `ModerationBatch` JSON with one item per comment:
- `commentId`
- `classification` (`question|objection|spam|hostile|sensitive`)
- `action` (`respond|hide|delete|escalate`)
- `replyOptions` (`short|empathetic|authority`) when action is `respond`
- `escalationReason` when action is `escalate`
- `evidenceRefs` (screenshot/log refs if available)

## Classification Labels
- `question`: Good-faith info request.
- `objection`: Skeptical but non-abusive challenge.
- `spam`: Irrelevant promo/scam/repetitive links.
- `hostile`: Insults, harassment, threats, hate.
- `sensitive`: Legal/medical/financial claims, refund/payment disputes, policy-risk issues.

## Action Rules (Hide/Delete/Escalate)
1. **Delete**: clear spam/scam/phishing, explicit hate/threats (per platform policy).
2. **Hide**: low-value trolling, repetitive derailments, non-constructive hostility.
3. **Respond**: normal questions/objections with approved templates.
4. **Escalate (no auto-reply)** when:
   - policy/compliance risk
   - harassment threats or legal threat language
   - refund/payment complaints
   - requests for regulated advice (medical/legal/financial)

## Response Template Use
Load `references/response-templates.md` and pick one short, one empathetic, one authority option.

## Safety Guardrails
- Do not provide legal/medical/financial advice.
- Do not admit fault or promise refunds publicly unless approved.
- Keep responses factual, calm, and brand-aligned.
- If uncertain, mark `action=escalate`.
