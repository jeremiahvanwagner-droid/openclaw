#!/usr/bin/env node
/**
 * OpenClaw Checkout Integrator Agent
 * 
 * Distribution Division - Payment processing and checkout optimization
 * 
 * Features:
 *   - Payment gateway integration
 *   - Checkout page optimization
 *   - Order processing
 *   - Subscription management
 *   - Cart abandonment recovery
 *   - Revenue analytics
 * 
 * Usage: node checkout-integrator.mjs <command> [args...]
 * 
 * Commands:
 *   setup <gateway>           Setup payment gateway
 *   checkout <product>        Create checkout flow
 *   order <type>              Generate order template
 *   subscription <plan>       Setup subscription billing
 *   recovery <strategy>       Abandonment recovery setup
 *   analytics                 Revenue analytics
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const CHECKOUT_FILE = path.join(DATA_DIR, 'checkout-data.json');

// Payment gateways
const PAYMENT_GATEWAYS = {
  stripe: {
    name: 'Stripe',
    type: 'Full-service',
    fees: '2.9% + $0.30',
    features: ['Cards', 'ACH', 'Apple Pay', 'Google Pay', 'Subscriptions'],
    integration: 'API + Embeddable',
    setupTime: '1-2 days'
  },
  paypal: {
    name: 'PayPal',
    type: 'Full-service',
    fees: '2.9% + $0.30',
    features: ['PayPal Balance', 'Cards', 'Pay Later', 'Venmo'],
    integration: 'Buttons + API',
    setupTime: '1 day'
  },
  square: {
    name: 'Square',
    type: 'Full-service',
    fees: '2.9% + $0.30',
    features: ['Cards', 'Cash App', 'Afterpay'],
    integration: 'Web + In-person',
    setupTime: '1-2 days'
  },
  gumroad: {
    name: 'Gumroad',
    type: 'Marketplace',
    fees: '9% + $0.30',
    features: ['Digital products', 'Memberships', 'Pre-orders'],
    integration: 'Hosted pages',
    setupTime: 'Hours'
  },
  thrivecart: {
    name: 'ThriveCart',
    type: 'Checkout platform',
    fees: 'One-time purchase',
    features: ['High-converting pages', 'Upsells', 'Affiliates', 'Bumps'],
    integration: 'Hosted + Embed',
    setupTime: '1-3 days'
  },
  samcart: {
    name: 'SamCart',
    type: 'Checkout platform',
    fees: 'Monthly subscription',
    features: ['Templates', 'A/B testing', 'Upsells', 'Subscriptions'],
    integration: 'Hosted pages',
    setupTime: '1-2 days'
  }
};

// Checkout types
const CHECKOUT_TYPES = {
  oneTime: {
    name: 'One-Time Purchase',
    elements: ['Product summary', 'Price', 'Payment form', 'CTA'],
    bestFor: 'Single products, courses'
  },
  subscription: {
    name: 'Subscription Checkout',
    elements: ['Plan selection', 'Billing cycle', 'Payment form', 'Terms'],
    bestFor: 'Memberships, SaaS'
  },
  paymentPlan: {
    name: 'Payment Plan',
    elements: ['Full price vs plan', 'Installments', 'Payment form', 'Schedule'],
    bestFor: 'High-ticket products'
  },
  orderBump: {
    name: 'Order Bump Checkout',
    elements: ['Main product', 'Bump offer', 'Combined checkout'],
    bestFor: 'Increasing AOV'
  },
  multiProduct: {
    name: 'Cart Checkout',
    elements: ['Product list', 'Quantities', 'Subtotal', 'Payment'],
    bestFor: 'Multiple products'
  }
};

// Checkout optimization elements
const OPTIMIZATION_ELEMENTS = {
  trustSignals: [
    'SSL badge',
    'Money-back guarantee',
    'Payment security icons',
    'Customer count',
    'Testimonials'
  ],
  urgencyElements: [
    'Limited-time pricing',
    'Countdown timer',
    'Stock/availability',
    'Fast-action bonus'
  ],
  frictionReducers: [
    'Guest checkout option',
    'Auto-fill enabled',
    'Minimal form fields',
    'Clear error messages',
    'Progress indicator'
  ],
  socialProof: [
    'Real-time purchase notifications',
    'Customer reviews',
    'Media logos',
    'Endorsements'
  ]
};

// Abandonment recovery strategies
const RECOVERY_STRATEGIES = {
  email: {
    name: 'Email Recovery Sequence',
    timing: ['1 hour', '24 hours', '48 hours', '72 hours'],
    content: ['Reminder', 'FAQ/objections', 'Discount offer', 'Last chance'],
    recoveryRate: '5-15%'
  },
  sms: {
    name: 'SMS Recovery',
    timing: ['30 minutes', '24 hours'],
    content: ['Cart reminder', 'Limited discount'],
    recoveryRate: '10-20%'
  },
  retargeting: {
    name: 'Retargeting Ads',
    channels: ['Facebook', 'Instagram', 'Google Display'],
    timing: 'Days 1-7',
    recoveryRate: '3-8%'
  },
  exitIntent: {
    name: 'Exit-Intent Popup',
    triggers: ['Mouse leaving', 'Back button', 'Inactivity'],
    offers: ['Discount', 'Free shipping', 'Save cart'],
    recoveryRate: '5-10%'
  }
};

// Data storage
let checkoutData = {
  gateways: [],
  checkouts: [],
  orders: [],
  analytics: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(CHECKOUT_FILE, 'utf8');
    checkoutData = JSON.parse(data);
  } catch {
    checkoutData = { gateways: [], checkouts: [], orders: [], analytics: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(CHECKOUT_FILE, JSON.stringify(checkoutData, null, 2));
}

/**
 * Setup payment gateway
 */
