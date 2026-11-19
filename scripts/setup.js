const fs = require('node:fs/promises');
const path = require('node:path');

if (require.main === module) {
  (async () => {
    const { setup } = await import('./setup-api.mjs');
    process.loadEnvFile(path.resolve(__dirname, '../.env'));
    const result = await setup({ token: process.env.HUBSPOT_PRIVATE_APP_TOKEN, accountId: process.env.HUBSPOT_ACCOUNT_ID });
    const envPath = path.resolve(__dirname, '../.env');
    const env = await fs.readFile(envPath, 'utf8');
    const replacement = `CUSTOM_OBJECT_TYPE=${result.objectTypeId}`;
    await fs.writeFile(envPath, /^CUSTOM_OBJECT_TYPE=.*$/m.test(env) ? env.replace(/^CUSTOM_OBJECT_TYPE=.*$/m, replacement) : `${env.trimEnd()}\n${replacement}\n`, { mode: 0o600 });
    await fs.writeFile(path.resolve(__dirname, '../setup-result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

