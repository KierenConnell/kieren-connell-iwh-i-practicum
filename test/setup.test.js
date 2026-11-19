const { test } = require('node:test');
const assert = require('node:assert/strict');

const token = 'test-token';
const accountId = '149818516';
function response(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

test('setup refuses a token for another account before changing CRM data', async t => {
  const { setup } = await import('../scripts/setup-api.mjs');
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method });
    return response({ hubId: 999 });
  });
  await assert.rejects(setup({ token, accountId }), /different HubSpot account.*No CRM changes/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/oauth/v2/private-apps/get/access-token-info'));
});

test('re-running setup reuses the schema, samples and contact instead of duplicating them', async t => {
  const { setup, samples } = await import('../scripts/setup-api.mjs');
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    const endpoint = new URL(url).pathname;
    calls.push({ endpoint, method: options.method });
    if (endpoint.includes('access-token-info')) return response({ hubId: Number(accountId) });
    if (endpoint === '/crm/v3/schemas') return response({ results: [{ name: 'workshop_jobs_2026', objectTypeId: '2-123', associations: [{ toObjectTypeId: '0-1' }] }] });
    if (endpoint === '/crm/v3/objects/2-123') return response({ results: samples.map((properties, i) => ({ id: String(i + 1), properties })) });
    if (endpoint.endsWith('/contacts/search')) return response({ results: [{ id: '99' }] });
    if (endpoint.includes('/associations/default/contacts/99')) return response({});
    throw new Error(`Unexpected call: ${options.method} ${endpoint}`);
  });
  const result = await setup({ token, accountId });
  assert.deepEqual(result.records, ['1', '2', '3']);
  assert.equal(result.contactId, '99');
  assert.equal(calls.filter(call => call.method === 'POST' && call.endpoint === '/crm/v3/schemas').length, 0);
  assert.equal(calls.filter(call => call.method === 'POST' && /^\/crm\/v3\/objects\/(2-123|contacts)$/.test(call.endpoint)).length, 0);
});

test('setup stops before seeding an existing custom object without a contact association', async t => {
  const { setup } = await import('../scripts/setup-api.mjs');
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.includes('access-token-info')) return response({ hubId: Number(accountId) });
    return response({ results: [{ name: 'workshop_jobs_2026', objectTypeId: '2-123', associations: [] }] });
  });
  await assert.rejects(setup({ token, accountId }), /no contact association/);
  assert.equal(calls.length, 2);
});
