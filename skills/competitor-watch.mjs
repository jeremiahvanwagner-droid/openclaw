#!/usr/bin/env node
/**
 * OpenClaw Competitor Watch Agent
 * 
 * Research Division - Competitor monitoring and analysis
 * 
 * Features:
 *   - Competitor profile tracking
 *   - Pricing intelligence
 *   - Product/service monitoring
 *   - Marketing strategy analysis
 *   - SWOT comparison
 *   - Alert system for changes
 * 
 * Usage: node competitor-watch.mjs <command> [args...]
 * 
 * Commands:
 *   add <competitor> <url>    Add competitor to tracking
 *   analyze <competitor>      Full competitor analysis
 *   compare [competitors...]  Compare multiple competitors
 *   pricing <competitor>      Pricing intelligence
 *   alerts                    View recent alerts
 *   report                    Generate competitor report
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const COMPETITORS_FILE = path.join(DATA_DIR, 'competitors.json');

// Monitoring categories
const MONITOR_CATEGORIES = {
  pricing: {
    name: 'Pricing',
    checkFrequency: 'weekly',
    alertSensitivity: 'high',
    metrics: ['base_price', 'discount_frequency', 'bundle_offers', 'payment_plans']
  },
  products: {
    name: 'Products & Services',
    checkFrequency: 'daily',
    alertSensitivity: 'high',
    metrics: ['new_launches', 'updates', 'discontinuations', 'feature_changes']
  },
  marketing: {
    name: 'Marketing',
    checkFrequency: 'daily',
    alertSensitivity: 'medium',
    metrics: ['ad_spend', 'channels', 'messaging', 'campaigns']
  },
  content: {
    name: 'Content',
    checkFrequency: 'daily',
    alertSensitivity: 'low',
    metrics: ['blog_posts', 'videos', 'social_posts', 'podcasts']
  },
  social: {
    name: 'Social Media',
    checkFrequency: 'hourly',
    alertSensitivity: 'medium',
    metrics: ['followers', 'engagement', 'sentiment', 'frequency']
  },
  reviews: {
    name: 'Reviews & Reputation',
    checkFrequency: 'daily',
    alertSensitivity: 'high',
    metrics: ['rating', 'review_count', 'sentiment', 'common_complaints']
  }
};

// Analysis frameworks
const ANALYSIS_FRAMEWORKS = {
  swot: {
    name: 'SWOT Analysis',
    dimensions: ['strengths', 'weaknesses', 'opportunities', 'threats']
  },
  porters: {
    name: "Porter's Five Forces",
    dimensions: ['rivalry', 'newEntrants', 'substitutes', 'buyerPower', 'supplierPower']
  },
  positioning: {
    name: 'Market Positioning',
    dimensions: ['price', 'quality', 'features', 'service', 'brand']
  }
};

// Data storage
let competitorData = {
  competitors: {},
  analyses: [],
  comparisons: [],
  alerts: [],
  lastUpdated: null
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(COMPETITORS_FILE, 'utf8');
    competitorData = JSON.parse(data);
  } catch {
    competitorData = { competitors: {}, analyses: [], comparisons: [], alerts: [], lastUpdated: null };
  }
}

/**
 * Save data
 */
async function saveData() {
  competitorData.lastUpdated = new Date().toISOString();
  await fs.writeFile(COMPETITORS_FILE, JSON.stringify(competitorData, null, 2));
}

/**
 * Add competitor to tracking
 */
async function addCompetitor(name, config = {}) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  const competitor = {
    id,
    name,
    url: config.url || null,
    industry: config.industry || 'digital-products',
    addedAt: new Date().toISOString(),
    status: 'active',
    monitoring: {
      enabled: true,
      categories: Object.keys(MONITOR_CATEGORIES),
      lastChecked: null
    },
    profile: {
      description: config.description || null,
      founded: config.founded || null,
      size: config.size || 'unknown',
      funding: config.funding || 'unknown',
      headquarters: config.headquarters || null
    },
    products: [],
    pricing: [],
    socials: config.socials || {},
    metrics: {
      traffic: null,
      socialFollowers: {},
      reviews: { average: null, count: 0 }
    },
    history: []
  };
  
  competitorData.competitors[id] = competitor;
  await saveData();
  
  return competitor;
}

