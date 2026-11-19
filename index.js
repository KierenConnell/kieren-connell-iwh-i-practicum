require('dotenv').config({ quiet: true });
const express = require('express');
const axios = require('axios');
const path = require('node:path');

const JOB_TYPES = ['Automation', 'Integration', 'Internal tool'];
const PROPERTIES = ['name', 'job_type', 'estimated_hours'];

function createClient(token) {
  if (!token) throw new Error('Set HUBSPOT_PRIVATE_APP_TOKEN in your local .env file.');
  return axios.create({
    baseURL: 'https://api.hubapi.com',
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
}

function validateJob(body) {
  const values = Object.fromEntries(PROPERTIES.map(key => [key, typeof body[key] === 'string' ? body[key].trim() : '']));
  const errors = [];
  if (!values.name || values.name.length > 200) errors.push('Enter a job name between 1 and 200 characters.');
  if (!JOB_TYPES.includes(values.job_type)) errors.push('Choose a job type from the list.');
  const hours = Number(values.estimated_hours);
  if (!values.estimated_hours || !Number.isFinite(hours) || hours <= 0 || hours > 10000) {
    errors.push('Estimated hours must be a number greater than zero and no more than 10,000.');
  }
  return { values, errors };
}

function createApp({ client, objectType = process.env.CUSTOM_OBJECT_TYPE } = {}) {
  if (!objectType || !/^2-\d+$/.test(objectType)) throw new Error('Set CUSTOM_OBJECT_TYPE to the ID from npm run setup (2-...).');
  const hubspot = client || createClient(process.env.HUBSPOT_PRIVATE_APP_TOKEN);
  const endpoint = `/crm/v3/objects/${objectType}`;
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Retrieve every page so records after the first API page remain visible.
  app.get('/', async (req, res) => {
    try {
      const records = [];
      let after;
      do {
        const { data } = await hubspot.get(endpoint, {
          params: { properties: PROPERTIES.join(','), limit: 100, ...(after ? { after } : {}) }
        });
        records.push(...data.results);
        after = data.paging?.next?.after;
      } while (after);
      res.render('homepage', { title: 'Workshop Jobs', records });
    } catch (error) {
      console.error('HubSpot list request failed:', error.response?.status || error.code || 'unknown');
      res.status(502).render('error', { title: 'Unable to load jobs', message: 'HubSpot could not return the job list. Check your token, scopes and custom object ID, then try again.' });
    }
  });

  app.get('/update-cobj', (req, res) => {
    res.render('updates', { title: 'Update Custom Object Form | Integrating With HubSpot I Practicum', values: {}, errors: [], jobTypes: JOB_TYPES });
  });

  app.post('/update-cobj', async (req, res) => {
    // Prevent another website from posting to this local app with its saved token.
    const origin = req.get('origin');
    if (origin) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).origin === new URL(`${req.protocol}://${req.get('host')}`).origin;
      } catch { /* Invalid and opaque origins are rejected below. */ }
      if (!sameOrigin) {
        return res.status(403).render('error', { title: 'Unable to submit this form', message: 'Open the form from the Workshop Jobs homepage and try again.' });
      }
    }
    const { values, errors } = validateJob(req.body);
    const locals = { title: 'Update Custom Object Form | Integrating With HubSpot I Practicum', values, errors, jobTypes: JOB_TYPES };
    if (errors.length) return res.status(400).render('updates', locals);
    try {
      await hubspot.post(endpoint, { properties: values });
      res.redirect(303, '/');
    } catch (error) {
      console.error('HubSpot create request failed:', error.response?.status || error.code || 'unknown');
      res.status(502).render('updates', { ...locals, errors: ['HubSpot did not confirm the save. Check the homepage before retrying to avoid adding the same job twice.'] });
    }
  });

  return app;
}

if (require.main === module) {
  try {
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
    createApp().listen(port, '127.0.0.1', () => console.log(`Workshop Jobs is running at http://127.0.0.1:${port}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createApp, createClient, validateJob, JOB_TYPES, PROPERTIES };
