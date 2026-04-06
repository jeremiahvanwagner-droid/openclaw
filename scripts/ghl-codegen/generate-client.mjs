#!/usr/bin/env node
/**
 * GHL API Client Generator
 * Truth J Blue LLC — OpenClaw
 *
 * Reads downloaded OpenAPI specs from data/ghl-api-schemas/ and generates
 * one .mjs module per service in lib/ghl/, plus a scope manifest.
 *
 * Usage:
 *   node scripts/ghl-codegen/generate-client.mjs
 *   node scripts/ghl-codegen/generate-client.mjs --dry-run   # preview without writing
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_gc = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname_gc, '..', '..');
const SCHEMA_DIR = join(ROOT, 'data', 'ghl-api-schemas');
const OUT_DIR = join(ROOT, 'lib', 'ghl');
const SCOPE_OUT = join(ROOT, 'config', 'ghl-scopes.json');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Convert an operationId like "get-all-blog-authors-by-location"
 * to a camelCase function name like "getAllBlogAuthorsByLocation".
 */
function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

/**
 * Convert service filename "social-media-posting" to namespace "socialMediaPosting".
 */
function toNamespace(service) {
  return toCamelCase(service);
}

/**
 * Sanitize a parameter name for use as a JS identifier.
 */
function sanitizeParam(name) {
  return name.replace(/[^a-zA-Z0-9_$]/g, '_');
}

/**
 * Extract all scopes from a security array.
 * e.g. [{"bearer": ["contacts.readonly"]}] → ["contacts.readonly"]
 */
function extractScopes(security) {
  if (!security || !Array.isArray(security)) return [];
  const scopes = [];
  for (const entry of security) {
    for (const vals of Object.values(entry)) {
      if (Array.isArray(vals)) scopes.push(...vals);
    }
  }
  return [...new Set(scopes)];
}

/**
 * Determine auth type from security schemes.
 * Returns 'bearer' | 'location' | 'agency' | 'unknown'
 */
function extractAuthType(security) {
  if (!security || !Array.isArray(security) || security.length === 0) return 'bearer';
  const keys = Object.keys(security[0]);
  if (keys.includes('bearer')) return 'bearer';
  if (keys.some(k => k.startsWith('Location'))) return 'location';
  if (keys.some(k => k.startsWith('Agency'))) return 'agency';
  return 'bearer';
}

// ─── Spec Parser ────────────────────────────────────────────────

function parseSpec(service, spec) {
  const operations = [];
  const allScopes = new Set();

  for (const [pathPattern, pathItem] of Object.entries(spec.paths || {})) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
    for (const method of httpMethods) {
      const op = pathItem[method];
      if (!op) continue;

      const operationId = op.operationId;
      if (!operationId) continue;

      const fnName = toCamelCase(operationId);
      const summary = op.summary || '';
      const scopes = extractScopes(op.security);
      const authType = extractAuthType(op.security);
      scopes.forEach(s => allScopes.add(s));

      // Collect parameters by location
      const pathParams = [];
      const queryParams = [];

      for (const param of (op.parameters || [])) {
        if (param.in === 'header') continue; // Version header handled by infrastructure
        const p = {
          name: param.name,
          jsName: sanitizeParam(param.name),
          required: !!param.required,
        };
        if (param.in === 'path') pathParams.push(p);
        else if (param.in === 'query') queryParams.push(p);
      }

      // Extract implicit path params from the URL pattern (GHL specs often
      // omit them from the parameters array)
      const implicitPathParams = [...pathPattern.matchAll(/\{([^}]+)\}/g)]
        .map(m => m[1])
        .filter(name => !pathParams.some(p => p.name === name));
      for (const name of implicitPathParams) {
        pathParams.push({ name, jsName: sanitizeParam(name), required: true });
      }

      // Check for request body
      let hasBody = false;
      let bodyContentType = 'application/json';
      if (op.requestBody?.content) {
        hasBody = true;
        const contentTypes = Object.keys(op.requestBody.content);
        if (contentTypes.includes('multipart/form-data')) {
          bodyContentType = 'multipart/form-data';
        } else if (contentTypes.includes('application/x-www-form-urlencoded')) {
          bodyContentType = 'application/x-www-form-urlencoded';
        }
      }

      operations.push({
        operationId,
        fnName,
        method: method.toUpperCase(),
        path: pathPattern,
        summary,
        pathParams,
        queryParams,
        hasBody,
        bodyContentType,
        scopes,
        authType,
      });
    }
  }

  return { operations, allScopes: [...allScopes] };
}