async function setupGateway(gatewayType, options = {}) {
  const gateway = PAYMENT_GATEWAYS[gatewayType] || PAYMENT_GATEWAYS.stripe;
  
  const setup = {
    id: `gateway-${Date.now()}`,
    gateway: gatewayType,
    name: gateway.name,
    config: gateway,
    setupSteps: [],
    status: 'pending'
  };
  
  // Gateway-specific setup steps
  switch (gatewayType) {
    case 'stripe':
      setup.setupSteps = [
        { step: 1, action: 'Create Stripe account', status: 'pending' },
        { step: 2, action: 'Complete business verification', status: 'pending' },
        { step: 3, action: 'Get API keys (publishable + secret)', status: 'pending' },
        { step: 4, action: 'Configure webhook endpoints', status: 'pending' },
        { step: 5, action: 'Test with test mode', status: 'pending' },
        { step: 6, action: 'Switch to live mode', status: 'pending' }
      ];
      setup.webhooks = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'invoice.payment_succeeded',
        'payment_intent.succeeded'
      ];
      break;
      
    case 'paypal':
      setup.setupSteps = [
        { step: 1, action: 'Create PayPal Business account', status: 'pending' },
        { step: 2, action: 'Get Client ID and Secret', status: 'pending' },
        { step: 3, action: 'Configure IPN (Instant Payment Notification)', status: 'pending' },
        { step: 4, action: 'Add PayPal buttons to checkout', status: 'pending' },
        { step: 5, action: 'Test in sandbox', status: 'pending' }
      ];
      break;
      
    default:
      setup.setupSteps = [
        { step: 1, action: 'Create account', status: 'pending' },
        { step: 2, action: 'Configure API access', status: 'pending' },
        { step: 3, action: 'Add payment form', status: 'pending' },
        { step: 4, action: 'Test transactions', status: 'pending' }
      ];
  }
  
  setup.generatedAt = new Date().toISOString();
  
  checkoutData.gateways.push(setup);
  await saveData();
  
  return setup;
}

/**
 * Create checkout flow
 */
