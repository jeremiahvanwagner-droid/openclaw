---
name: sms-compliance-checker
description: Reviews SMS messages for A2P 10DLC compliance, opt-out language, character limits, and regulatory requirements before sending
---

# SMS Compliance Checker

## Purpose
Pre-send compliance gate for all SMS messages. Ensures TCPA/A2P 10DLC compliance, required opt-out language, character limits, and content restrictions before any SMS goes out.

## Required Inputs
- `message` (string): SMS message text to check
- `message_type` (string): "marketing" | "transactional" | "conversational"

## Optional Inputs
- `recipient_consent_verified` (boolean): Whether opt-in is confirmed
- `sender_id` (string): Sending phone number / short code
- `campaign_id` (string): Associated campaign

## Compliance Rules

### Mandatory — Block if Missing
| Rule | Requirement |
|------|-------------|
| Opt-out language | Marketing SMS MUST include "Reply STOP to unsubscribe" or equivalent |
| Character limit | Single SMS ≤ 160 chars (or clearly segmented for multi-part) |
| Consent verification | Marketing SMS requires prior opt-in confirmation |
| Business identification | First marketing SMS must identify sender |
| Quiet hours | Block scheduling between 9PM-8AM recipient local time |

### Content Restrictions — Block if Detected
| Category | Examples |
|----------|---------|
| SHAFT content | Sex, Hate, Alcohol, Firearms, Tobacco |
| Misleading claims | "Guaranteed", "Risk-free", "Free money" |
| Phishing indicators | URL shorteners to unknown domains, urgency manipulation |
| Financial solicitation | Loan offers without required disclosures |

### Warnings — Flag for Review
| Rule | Condition |
|------|-----------|
| URL included | Any URL triggers review (check domain reputation) |
| All caps | >30% uppercase characters |
| Multiple exclamation | 3+ exclamation marks |
| Emoji density | >5 emojis per message |
| Phone number in body | Embedded phone numbers (potential spam signal) |

## Validation Process
1. Check message_type — apply appropriate rule set
2. Scan for opt-out language (marketing only)
3. Validate character count and encoding
4. Run content restriction scan
5. Check warning conditions
6. Calculate compliance score
7. Return verdict: pass / warnings / blocked

## Output Contract
```json
{
  "verdict": "pass|warnings|blocked",
  "compliance_score": 0,
  "message_length": 0,
  "segments": 1,
  "issues": [
    {
      "severity": "critical|warning",
      "rule": "string",
      "description": "string",
      "fix": "string"
    }
  ],
  "opt_out_present": false,
  "content_flags": ["string"],
  "checked_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Marketing SMS without opt-out is blocked
- [ ] Character count includes special character encoding (GSM-7 vs UCS-2)
- [ ] SHAFT content is detected and blocked
- [ ] Transactional messages have relaxed opt-out requirements
- [ ] Compliance score is 0-100
- [ ] All blocked messages include specific fix instructions