// ─── Code Generation ────────────────────────────────────────────

function generateModule(service, operations) {
  const namespace = toNamespace(service);
  const lines = [];

  lines.push(`/**`);
  lines.push(` * GHL API — ${service} namespace`);
  lines.push(` * Auto-generated by scripts/ghl-codegen/generate-client.mjs`);
  lines.push(` * DO NOT EDIT MANUALLY — regenerate from OpenAPI specs instead.`);
  lines.push(` *`);
  lines.push(` * ${operations.length} operations`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`/** @typedef {import('../ghl-tenant-resolver.mjs')} TenantResolver */`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Create the ${service} namespace bound to a resolved tenant context.`);
  lines.push(` * @param {{ request: Function }} ctx — { request } from the client core`);
  lines.push(` * @returns {object} namespace with all ${service} operations`);
  lines.push(` */`);
  lines.push(`export function create${capitalize(namespace)}Namespace(ctx) {`);
  lines.push(`  const { request } = ctx;`);
  lines.push(`  return {`);

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const isLast = i === operations.length - 1;

    // Build function signature
    const params = buildParamList(op);
    const jsdocLines = buildJsdoc(op);

    // Add JSDoc
    for (const jl of jsdocLines) {
      lines.push(`    ${jl}`);
    }

    // Function body
    lines.push(`    async ${op.fnName}(${params}) {`);

    // Build the path string (with template literals for path params)
    const pathExpr = buildPathExpression(op);

    // Build query params object
    if (op.queryParams.length > 0) {
      // Use '_params' to avoid collisions with query param names like 'query'
      lines.push(`      const _params = {};`);
      for (const qp of op.queryParams) {
        lines.push(`      if (${qp.jsName} !== undefined) _params['${qp.name}'] = ${qp.jsName};`);
      }
    }

    // Build request options
    const requestOpts = [];
    if (op.queryParams.length > 0) requestOpts.push('query: _params');
    if (op.hasBody) {
      if (op.bodyContentType === 'multipart/form-data') {
        requestOpts.push('body, isMultipart: true');
      } else {
        requestOpts.push('body');
      }
    }

    const optsStr = requestOpts.length > 0
      ? `, { ${requestOpts.join(', ')} }`
      : '';

    lines.push(`      return request('${op.method}', ${pathExpr}${optsStr});`);
    lines.push(`    }${isLast ? '' : ','}`);
    if (!isLast) lines.push(``);
  }

  lines.push(`  };`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** Scope requirements for each operation in this namespace. */`);
  lines.push(`export const SCOPES = {`);
  for (const op of operations) {
    if (op.scopes.length > 0) {
      lines.push(`  ${op.fnName}: ${JSON.stringify(op.scopes)},`);
    }
  }
  lines.push(`};`);
  lines.push(``);

  return lines.join('\n');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildParamList(op) {
  const parts = [];
  for (const pp of op.pathParams) {
    parts.push(pp.jsName);
  }
  if (op.queryParams.length > 0) {
    // Destructure query params
    const qpNames = op.queryParams.map(qp => {
      return qp.name === qp.jsName ? qp.jsName : `${qp.jsName}`;
    });
    parts.push(`{ ${qpNames.join(', ')} } = {}`);
  }
  if (op.hasBody) {
    parts.push('body');
  }
  return parts.join(', ');
}

function buildJsdoc(op) {
  const lines = [];
  lines.push(`/**`);
  if (op.summary) lines.push(` * ${op.summary}`);
  lines.push(` * ${op.method} ${op.path}`);
  for (const pp of op.pathParams) {
    lines.push(` * @param {string} ${pp.jsName}`);
  }
  if (op.queryParams.length > 0) {
    lines.push(` * @param {object} [query]`);
    for (const qp of op.queryParams) {
      const req = qp.required ? ' (required)' : '';
      lines.push(` * @param {*} [query.${qp.jsName}]${req}`);
    }
  }
  if (op.hasBody) {
    lines.push(` * @param {object} body — request body`);
  }
  if (op.scopes.length > 0) {
    lines.push(` * @scopes ${op.scopes.join(', ')}`);
  }
  lines.push(` */`);
  return lines;
}

function buildPathExpression(op) {
  const pathStr = op.path;
  if (op.pathParams.length === 0) return `'${pathStr}'`;

  // Replace {paramName} with ${paramName}
  let expr = pathStr;
  for (const pp of op.pathParams) {
    expr = expr.replace(`{${pp.name}}`, `\${${pp.jsName}}`);
  }
  return '`' + expr + '`';
}

// ─── Scope Manifest Generation ──────────────────────────────────

function generateScopeManifest(allServiceScopes) {
  const manifest = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    version: '1.0.0',
    description: 'Auto-generated GHL API scope manifest. Maps namespace.operation to required OAuth scopes.',
    generatedAt: new Date().toISOString(),
    namespaces: {},
  };

  for (const [service, { operations }] of Object.entries(allServiceScopes)) {
    const ns = toNamespace(service);
    const opScopes = {};
    for (const op of operations) {
      if (op.scopes.length > 0) {
        opScopes[op.fnName] = op.scopes;
      }
    }
    if (Object.keys(opScopes).length > 0) {
      manifest.namespaces[ns] = opScopes;
    }
  }

  return manifest;
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  if (!existsSync(SCHEMA_DIR)) {
    console.error('Schema directory not found. Run fetch-schemas.mjs first.');
    process.exit(1);
  }

  const specFiles = readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'common-schemas.json' && f !== 'toc.json');

  if (specFiles.length === 0) {
    console.error('No spec files found. Run fetch-schemas.mjs first.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating GHL client modules from ${specFiles.length} specs...\n`);

  const allServiceScopes = {};
  let totalOps = 0;
  let totalModules = 0;

  for (const file of specFiles) {
    const service = file.replace('.json', '');
    const spec = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
    const { operations, allScopes } = parseSpec(service, spec);

    if (operations.length === 0) {
      console.log(`  ${service.padEnd(25)} ⊘ no operations (skipped)`);
      continue;
    }

    allServiceScopes[service] = { operations, allScopes };

    const code = generateModule(service, operations);
    const outPath = join(OUT_DIR, `${service}.mjs`);

    if (DRY_RUN) {
      console.log(`  ${service.padEnd(25)} → ${operations.length} ops (dry run)`);
    } else {
      writeFileSync(outPath, code);
      console.log(`  ${service.padEnd(25)} → ${operations.length} ops ✓`);
    }

    totalOps += operations.length;
    totalModules++;
  }

  // Generate scope manifest
  const scopeManifest = generateScopeManifest(allServiceScopes);
  if (!DRY_RUN) {
    writeFileSync(SCOPE_OUT, JSON.stringify(scopeManifest, null, 2));
  }

  // Generate index module
  const indexCode = generateIndex(allServiceScopes);
  const indexPath = join(OUT_DIR, 'index.mjs');
  if (!DRY_RUN) {
    writeFileSync(indexPath, indexCode);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Modules:    ${totalModules}`);
  console.log(`  Operations: ${totalOps}`);
  console.log(`  Scopes:     ${SCOPE_OUT}`);
  console.log(`  Index:      ${indexPath}`);
  if (DRY_RUN) console.log(`  (dry run — no files written)`);
}

function generateIndex(allServiceScopes) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * GHL API — namespace index`);
  lines.push(` * Auto-generated by scripts/ghl-codegen/generate-client.mjs`);
  lines.push(` * DO NOT EDIT MANUALLY`);
  lines.push(` */`);
  lines.push(``);

  const entries = Object.entries(allServiceScopes);

  for (const [service] of entries) {
    const ns = toNamespace(service);
    const cap = capitalize(ns);
    lines.push(`export { create${cap}Namespace } from './${service}.mjs';`);
  }

  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Lazy-load a namespace factory by name.`);
  lines.push(` * @param {string} name — namespace name (e.g. 'contacts', 'blogs')`);
  lines.push(` * @returns {Promise<Function>} factory function`);
  lines.push(` */`);
  lines.push(`export async function loadNamespace(name) {`);
  lines.push(`  const factories = {`);
  for (const [service] of entries) {
    const ns = toNamespace(service);
    const cap = capitalize(ns);
    lines.push(`    '${ns}': () => import('./${service}.mjs').then(m => m.create${cap}Namespace),`);
  }
  lines.push(`  };`);
  lines.push(`  const loader = factories[name];`);
  lines.push(`  if (!loader) throw new Error(\`Unknown GHL namespace: "\${name}"\`);`);
  lines.push(`  return loader();`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** All available namespace names. */`);
  lines.push(`export const NAMESPACE_NAMES = [`);
  for (const [service] of entries) {
    lines.push(`  '${toNamespace(service)}',`);
  }
  lines.push(`];`);
  lines.push(``);

  return lines.join('\n');
}

main();