async function createCheckout(product, options = {}) {
  const price = options.price || 97;
  const type = options.type || 'oneTime';
  
  const checkout = {
    id: `checkout-${Date.now()}`,
    product,
    price,
    type,
    config: CHECKOUT_TYPES[type] || CHECKOUT_TYPES.oneTime,
    elements: {},
    optimizations: []
  };
  
  // Header section
  checkout.elements.header = {
    logo: true,
    securityBadge: true,
    progressBar: false
  };
  
  // Product summary
  checkout.elements.productSummary = {
    name: product,
    price: `$${price}`,
    image: true,
    description: `Access to ${product}`,
    guarantee: '30-day money-back guarantee'
  };
  
  // Form fields
  checkout.elements.formFields = [
    { field: 'email', required: true, label: 'Email Address' },
    { field: 'name', required: true, label: 'Full Name' },
    { field: 'card', required: true, label: 'Card Number' },
    { field: 'expiry', required: true, label: 'MM/YY' },
    { field: 'cvc', required: true, label: 'CVC' }
  ];
  
  // Order bump
  if (options.bump) {
    checkout.elements.orderBump = {
      enabled: true,
      product: options.bump.product || 'Quick Start Guide',
      price: options.bump.price || 27,
      description: `Add the ${options.bump.product || 'Quick Start Guide'} for just $${options.bump.price || 27}`,
      position: 'before-payment'
    };
  }
  
  // Trust elements
  checkout.elements.trustSignals = OPTIMIZATION_ELEMENTS.trustSignals;
  
  // CTA
  checkout.elements.cta = {
    text: `Complete Order - $${price}`,
    subtext: 'You will be charged immediately',
    style: 'large-button'
  };
  
  // Add optimizations
  checkout.optimizations = [
    ...OPTIMIZATION_ELEMENTS.frictionReducers.slice(0, 3),
    ...OPTIMIZATION_ELEMENTS.trustSignals.slice(0, 2)
  ];
  
  checkout.generatedAt = new Date().toISOString();
  
  checkoutData.checkouts.push(checkout);
  await saveData();
  
  return checkout;
}

/**
 * Generate order template
 */
async function generateOrderTemplate(orderType, options = {}) {
  const template = {
    id: `order-${Date.now()}`,
    type: orderType,
    structure: {}
  };
  
  switch (orderType) {
    case 'receipt':
      template.structure = {
        header: ['Order confirmation', 'Order number', 'Date'],
        customerInfo: ['Name', 'Email'],
        orderDetails: ['Product name', 'Quantity', 'Price'],
        totals: ['Subtotal', 'Tax', 'Total'],
        accessInfo: ['Login link', 'Download links'],
        support: ['Email', 'FAQ link']
      };
      template.emailSubject = 'Your order confirmation - [Order #]';
      break;
      
    case 'invoice':
      template.structure = {
        header: ['Invoice number', 'Date', 'Due date'],
        businessInfo: ['Company name', 'Address', 'Tax ID'],
        customerInfo: ['Name', 'Email', 'Address'],
        lineItems: ['Description', 'Quantity', 'Unit price', 'Amount'],
        totals: ['Subtotal', 'Tax', 'Total', 'Amount due'],
        paymentInfo: ['Payment methods', 'Bank details']
      };
      break;
      
    case 'subscription':
      template.structure = {
        header: ['Subscription confirmation', 'Plan name', 'Start date'],
        planDetails: ['Plan name', 'Billing cycle', 'Price per period'],
        nextBilling: ['Next charge date', 'Amount'],
        accessInfo: ['Portal link', 'Member area'],
        management: ['Upgrade link', 'Cancel link']
      };
      break;
      
    default:
      template.structure = {
        header: ['Order details'],
        content: ['Product', 'Price', 'Access'],
        footer: ['Support contact']
      };
  }
  
  template.generatedAt = new Date().toISOString();
  
  return template;
}

/**
 * Setup subscription billing
 */
async function setupSubscription(planName, options = {}) {
  const monthlyPrice = options.monthlyPrice || 47;
  const yearlyPrice = options.yearlyPrice || monthlyPrice * 10;
  
  const subscription = {
    id: `sub-${Date.now()}`,
    planName,
    tiers: [
      {
        name: 'Monthly',
        price: monthlyPrice,
        interval: 'month',
        features: options.features || ['Full access', 'Community', 'Updates'],
        recommended: false
      },
      {
        name: 'Annual',
        price: yearlyPrice,
        interval: 'year',
        savings: `Save $${(monthlyPrice * 12 - yearlyPrice)}`,
        features: options.features || ['Full access', 'Community', 'Updates'],
        bonus: 'Bonus: Priority support',
        recommended: true
      }
    ],
    billing: {
      trialDays: options.trialDays || 0,
      gracePeriod: 3,
      retrySchedule: [1, 3, 5, 7],
      dunningEmails: true
    },
    management: {
      selfService: true,
      pauseAllowed: true,
      downgradeAllowed: true,
      prorationEnabled: true
    },
    webhooks: [
      'subscription.created',
      'subscription.updated',
      'subscription.canceled',
      'invoice.payment_failed',
      'invoice.paid'
    ]
  };
  
  subscription.generatedAt = new Date().toISOString();
  
  return subscription;
}

