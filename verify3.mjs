import https from 'node:https';

function fetchUrl(url, follow = true) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      rejectUnauthorized: false,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    };
    const req = https.request(opts, (res) => {
      const status = res.statusCode;
      const headers = {};
      for (const [k, v] of Object.entries(res.headers)) {
        headers[k] = Array.isArray(v) ? v.join(', ') : v;
      }
      if ((status === 301 || status === 302) && follow) {
        const loc = headers['location'];
        if (loc) {
          res.resume();
          fetchUrl(loc.startsWith('http') ? loc : `https://${u.hostname}${loc}`, false)
            .then(resolve)
            .catch(reject);
          return;
        }
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status, headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const targets = [
    { name: 'Deployment URL', url: 'https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/' },
    { name: 'brwazwneon.com', url: 'https://brwazwneon.com/' },
    { name: 'SW', url: 'https://brwazwneon.com/sw.js' },
    { name: 'Manifest', url: 'https://brwazwneon.com/manifest.webmanifest' },
  ];

  for (const t of targets) {
    console.log(`\n=== ${t.name}: ${t.url} ===`);
    try {
      const result = await fetchUrl(t.url);
      console.log(`  Status: ${result.status}`);
      for (const h of ['cache-control', 'location', 'x-vercel-id', 'x-vercel-cache', 'content-type']) {
        if (result.headers[h]) console.log(`  ${h}: ${result.headers[h]}`);
      }
      if (t.name === 'SW') {
        console.log(`  Has brwazwneon-production-v1: ${result.body.includes('brwazwneon-production-v1')}`);
        console.log(`  Has NetworkFirst: ${result.body.includes('NetworkFirst')}`);
        console.log(`  Has CacheFirst: ${result.body.includes('CacheFirst')}`);
        console.log(`  Has StaleWhileRevalidate: ${result.body.includes('StaleWhileRevalidate')}`);
      } else if (t.url.endsWith('/')) {
        const buildId = result.body.match(/data-build-id="([^"]+)"/);
        console.log(`  data-build-id: ${buildId ? buildId[1] : 'NOT FOUND'}`);
        console.log(`  Has __BRWAZ_BUILD_ID__: ${result.body.includes('__BRWAZ_BUILD_ID__')}`);
        console.log(`  Has sw.js reference: ${result.body.includes('sw.js')}`);
        console.log(`  Has manifest reference: ${result.body.includes('manifest.webmanifest')}`);
      } else if (t.name === 'Manifest') {
        console.log(`  Has start_url: ${result.body.includes('start_url')}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}

main();
