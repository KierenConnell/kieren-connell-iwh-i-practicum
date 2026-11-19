const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const inject = require('light-my-request');

async function withApp(client, run) {
  const app = createApp({ client, objectType: '2-12345' });
  const request = async (method, url, body) => {
    const result = await inject(app, {
      method, url, ...(body ? { payload: body, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {})
    });
    return { status: result.statusCode, headers: new Headers(result.headers), text: async () => result.payload };
  };
  await run({ get: url => request('GET', url), post: (url, body) => request('POST', url, body) });
}
function submit(base, values) {
  return base.post('/update-cobj', new URLSearchParams(values).toString());
}

test('homepage follows pagination, requests all three properties and escapes record names', async () => {
  const calls = [];
  const client = { get: async (url, config) => {
    calls.push({ url, params: config.params });
    return { data: calls.length === 1
      ? { results: [{ properties: { name: '<script>unsafe()</script>', job_type: 'Automation', estimated_hours: '2' } }], paging: { next: { after: '101' } } }
      : { results: [{ properties: { name: 'Second page job', job_type: 'Integration', estimated_hours: '6.5' } }] } };
  } };
  await withApp(client, async base => {
    const response = await base.get('/');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Second page job/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>unsafe/);
    assert.match(html, /href="\/update-cobj"/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].params.properties, 'name,job_type,estimated_hours');
    assert.equal(calls[1].params.after, '101');
  });
});

test('form renders all required fields and a return link', async () => {
  await withApp({}, async base => {
    const response = await base.get('/update-cobj');
    const html = await response.text();
    assert.equal(response.status, 200);
    for (const name of ['name', 'job_type', 'estimated_hours']) assert.ok(html.includes(`name="${name}"`));
    assert.match(html, /Return to the homepage/);
  });
});

test('valid form creates a record with whitelisted properties and redirects to the table', async () => {
  const writes = [];
  await withApp({ post: async (...args) => { writes.push(args); return { data: { id: '123' } }; } }, async base => {
    const response = await submit(base, { name: '  New job  ', job_type: 'Integration', estimated_hours: '2.5', unexpected: 'ignored' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.deepEqual(writes, [['/crm/v3/objects/2-12345', { properties: { name: 'New job', job_type: 'Integration', estimated_hours: '2.5' } }]]);
  });
});

test('bad values stay in the form and cannot make an upstream write', async () => {
  let writes = 0;
  await withApp({ post: async () => { writes++; } }, async base => {
    for (const values of [
      { name: ' ', job_type: 'Automation', estimated_hours: '2' },
      { name: 'Job', job_type: 'unknown', estimated_hours: '2' },
      { name: 'Job', job_type: 'Automation', estimated_hours: '-2' },
      { name: 'Job', job_type: 'Automation', estimated_hours: '' },
      { name: 'Job', job_type: 'Automation', estimated_hours: 'Infinity' }
    ]) {
      const response = await submit(base, values);
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"/);
    }
    assert.equal(writes, 0);
  });
});

test('read errors show a useful message without exposing upstream credentials', async () => {
  const error = Object.assign(new Error('secret request details'), { response: { status: 401, data: 'secret' } });
  await withApp({ get: async () => { throw error; } }, async base => {
    const response = await base.get('/');
    const html = await response.text();
    assert.equal(response.status, 502);
    assert.match(html, /Check your token/);
    assert.doesNotMatch(html, /secret/);
  });
});

test('a failed create preserves the form and explains how to avoid a duplicate', async () => {
  await withApp({ post: async () => { throw Object.assign(new Error('secret'), { code: 'ECONNRESET' }); } }, async base => {
    const response = await submit(base, { name: 'Keep my values', job_type: 'Automation', estimated_hours: '3' });
    const html = await response.text();
    assert.equal(response.status, 502);
    assert.match(html, /Keep my values/);
    assert.match(html, /Check the homepage before retrying/);
    assert.doesNotMatch(html, /secret/);
  });
});
