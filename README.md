# Integrating With HubSpot I: Foundations Practicum

Workshop Jobs is a Node.js application for recording small automation, integration and internal tool jobs in a HubSpot custom object.

## Developer test account

- Account: **Kieren Connell - IWH I Practicum 2026**
- Account ID: **149818516**
- Custom object: **Workshop Jobs**, ID **2-256871914**
- [Open the custom object list](https://app-eu1.hubspot.com/contacts/149818516/objects/2-256871914/views/all/list)

This account was created for the November 2026 practicum. The previous submission remains available in the repository's earlier revisions.

## Custom properties

| Label | Internal name | Type |
| --- | --- | --- |
| Name | `name` | String |
| Job type | `job_type` | Dropdown: Automation, Integration, Internal tool |
| Estimated hours | `estimated_hours` | Number |

The object is associated with Contacts. Three sample jobs are seeded by the setup script, with one linked to the fictional contact Sam Practicum at `workshop-practicum@example.com`.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env
```

Add the private app access token to **your local `.env` file only**. The example already contains the test account and custom object IDs. Then run:

```sh
npm start
```

Open **http://127.0.0.1:3000**. Use **Add to this table** to create a job. Saving redirects back to the table, where the new record is retrieved from HubSpot. All API pages are loaded, and all three custom property values are displayed.

| Method | Route | Behaviour |
| --- | --- | --- |
| GET | `/` | Retrieve records from HubSpot and render `homepage.pug` |
| GET | `/update-cobj` | Render the three-field form in `updates.pug` |
| POST | `/update-cobj` | Validate input, create a record through HubSpot's API, then redirect home |

Invalid submissions preserve entered values and display errors. Upstream failures show a useful message without exposing access tokens or request configuration. The app binds to the local loopback interface.

## Reproduce the test data

The private app is named **Kieren's Practicum Private App** and has these scopes:

- `crm.schemas.custom.read` and `crm.schemas.custom.write`
- `crm.objects.custom.read` and `crm.objects.custom.write`
- `crm.objects.contacts.read` and `crm.objects.contacts.write`

```sh
npm run setup
```

The setup script verifies that the token belongs to `HUBSPOT_ACCOUNT_ID` before making CRM changes. It creates or reuses the custom object, adds any missing sample jobs, and links the first sample to the test contact. It writes the resulting object ID to `.env`. Re-running it reuses the same sample records.

Never commit `.env`, access tokens or client secrets. `.gitignore` excludes local credentials and the setup result file.

## Validation

```sh
npm test
```

The tests exercise pagination, escaped HTML output, the form, successful creates and redirects, invalid input, and API failures using a stubbed HubSpot client. They do not change CRM data.

Verified on 19 November 2026: all six tests pass. Live API checks retrieved the three seeded jobs, rendered the form, and created a fourth record named **Practicum form verification** through the POST route. The POST returned a 303 redirect and the new job appeared in the homepage table. Re-running setup preserved the original three sample record IDs.

## References

- [HubSpot Academy practicum starter repository](https://github.com/HubSpot-Academy/integrating-with-hubspot-i-foundations-practicum)
- [Practicum instructions](https://app-eu1.hubspot.com/academy/144847478/tracks/9108788/9205576/8258346?language=EN)
- [HubSpot custom objects guide](https://developers.hubspot.com/docs/api-reference/crm-custom-objects-v3/guide)

No public deployment is required for the practicum.
