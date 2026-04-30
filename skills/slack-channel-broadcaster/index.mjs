/**
 * Slack Channel Broadcaster — Browser automation instruction wrapper.
 * Default: draft/preview text review before send in high-impact channels.
 */

export function buildSignInSteps() {
  return [
    { action: 'navigate', url: 'https://slack.com/signin', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map Slack sign-in or workspace selector', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref workspace_selector_or_continue>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm workspace loaded', browser_profile: 'openclaw' },
  ];
}

export function buildChannelNavigationSteps(channelName) {
  return [
    { action: 'click', ref: '<ref channel_search_or_sidebar>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map channel search', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref channel_search_input>', value: channelName, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: `see channel results for ${channelName}`, browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref channel_${channelName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}>`, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: `confirm in #${channelName} before posting`, browser_profile: 'openclaw' },
  ];
}

export function buildPostSteps(messageText) {
  return [
    { action: 'click', ref: '<ref message_input>', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref message_input>', value: messageText, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify message text before send', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref send_button_or_press_enter_control>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify sent message appears in channel timeline', browser_profile: 'openclaw' },
    { action: 'read', ref: '<ref latest_message_in_channel>', note: 'Confirm message content rendered as expected' },
  ];
}

export function generateBroadcastPlan(channels, messageText, options = {}) {
  const { requirePreviewApproval = true } = options;
  return {
    channels_targeted: channels,
    message_preview: messageText,
    execution_plan: channels.map((channel, i) => ({
      channel,
      batch: i + 1,
      steps: [
        ...(i === 0 ? buildSignInSteps() : []),
        ...buildChannelNavigationSteps(channel),
        ...(requirePreviewApproval ? [{ action: 'pause', reason: `Review message before posting to #${channel}. Confirm send.` }] : []),
        ...buildPostSteps(messageText),
      ],
    })),
    guardrails: ['--browser-profile openclaw', 'confirm workspace + channel before posting', 'snapshot between channels', 'do not post to external/shared channels unless explicitly requested'],
    output_contract: { channels_posted: 0, message_variant: messageText, delivery_confirmations: [], channels_skipped: [], skip_reasons: [] },
  };
}