/**
 * Update competitor data
 */
async function updateCompetitor(id, updates) {
  const competitor = competitorData.competitors[id];
  if (!competitor) {
    throw new Error(`Competitor not found: ${id}`);
  }
  
  // Store history
  competitor.history.push({
    timestamp: new Date().toISOString(),
    changes: Object.keys(updates)
  });
  
  // Apply updates
  Object.assign(competitor, updates);
  competitor.monitoring.lastChecked = new Date().toISOString();
  
  await saveData();
  return competitor;
}

/**
 * Analyze competitor
 */
async function analyzeCompetitor(id) {
  const competitor = competitorData.competitors[id];
  if (!competitor) {
    throw new Error(`Competitor not found: ${id}`);
  }
  
  // Generate SWOT analysis
  const swot = generateSWOT(competitor);
  
  // Calculate threat level
  const threatLevel = calculateThreatLevel(competitor);
  
  // Identify competitive advantages
  const advantages = identifyAdvantages(competitor);
  
  // Find vulnerabilities
  const vulnerabilities = findVulnerabilities(competitor);
  
  const analysis = {
    id: `analysis-${Date.now()}`,
    competitorId: id,
    competitorName: competitor.name,
    timestamp: new Date().toISOString(),
    swot,
    threatLevel,
    advantages,
    vulnerabilities,
    recommendations: generateRecommendations(competitor, swot, threatLevel)
  };
  
  competitorData.analyses.push(analysis);
  await saveData();
  
  return analysis;
}

/**
 * Generate SWOT analysis
 */
function generateSWOT(competitor) {
  const swot = {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: []
  };
  
  // Evaluate based on available data
  if (competitor.metrics.traffic > 100000) {
    swot.strengths.push({ factor: 'High traffic', impact: 'high', detail: 'Established audience' });
  } else {
    swot.weaknesses.push({ factor: 'Limited reach', impact: 'medium', detail: 'Growth opportunity for us' });
  }
  
  if (competitor.products.length > 5) {
    swot.strengths.push({ factor: 'Product breadth', impact: 'medium', detail: 'Diverse offering' });
  }
  
  if (competitor.pricing.length > 0) {
    const avgPrice = competitor.pricing.reduce((a, b) => a + (b.price || 0), 0) / competitor.pricing.length;
    if (avgPrice > 500) {
      swot.opportunities.push({ factor: 'Premium pricing', impact: 'high', detail: 'Room for value positioning' });
    }
  }
  
  // Add standard analysis points
  swot.strengths.push({ factor: 'Brand recognition', impact: 'medium', detail: 'Established market presence' });
  swot.weaknesses.push({ factor: 'Potential complacency', impact: 'low', detail: 'May be slow to innovate' });
  swot.opportunities.push({ factor: 'Market expansion', impact: 'medium', detail: 'Untapped segments' });
  swot.threats.push({ factor: 'New entrants', impact: 'medium', detail: 'We represent this threat' });
  
  return swot;
}

/**
 * Calculate threat level (0-100)
 */
