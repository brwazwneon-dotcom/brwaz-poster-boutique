// Try Vercel deployment API with OIDC token
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT = 'C:\\Users\\layaan\\Documents\\Default Project';
const VERIFIED_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im1yay00MzAyZWMxYjY3MGY0OGE5OGFkNjFkYWRlNGEyM2JlNyJ9.eyJpc3MiOiJodHRwczovL29pZGMudmVyY2VsLmNvbS8xNTU1Iiwic3ViIjoib3duZXI6MTU1NTpwcm9qZWN0OmJyd2F6LXBvc3Rlci1ib3V0aXF1ZTplbnZpcm9ubWVudDpkZXZlbG9wbWVudCIsInNjb3BlIjoib3duZXI6MTU1NTpwcm9qZWN0OmJyd2F6LXBvc3Rlci1ib3V0aXF1ZTplbnZpcm9ubWVudDpkZXZlbG9wbWVudCIsImF1ZCI6Imh0dHBzOi8vdmVyY2VsLmNvbS8xNTU1Iiwib3duZXIiOiIxNTU1Iiwib3duZXJfaWQiOiJ0ZWFtX0ZRa2FuNzByVnZlUXVBeThORmNuZjE2YiIsInByb2plY3QiOiJicndhei1wb3N0ZXItYm91dGlxdWUiLCJwcm9qZWN0X2lkIjoicHJqX0NjQjNYQXZiaEFxSEpIcTdiMWxKM0tvTUk1OVoiLCJlbnZpcm9ubWVudCI6ImRldmVsb3BtZW50IiwicGxhbiI6ImhvYmJ5IiwidXNlcl9pZCI6IkVFQVNXTWQ4dUNOQTlKMlRCZ3lIeHZUViIsImNsaWVudF9pZCI6ImNsX0hZeU9QQk50Rk1mSGhhVW45TDRRUGZUWno2VFA0N2JwIiwibmJmIjoxNzg0NjgyNjAzLCJpYXQiOjE3ODQ2ODI2MDMsImV4cCI6MTc4NDcyNTgwM30';

const ORG_ID = 'team_FQkan70rVveQuAy8NFcnf16b';
const PROJECT_ID = 'prj_CcB3XAvbhAqHJHq7b1lJ3KoMI59Z';

async function deployWithOIDC() {
  console.log('Checking token expiry...');
  const payload = VERIFIED_TOKEN.split('.')[1];
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const expDate = new Date(decoded.exp * 1000);
  const nbfDate = new Date(decoded.nbf * 1000);
  const now = new Date();
  console.log('  Token issued:', nbfDate.toISOString());
  console.log('  Token expires:', expDate.toISOString());
  console.log('  Current time:', now.toISOString());
  console.log('  Token valid:', now >= nbfDate && now <= expDate);

  if (now > expDate) {
    console.log('  Token is EXPIRED — cannot deploy via API.');
    console.log('  Need a fresh VERCEL_OIDC_TOKEN.');
    return;
  }

  // Read build output
  const outputDir = path.join(PROJECT, '.output');
  if (!fs.existsSync(outputDir)) {
    console.log('.output directory not found. Build first.');
    return;
  }

  // Walk .output directory and create file tree for Vercel
  console.log('Preparing deployment payload...');
  const files = {};
  const walkDir = (dir, prefix) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(full, rel);
      } else {
        const content = fs.readFileSync(full);
        files[rel] = content.toString('base64');
      }
    }
  };
  walkDir(path.join(outputDir, 'public'), '');
  walkDir(path.join(outputDir, 'server'), '');

  // Include config files
  files['config.json'] = fs.readFileSync(path.join(outputDir, 'config.json'), 'utf-8');
  
  console.log(`  Packaging ${Object.keys(files).length} files...`);

  // Create deployment
  const deployment = {
    name: 'brwaz-poster-boutique',
    project: PROJECT_ID,
    files,
    version: 2,
    public: false,
    regions: ['fra1'],
    target: 'production',
  };

  console.log('Sending deployment request...');
  try {
    const res = await fetch(
      `https://api.vercel.com/v13/deployments?teamId=${ORG_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERIFIED_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deployment),
      }
    );
    const data = await res.json();
    if (res.ok) {
      console.log('\n✓ DEPLOYMENT SUCCEEDED!');
      console.log('URL:', data.url);
      console.log('ID:', data.id);
      console.log('Ready:', data.readyState);
    } else {
      console.log('\n× Deployment failed:', res.status);
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

deployWithOIDC();