/**
 * Setup abandonment recovery
 */
async function setupRecovery(strategyType) {
  const strategy = RECOVERY_STRATEGIES[strategyType] || RECOVERY_STRATEGIES.email;
  
  const recovery = {
    id: `recovery-${Date.now()}`,
    type: strategyType,
    name: strategy.name,
    config: strategy,
    implementation: {}
  };
  
  switch (strategyType) {
    case 'email':
      recovery.implementation = {
        sequence: [
          {
            email: 1,
            subject: 'Did you forget something?',
            delay: '1 hour',
            content: 'Reminder of cart contents, no discount'
          },
          {
            email: 2,
            subject: 'Quick question about your order',
            delay: '24 hours',
            content: 'Address objections, FAQs'
          },
          {
            email: 3,
            subject: 'Special offer inside',
            delay: '48 hours',
            content: '10% discount code'
          },
          {
            email: 4,
            subject: 'Last chance - offer expires',
            delay: '72 hours',
            content: 'Final reminder, urgency'
          }
        ],
        triggers: ['Cart abandonment', 'Checkout abandonment'],
        exitConditions: ['Purchase completed', 'Unsubscribe']
      };
      break;
      
    case 'exitIntent':
      recovery.implementation = {
        popup: {
          headline: 'Wait! Don\'t leave yet...',
          offer: 'Get 10% off your order',
          cta: 'Claim Discount',
          emailCapture: true
        },
        triggers: ['Mouse leaves viewport', 'Back button pressed'],
        frequency: 'Once per session'
      };
      break;
      
    default:
      recovery.implementation = {
        channels: strategy.channels || ['Email'],
        timing: strategy.timing || ['24 hours']
      };
  }
  
  recovery.expectedRecovery = strategy.recoveryRate;
  recovery.generatedAt = new Date().toISOString();
  
  return recovery;
}

/**
 * Generate revenue analytics
 */
async function generateAnalytics(data = {}) {
  const analytics = {
    period: data.period || 'Last 30 days',
    revenue: {
      gross: data.grossRevenue || 15000,
      refunds: data.refunds || 500,
      net: (data.grossRevenue || 15000) - (data.refunds || 500),
      fees: Math.round((data.grossRevenue || 15000) * 0.03)
    },
    orders: {
      total: data.orders || 150,
      completed: data.completed || 145,
      refunded: data.refundedOrders || 5,
      refundRate: '3.3%'
    },
    metrics: {},
    insights: []
  };
  
  // Calculate key metrics
  analytics.metrics = {
    averageOrderValue: (analytics.revenue.gross / analytics.orders.total).toFixed(2),
    conversionRate: data.conversionRate || '3.2%',
    cartAbandonmentRate: data.abandonmentRate || '68%',
    recoveryRate: data.recoveryRate || '8%'
  };
  
  // Add revenue by product
  analytics.byProduct = [
    { product: 'Main Course', revenue: analytics.revenue.gross * 0.6, orders: Math.round(analytics.orders.total * 0.5) },
    { product: 'Premium Upsell', revenue: analytics.revenue.gross * 0.25, orders: Math.round(analytics.orders.total * 0.2) },
    { product: 'Order Bumps', revenue: analytics.revenue.gross * 0.15, orders: Math.round(analytics.orders.total * 0.4) }
  ];
  
  // Add revenue by gateway
  analytics.byGateway = [
    { gateway: 'Stripe', percentage: '75%' },
    { gateway: 'PayPal', percentage: '25%' }
  ];
  
  // Generate insights
  analytics.insights = [
    'AOV is above average - upsell strategy working',
    'Cart abandonment at 68% - implement exit intent popup',
    'Recovery rate of 8% - consider adding SMS recovery',
    'PayPal at 25% - keep as payment option'
  ];
  
  analytics.generatedAt = new Date().toISOString();
  
  return analytics;
}

/**
 * Generate checkout optimization checklist
 */