function calculateThreatLevel(competitor) {
  let score = 50; // Base score
  
  // Traffic impact
  if (competitor.metrics.traffic > 500000) score += 20;
  else if (competitor.metrics.traffic > 100000) score += 10;
  else if (competitor.metrics.traffic < 10000) score -= 10;
  
  // Product count
  score += Math.min(competitor.products.length * 2, 15);
  
  // Social presence
  const totalFollowers = Object.values(competitor.metrics.socialFollowers || {})
    .reduce((a, b) => a + (b || 0), 0);
  if (totalFollowers > 100000) score += 15;
  else if (totalFollowers > 10000) score += 5;
  
  // Review score
  if (competitor.metrics.reviews.average >= 4.5) score += 10;
  else if (competitor.metrics.reviews.average < 3.5) score -= 10;
  
  return {
    score: Math.max(0, Math.min(100, score)),
    level: score >= 75 ? 'critical' : score >= 50 ? 'moderate' : 'low',
    factors: [
      `Traffic: ${competitor.metrics.traffic || 'unknown'}`,
      `Products: ${competitor.products.length}`,
      `Social reach: ${totalFollowers}`,
      `Review rating: ${competitor.metrics.reviews.average || 'N/A'}`
    ]
  };
}

/**
 * Identify competitive advantages
 */
function identifyAdvantages(competitor) {
  const advantages = [];
  
  advantages.push({
    area: 'Market position',
    advantage: 'Established brand',
    ourCounter: 'Agility and innovation',
    priority: 'high'
  });
  
  if (competitor.products.length > 3) {
    advantages.push({
      area: 'Product range',
      advantage: 'Comprehensive offering',
      ourCounter: 'Focused excellence',
      priority: 'medium'
    });
  }
  
  advantages.push({
    area: 'Customer base',
    advantage: 'Existing customers',
    ourCounter: 'Target dissatisfied customers',
    priority: 'high'
  });
  
  return advantages;
}

/**
 * Find vulnerabilities
 */
function findVulnerabilities(competitor) {
  const vulnerabilities = [];
  
  vulnerabilities.push({
    area: 'Pricing',
    vulnerability: 'Premium pricing may exclude segments',
    exploitStrategy: 'Offer competitive entry-level options',
    confidence: 0.8
  });
  
  vulnerabilities.push({
    area: 'Support',
    vulnerability: 'Large scale may mean slower support',
    exploitStrategy: 'Emphasize personal, rapid support',
    confidence: 0.7
  });
  
  vulnerabilities.push({
    area: 'Innovation',
    vulnerability: 'Established players often iterate slowly',
    exploitStrategy: 'Move fast with new features',
    confidence: 0.75
  });
  
  return vulnerabilities;
}

/**
 * Generate strategic recommendations
 */
function generateRecommendations(competitor, swot, threatLevel) {
  const recs = [];
  
  // Based on threat level
  if (threatLevel.level === 'critical') {
    recs.push({
      priority: 1,
      type: 'differentiation',
      action: 'Develop clear differentiation strategy',
      reasoning: `${competitor.name} poses significant competitive threat`
    });
  }
  
  // Based on weaknesses found
  for (const weakness of swot.weaknesses.slice(0, 2)) {
    recs.push({
      priority: 2,
      type: 'exploit',
      action: `Capitalize on: ${weakness.factor}`,
      reasoning: weakness.detail
    });
  }
  
  // Based on opportunities
  for (const opp of swot.opportunities.slice(0, 2)) {
    recs.push({
      priority: 3,
      type: 'opportunity',
      action: `Pursue: ${opp.factor}`,
      reasoning: opp.detail
    });
  }
  
  return recs;
}

/**
 * Compare multiple competitors
 */
async function compareCompetitors(ids) {
  const competitors = ids.map(id => competitorData.competitors[id]).filter(Boolean);
  
  if (competitors.length < 2) {
    throw new Error('Need at least 2 competitors to compare');
  }
  
  const comparison = {
    id: `comparison-${Date.now()}`,
    competitors: competitors.map(c => c.name),
    timestamp: new Date().toISOString(),
    dimensions: {}
  };
  
  // Compare on key dimensions
  const dimensions = ['products', 'pricing', 'traffic', 'social', 'reviews'];
  
  for (const dim of dimensions) {
    comparison.dimensions[dim] = {};
    for (const competitor of competitors) {
      comparison.dimensions[dim][competitor.id] = getDimensionScore(competitor, dim);
    }
  }
  
  // Calculate overall rankings
  comparison.rankings = calculateRankings(competitors, comparison.dimensions);
  
  // Identify gaps
  comparison.gaps = identifyCompetitiveGaps(competitors);
  
  competitorData.comparisons.push(comparison);
  await saveData();
  
  return comparison;
}

