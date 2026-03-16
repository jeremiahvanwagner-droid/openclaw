#!/usr/bin/env node
/**
 * OpenClaw WooCommerce Store Manager Skill
 *
 * Division 9 — Online Store (store.truthjblue.com)
 *
 * Features:
 *   - WooCommerce product CRUD via REST API
 *   - Order management and status tracking
 *   - Coupon/discount creation and management
 *   - Inventory monitoring and low-stock alerts
 *   - Sales analytics and reporting
 *   - Category/tag taxonomy management
 *
 * Usage: node woocommerce-manager.mjs <command> [args...]
 *
 * Commands:
 *   products list [--category <slug>]   List products
 *   products create <json>              Create a product
 *   products update <id> <json>         Update a product
 *   orders list [--status <status>]     List orders
 *   orders update <id> <status>         Update order status
 *   coupons create <json>               Create a coupon/discount
 *   coupons list                        List active coupons
 *   inventory check                     Check low-stock items
 *   analytics summary [--period <days>] Revenue/order summary
 *   categories list                      List product categories
 */

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const STORE_DATA_FILE = path.join(DATA_DIR, 'woocommerce-store.json');

const WC_CONFIG = {
  siteUrl: process.env.WC_SITE_URL || 'https://store.truthjblue.com',
  consumerKey: process.env.WC_CONSUMER_KEY || '',
  consumerSecret: process.env.WC_CONSUMER_SECRET || '',
  apiVersion: 'wc/v3'
};

/**
 * Build authenticated WooCommerce API URL
 */
function wcApiUrl(endpoint) {
  const base = `${WC_CONFIG.siteUrl}/wp-json/${WC_CONFIG.apiVersion}/${endpoint}`;
  const url = new URL(base);
  url.searchParams.set('consumer_key', WC_CONFIG.consumerKey);
  url.searchParams.set('consumer_secret', WC_CONFIG.consumerSecret);
  return url.toString();
}

/**
 * Make authenticated WC API request
 */
async function wcRequest(endpoint, method = 'GET', body = null) {
  const url = wcApiUrl(endpoint);
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  const resp = await fetch(url, options);
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`WooCommerce API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

// ─── Product Management ─────────────────────────────────────

async function listProducts(category = null) {
  let endpoint = 'products?per_page=50';
  if (category) endpoint += `&category=${encodeURIComponent(category)}`;
  return wcRequest(endpoint);
}

async function createProduct(productData) {
  return wcRequest('products', 'POST', productData);
}

async function updateProduct(id, productData) {
  return wcRequest(`products/${encodeURIComponent(id)}`, 'PUT', productData);
}

// ─── Order Management ───────────────────────────────────────

async function listOrders(status = null) {
  let endpoint = 'orders?per_page=50';
  if (status) endpoint += `&status=${encodeURIComponent(status)}`;
  return wcRequest(endpoint);
}

async function updateOrderStatus(id, status) {
  return wcRequest(`orders/${encodeURIComponent(id)}`, 'PUT', { status });
}

// ─── Coupon/Discount Management ─────────────────────────────

async function createCoupon(couponData) {
  return wcRequest('coupons', 'POST', couponData);
}

async function listCoupons() {
  return wcRequest('coupons?per_page=50');
}

// ─── Inventory ──────────────────────────────────────────────

async function checkInventory() {
  const products = await wcRequest('products?per_page=100&stock_status=instock');
  const lowStock = products.filter(p =>
    p.manage_stock && p.stock_quantity !== null && p.stock_quantity <= (p.low_stock_amount || 5)
  );
  return {
    total_products: products.length,
    low_stock: lowStock.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock_quantity: p.stock_quantity,
      low_stock_amount: p.low_stock_amount || 5
    }))
  };
}

// ─── Analytics ──────────────────────────────────────────────

async function salesSummary(periodDays = 30) {
  const after = new Date(Date.now() - periodDays * 86400000).toISOString();
  const orders = await wcRequest(`orders?after=${encodeURIComponent(after)}&per_page=100&status=completed`);
  const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
  const items = orders.reduce((sum, o) => sum + o.line_items.length, 0);

  return {
    period_days: periodDays,
    total_orders: orders.length,
    total_revenue: revenue.toFixed(2),
    total_items_sold: items,
    average_order_value: orders.length > 0 ? (revenue / orders.length).toFixed(2) : '0.00',
    top_products: getTopProducts(orders)
  };
}

function getTopProducts(orders) {
  const counts = {};
  for (const order of orders) {
    for (const item of order.line_items) {
      const key = item.product_id;
      if (!counts[key]) counts[key] = { name: item.name, qty: 0, revenue: 0 };
      counts[key].qty += item.quantity;
      counts[key].revenue += parseFloat(item.total || 0);
    }
  }
  return Object.values(counts)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

// ─── Categories ─────────────────────────────────────────────

async function listCategories() {
  return wcRequest('products/categories?per_page=100');
}

// ─── CLI ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    switch (command) {
      case 'products':
        if (subcommand === 'list') {
          const cat = args.indexOf('--category') !== -1 ? args[args.indexOf('--category') + 1] : null;
          console.log(JSON.stringify(await listProducts(cat), null, 2));
        } else if (subcommand === 'create') {
          console.log(JSON.stringify(await createProduct(JSON.parse(args[2])), null, 2));
        } else if (subcommand === 'update') {
          console.log(JSON.stringify(await updateProduct(args[2], JSON.parse(args[3])), null, 2));
        }
        break;
      case 'orders':
        if (subcommand === 'list') {
          const st = args.indexOf('--status') !== -1 ? args[args.indexOf('--status') + 1] : null;
          console.log(JSON.stringify(await listOrders(st), null, 2));
        } else if (subcommand === 'update') {
          console.log(JSON.stringify(await updateOrderStatus(args[2], args[3]), null, 2));
        }
        break;
      case 'coupons':
        if (subcommand === 'create') {
          console.log(JSON.stringify(await createCoupon(JSON.parse(args[2])), null, 2));
        } else if (subcommand === 'list') {
          console.log(JSON.stringify(await listCoupons(), null, 2));
        }
        break;
      case 'inventory':
        console.log(JSON.stringify(await checkInventory(), null, 2));
        break;
      case 'analytics':
        const days = args.indexOf('--period') !== -1 ? parseInt(args[args.indexOf('--period') + 1]) : 30;
        console.log(JSON.stringify(await salesSummary(days), null, 2));
        break;
      case 'categories':
        console.log(JSON.stringify(await listCategories(), null, 2));
        break;
      default:
        console.log('Usage: node woocommerce-manager.mjs <command> [args...]');
        console.log('Commands: products, orders, coupons, inventory, analytics, categories');
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