async function generateOptimizationChecklist() {
  const checklist = {
    trust: OPTIMIZATION_ELEMENTS.trustSignals.map(s => ({ item: s, implemented: false })),
    urgency: OPTIMIZATION_ELEMENTS.urgencyElements.map(s => ({ item: s, implemented: false })),
    friction: OPTIMIZATION_ELEMENTS.frictionReducers.map(s => ({ item: s, implemented: false })),
    social: OPTIMIZATION_ELEMENTS.socialProof.map(s => ({ item: s, implemented: false }))
  };
  
  checklist.priorityActions = [
    { action: 'Add SSL badge near payment form', impact: 'High', effort: 'Low' },
    { action: 'Reduce form fields to minimum', impact: 'High', effort: 'Low' },
    { action: 'Add money-back guarantee badge', impact: 'High', effort: 'Low' },
    { action: 'Enable Apple/Google Pay', impact: 'Medium', effort: 'Medium' },
    { action: 'Implement exit-intent popup', impact: 'Medium', effort: 'Medium' }
  ];
  
  return checklist;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'setup': {
        const gateway = args[0] || 'stripe';
        const setup = await setupGateway(gateway);
        
        console.log(`Payment Gateway Setup: ${setup.name}`);
        console.log('='.repeat(50));
        console.log(`Fees: ${setup.config.fees}`);
        console.log(`Setup Time: ${setup.config.setupTime}`);
        console.log('\nSetup Steps:');
        for (const step of setup.setupSteps.slice(0, 4)) {
          console.log(`  ${step.step}. ${step.action}`);
        }
        break;
      }
      
      case 'checkout': {
        const product = args.join(' ') || 'Digital Course';
        const checkout = await createCheckout(product, { price: 97 });
        
        console.log('Checkout Flow Created');
        console.log('='.repeat(50));
        console.log(`Product: ${checkout.product}`);
        console.log(`Price: ${checkout.elements.productSummary.price}`);
        console.log(`Fields: ${checkout.elements.formFields.length}`);
        console.log(`Optimizations: ${checkout.optimizations.length}`);
        break;
      }
      
      case 'order': {
        const type = args[0] || 'receipt';
        const template = await generateOrderTemplate(type);
        
        console.log(`Order Template: ${type}`);
        console.log('='.repeat(50));
        console.log('Sections:', Object.keys(template.structure).join(', '));
        break;
      }
      
      case 'subscription': {
        const plan = args.join(' ') || 'Premium Membership';
        const subscription = await setupSubscription(plan);
        
        console.log('Subscription Setup');
        console.log('='.repeat(50));
        for (const tier of subscription.tiers) {
          console.log(`\n${tier.name}: $${tier.price}/${tier.interval}`);
          if (tier.savings) console.log(`  ${tier.savings}`);
        }
        break;
      }
      
      case 'recovery': {
        const strategy = args[0] || 'email';
        const recovery = await setupRecovery(strategy);
        
        console.log(`Recovery Strategy: ${recovery.name}`);
        console.log('='.repeat(50));
        console.log(`Expected Recovery: ${recovery.expectedRecovery}`);
        
        if (recovery.implementation.sequence) {
          console.log('\nSequence:');
          for (const email of recovery.implementation.sequence.slice(0, 3)) {
            console.log(`  ${email.delay}: ${email.subject}`);
          }
        }
        break;
      }
      
      case 'analytics': {
        const analytics = await generateAnalytics();
        
        console.log('Revenue Analytics');
        console.log('='.repeat(50));
        console.log(`Net Revenue: $${analytics.revenue.net.toLocaleString()}`);
        console.log(`Orders: ${analytics.orders.total}`);
        console.log(`AOV: $${analytics.metrics.averageOrderValue}`);
        console.log(`\nInsights:`);
        for (const insight of analytics.insights.slice(0, 3)) {
          console.log(`  • ${insight}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Checkout Integrator Module');
        console.log('==========================');
        console.log(`Payment gateways: ${Object.keys(PAYMENT_GATEWAYS).length}`);
        console.log(`Checkout types: ${Object.keys(CHECKOUT_TYPES).length}`);
        console.log(`Recovery strategies: ${Object.keys(RECOVERY_STRATEGIES).length}`);
        console.log(`Checkouts created: ${checkoutData.checkouts.length}`);
        break;
      }
      
      default:
        console.log('Checkout Integrator - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  setupGateway,
  createCheckout,
  generateOrderTemplate,
  setupSubscription,
  setupRecovery,
  generateAnalytics,
  generateOptimizationChecklist,
  PAYMENT_GATEWAYS,
  CHECKOUT_TYPES,
  OPTIMIZATION_ELEMENTS,
  RECOVERY_STRATEGIES
};

// Run CLI
main().catch(console.error);