/**
 * Get dimension score for comparison
 */
function getDimensionScore(competitor, dimension) {
  switch (dimension) {
    case 'products':
      return { count: competitor.products.length, score: Math.min(competitor.products.length * 10, 100) };
    case 'pricing':
      const avgPrice = competitor.pricing.length > 0 
        ? competitor.pricing.reduce((a, b) => a + (b.price || 0), 0) / competitor.pricing.length
        : 0;
      return { avgPrice, score: Math.min(avgPrice / 10, 100) };
    case 'traffic':
      return { monthly: competitor.metrics.traffic, score: Math.min((competitor.metrics.traffic || 0) / 10000, 100) };
    case 'social':
      const total = Object.values(competitor.metrics.socialFollowers || {}).reduce((a, b) => a + b, 0);
      return { followers: total, score: Math.min(total / 10000, 100) };
    case 'reviews':
      return { 
        rating: competitor.metrics.reviews.average, 
        count: competitor.metrics.reviews.count,
        score: (competitor.metrics.reviews.average || 0) * 20 
      };
    default:
      return { score: 50 };
  }
}

/**
 * Calculate overall rankings
 */
function calculateRankings(competitors, dimensions) {
  const totalScores = {};
  
  for (const competitor of competitors) {
    totalScores[competitor.id] = {
      name: competitor.name,
      scores: {},
      total: 0
    };
    
    for (const [dim, data] of Object.entries(dimensions)) {
      const score = data[competitor.id]?.score || 0;
      totalScores[competitor.id].scores[dim] = score;
      totalScores[competitor.id].total += score;
    }
  }
  
  // Sort by total score
  return Object.values(totalScores).sort((a, b) => b.total - a.total);
}

/**
 * Identify competitive gaps
 */
function identifyCompetitiveGaps(competitors) {
  const gaps = [];
  
  // Price gaps
  const prices = competitors.map(c => ({
    name: c.name,
    avgPrice: c.pricing.length > 0 
      ? c.pricing.reduce((a, b) => a + (b.price || 0), 0) / c.pricing.length
      : null
  })).filter(p => p.avgPrice);
  
  if (prices.length >= 2) {
    const minPrice = Math.min(...prices.map(p => p.avgPrice));
    const maxPrice = Math.max(...prices.map(p => p.avgPrice));
    if (maxPrice - minPrice > 100) {
      gaps.push({
        type: 'pricing',
        description: `Price range spans $${minPrice} to $${maxPrice}`,
        opportunity: 'Position in underserved price segment'
      });
    }
  }
  
  // Feature gaps (simplified)
  gaps.push({
    type: 'features',
    description: 'Identify features offered by some but not all',
    opportunity: 'Offer comprehensive feature set'
  });
  
  return gaps;
}

/**
 * Get pricing intelligence
 */
async function getPricingIntel(id) {
  const competitor = competitorData.competitors[id];
  if (!competitor) {
    throw new Error(`Competitor not found: ${id}`);
  }
  
  return {
    competitor: competitor.name,
    products: competitor.pricing,
    analysis: {
      avgPrice: competitor.pricing.length > 0
        ? competitor.pricing.reduce((a, b) => a + (b.price || 0), 0) / competitor.pricing.length
        : null,
      priceRange: competitor.pricing.length > 0
        ? {
            min: Math.min(...competitor.pricing.map(p => p.price || 0)),
            max: Math.max(...competitor.pricing.map(p => p.price || 0))
          }
        : null,
      hasPaymentPlans: competitor.pricing.some(p => p.paymentPlan),
      hasBundles: competitor.pricing.some(p => p.bundle),
      discountFrequency: 'occasional'
    },
    recommendations: [
      'Price 10-15% below for value positioning',
      'Match features at lower price point',
      'Offer payment plans if they don\'t'
    ]
  };
}

