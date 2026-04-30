/**
 * Automation Logic Designer — Core Logic
 * Translates plain-English automation requests into structured JSON workflow maps for GHL.
 */

const GHL_TRIGGERS = {
  'contact created': 'contact.created',
  'tag added': 'contact.tag.added',
  'form submitted': 'form.submitted',
  'appointment booked': 'appointment.booked',
  'pipeline stage changed': 'opportunity.stage.changed',
  'invoice paid': 'invoice.paid',
  'email opened': 'email.opened',
  'sms replied': 'sms.replied',
};

const GHL_ACTIONS = {
  'send sms': 'send_sms',
  'send email': 'send_email',
  'add tag': 'add_tag',
  'remove tag': 'remove_tag',
  'wait': 'wait',
  'if else': 'condition',
  'move pipeline stage': 'move_stage',
  'create task': 'create_task',
  'webhook': 'webhook',
};

/**
 * Parse automation description and generate a structured workflow map.
 * @param {{ automation_description: string, saas_instance_id: string, location_id: string, existing_tags?: string[], niche_context?: string }} params
 * @returns {{ workflow: object, compliance_notes: string[], warnings: string[] }}
 */
export function designAutomationWorkflow(params) {
  const { automation_description, niche_context } = params;
  const desc = automation_description.toLowerCase();
  const warnings = [];
  const compliance_notes = [];

  const trigger = detectTrigger(desc);
  const steps = detectSteps(desc);

  if (/sms/i.test(desc)) {
    compliance_notes.push('SMS actions require opt-out language (e.g., "Reply STOP to unsubscribe").');
  }

  if (steps.length > 20) {
    warnings.push('Workflow exceeds 20 steps — consider splitting into chained workflows.');
  }

  const waitCount = steps.filter(s => s.type === 'wait').length;
  if (waitCount > 5) {
    warnings.push(`${waitCount} wait steps detected — review for over-complexity.`);
  }

  detectLoopRisks(steps, warnings);

  const workflow = {
    workflow_name: `${niche_context ?? 'general'}-${trigger.type.replace('.', '-')}-v1`,
    description: automation_description,
    triggers: [trigger],
    steps,
    estimated_contacts_per_day: 0,
    compliance_notes,
  };

  validateOrphanSteps(workflow, warnings);

  return { workflow, compliance_notes, warnings };
}

function detectTrigger(desc) {
  for (const [keyword, ghlKey] of Object.entries(GHL_TRIGGERS)) {
    if (desc.includes(keyword)) return { type: ghlKey, config: {} };
  }
  return { type: 'contact.created', config: {} };
}

function detectSteps(desc) {
  const steps = [];
  let idx = 1;
  for (const [keyword, actionKey] of Object.entries(GHL_ACTIONS)) {
    if (desc.includes(keyword)) {
      steps.push({
        id: `step_${idx}`,
        type: actionKey === 'wait' ? 'wait' : actionKey === 'condition' ? 'condition' : 'action',
        action_type: actionKey,
        config: {},
        next: `step_${idx + 1}`,
      });
      idx++;
    }
  }
  return steps;
}

function detectLoopRisks(steps, warnings) {
  const addTagSteps = steps.filter(s => s.action_type === 'add_tag');
  for (const step of addTagSteps) {
    warnings.push(`Step "${step.id}" adds a tag — ensure that tag does not re-trigger this workflow (potential infinite loop).`);
  }
}

function validateOrphanSteps(workflow, warnings) {
  const ids = new Set(workflow.steps.map(s => s.id));
  for (const step of workflow.steps) {
    if (step.next && !ids.has(step.next) && step.next !== 'end') {
      warnings.push(`Step "${step.id}" references unknown next step "${step.next}".`);
    }
  }
}
