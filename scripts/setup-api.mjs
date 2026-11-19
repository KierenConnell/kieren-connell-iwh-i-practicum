const schema = {
  name: 'workshop_jobs_2026',
  labels: { singular: 'Workshop Job', plural: 'Workshop Jobs' },
  primaryDisplayProperty: 'name',
  secondaryDisplayProperties: ['job_type', 'estimated_hours'],
  requiredProperties: ['name', 'job_type', 'estimated_hours'],
  searchableProperties: ['name'],
  associatedObjects: ['CONTACT'],
  properties: [
    { name: 'name', label: 'Name', type: 'string', fieldType: 'text' },
    { name: 'job_type', label: 'Job type', type: 'enumeration', fieldType: 'select',
      options: ['Automation', 'Integration', 'Internal tool'].map((value, displayOrder) => ({ label: value, value, displayOrder })) },
    { name: 'estimated_hours', label: 'Estimated hours', type: 'number', fieldType: 'number' }
  ]
};
const samples = [
  { name: 'Invoice reminder workflow', job_type: 'Automation', estimated_hours: '3' },
  { name: 'CRM accounting connection', job_type: 'Integration', estimated_hours: '6.5' },
  { name: 'Workshop booking dashboard', job_type: 'Internal tool', estimated_hours: '5' }
];

export async function setup({ token, accountId }) {
  if (!token || !/^\d+$/.test(String(accountId))) throw new Error('Set HUBSPOT_PRIVATE_APP_TOKEN and HUBSPOT_ACCOUNT_ID first.');
  async function api(endpoint, method = 'GET', body) {
    const response = await fetch(`https://api.hubapi.com${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) {
      // Deliberately omit request config and bodies: those may contain credentials.
      throw new Error(`HubSpot ${method} ${endpoint.split('?')[0]} returned ${response.status} (${data.category || 'request failed'}).`);
    }
    return data;
  }

  // Verify the token's account before making any CRM changes.
  const tokenInfo = await api('/oauth/v2/private-apps/get/access-token-info', 'POST', { tokenKey: token });
  if (String(tokenInfo.hubId) !== String(accountId)) throw new Error('The token belongs to a different HubSpot account. No CRM changes made.');
  const available = await api('/crm/v3/schemas');
  let object = available.results.find(item => item.name === schema.name);
  if (!object) object = await api('/crm/v3/schemas', 'POST', schema);
  const objectTypeId = object.objectTypeId;
  if (!object.associations?.some(item => item.toObjectTypeId === '0-1')) {
    throw new Error('The custom object has no contact association. Check the schema before continuing.');
  }
  const records = [];
  let after;
  do {
    const data = await api(`/crm/v3/objects/${objectTypeId}?limit=100&properties=name${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    records.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);
  const sampleRecords = [];
  for (const properties of samples) {
    const existing = records.find(item => item.properties.name === properties.name);
    sampleRecords.push(existing || await api(`/crm/v3/objects/${objectTypeId}`, 'POST', { properties }));
  }
  const email = 'workshop-practicum@example.com';
  const contacts = await api('/crm/v3/objects/contacts/search', 'POST', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], limit: 1
  });
  const contact = contacts.results[0] || await api('/crm/v3/objects/contacts', 'POST', {
    properties: { email, firstname: 'Sam', lastname: 'Practicum' }
  });
  await api(`/crm/v4/objects/${objectTypeId}/${sampleRecords[0].id}/associations/default/contacts/${contact.id}`, 'PUT');
  return {
    accountId: String(accountId), objectTypeId,
    records: sampleRecords.map(item => item.id), contactId: contact.id,
    objectUrl: `https://app-eu1.hubspot.com/contacts/${accountId}/objects/${objectTypeId}/views/all/list`
  };
}

export { schema, samples };