/**
 * Add product to competitor
 */
async function addCompetitorProduct(competitorId, product) {
  const competitor = competitorData.competitors[competitorId];
  if (!competitor) {
    throw new Error(`Competitor not found: ${competitorId}`);
  }
  
  const productData = {
    id: `prod-${Date.now()}`,
    name: product.name,
    type: product.type || 'digital',
    price: product.price,
    url: product.url,
    addedAt: new Date().toISOString(),
    paymentPlan: product.paymentPlan || false,
    bundle: product.bundle || false
  };
  
  competitor.products.push(productData);
  competitor.pricing.push(productData);
  
  // Generate alert
  competitorData.alerts.push({
    id: `alert-${Date.now()}`,
    type: 'new_product',
    competitorId,
    competitorName: competitor.name,
    message: `New product: ${product.name} at $${product.price}`,
    severity: 'high',
    timestamp: new Date().toISOString(),
    acknowledged: false
  });
  
  await saveData();
  return productData;
}

/**
 * List competitors
 */
function listCompetitors() {
  return Object.values(competitorData.competitors).map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    products: c.products.length,
    lastChecked: c.monitoring.lastChecked
  }));
}

/**
 * Get recent alerts
 */
function getAlerts(options = {}) {
  let alerts = competitorData.alerts;
  
  if (!options.includeAcknowledged) {
    alerts = alerts.filter(a => !a.acknowledged);
  }
  
  if (options.severity) {
    alerts = alerts.filter(a => a.severity === options.severity);
  }
  
  return alerts.slice(-20).reverse();
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'add': {
        const name = args[0];
        const url = args[1];
        
        if (!name) {
          console.error('Usage: add <competitorName> [url]');
          process.exit(1);
        }
        
        const competitor = await addCompetitor(name, { url });
        console.log(`Added competitor: ${competitor.name}`);
        console.log(`ID: ${competitor.id}`);
        console.log(`Monitoring: ${competitor.monitoring.categories.length} categories`);
        break;
      }
      
      case 'analyze': {
        const id = args[0];
        
        if (!id) {
          console.error('Usage: analyze <competitorId>');
          console.log('Competitors:', listCompetitors().map(c => c.id).join(', '));
          process.exit(1);
        }
        
        const analysis = await analyzeCompetitor(id);
        
        console.log('\nCompetitor Analysis');
        console.log('='.repeat(50));
        console.log(`Competitor: ${analysis.competitorName}`);
        console.log(`Threat Level: ${analysis.threatLevel.score}/100 (${analysis.threatLevel.level})`);
        
        console.log('\nSWOT Analysis:');
        console.log('  Strengths:');
        for (const s of analysis.swot.strengths) {
          console.log(`    • ${s.factor} [${s.impact}]`);
        }
        console.log('  Weaknesses:');
        for (const w of analysis.swot.weaknesses) {
          console.log(`    • ${w.factor} [${w.impact}]`);
        }
        console.log('  Opportunities:');
        for (const o of analysis.swot.opportunities) {
          console.log(`    • ${o.factor} [${o.impact}]`);
        }
        console.log('  Threats:');
        for (const t of analysis.swot.threats) {
          console.log(`    • ${t.factor} [${t.impact}]`);
        }
        
        console.log('\nRecommendations:');
        for (const rec of analysis.recommendations) {
          console.log(`  ${rec.priority}. [${rec.type}] ${rec.action}`);
        }
        break;
      }
      
      case 'compare': {
        if (args.length < 2) {
          console.error('Usage: compare <competitor1> <competitor2> [more...]');
          process.exit(1);
        }
        
        const comparison = await compareCompetitors(args);
        
        console.log('\nCompetitor Comparison');
        console.log('='.repeat(50));
        console.log(`Comparing: ${comparison.competitors.join(' vs ')}`);
        
        console.log('\nRankings:');
        for (let i = 0; i < comparison.rankings.length; i++) {
          const r = comparison.rankings[i];
          console.log(`  ${i + 1}. ${r.name} - Total: ${r.total.toFixed(0)}`);
        }
        
        if (comparison.gaps.length > 0) {
          console.log('\nCompetitive Gaps:');
          for (const gap of comparison.gaps) {
            console.log(`  [${gap.type}] ${gap.description}`);
            console.log(`    → ${gap.opportunity}`);
          }
        }
        break;
      }
      
      case 'pricing': {
        const id = args[0];
        
        if (!id) {
          console.error('Usage: pricing <competitorId>');
          process.exit(1);
        }
        
        const intel = await getPricingIntel(id);
        
        console.log('\nPricing Intelligence');
        console.log('='.repeat(50));
        console.log(`Competitor: ${intel.competitor}`);
        console.log(`Products tracked: ${intel.products.length}`);
        
        if (intel.analysis.avgPrice) {
          console.log(`Average price: $${intel.analysis.avgPrice.toFixed(2)}`);
          console.log(`Price range: $${intel.analysis.priceRange.min} - $${intel.analysis.priceRange.max}`);
        }
        
        console.log(`Payment plans: ${intel.analysis.hasPaymentPlans ? 'Yes' : 'No'}`);
        console.log(`Bundles: ${intel.analysis.hasBundles ? 'Yes' : 'No'}`);
        
        console.log('\nRecommendations:');
        for (const rec of intel.recommendations) {
          console.log(`  • ${rec}`);
        }
        break;
      }
      
      case 'product': {
        const competitorId = args[0];
        const name = args[1];
        const price = parseFloat(args[2]);
        
        if (!competitorId || !name || isNaN(price)) {
          console.error('Usage: product <competitorId> <productName> <price>');
          process.exit(1);
        }
        
        const product = await addCompetitorProduct(competitorId, { name, price });
        console.log(`Added product: ${product.name} at $${product.price}`);
        break;
      }
      
      case 'list': {
        const competitors = listCompetitors();
        
        console.log('Tracked Competitors');
        console.log('='.repeat(50));
        
        if (competitors.length === 0) {
          console.log('No competitors tracked. Use "add" to add one.');
        } else {
          for (const c of competitors) {
            console.log(`  ${c.id.padEnd(25)} ${String(c.products).padStart(2)} products  [${c.status}]`);
          }
        }
        break;
      }
      
      case 'alerts': {
        const alerts = getAlerts({ includeAcknowledged: args.includes('--all') });
        
        console.log('Recent Alerts');
        console.log('='.repeat(50));
        
        if (alerts.length === 0) {
          console.log('No alerts');
        } else {
          for (const alert of alerts) {
            const date = alert.timestamp.split('T')[0];
            console.log(`  [${alert.severity}] ${date} - ${alert.competitorName}`);
            console.log(`    ${alert.message}`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('Competitor Watch Module');
        console.log('=======================');
        console.log(`Competitors tracked: ${Object.keys(competitorData.competitors).length}`);
        console.log(`Analyses performed: ${competitorData.analyses.length}`);
        console.log(`Comparisons made: ${competitorData.comparisons.length}`);
        console.log(`Active alerts: ${competitorData.alerts.filter(a => !a.acknowledged).length}`);
        console.log(`Monitor categories: ${Object.keys(MONITOR_CATEGORIES).length}`);
        break;
      }
      
      default:
        console.log('Competitor Watch - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  addCompetitor,
  updateCompetitor,
  analyzeCompetitor,
  compareCompetitors,
  getPricingIntel,
  addCompetitorProduct,
  listCompetitors,
  getAlerts,
  MONITOR_CATEGORIES,
  ANALYSIS_FRAMEWORKS
};

// Run CLI
main().catch(console.error);
