// Quick verify
const urls = [
  'https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/',
  'https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/sw.js',
];

async function check() {
  for (const url of urls) {
    console.log(`\n${url}`);
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const text = await res.text();
      console.log(`  Status: ${res.status} ${res.statusText}`);
      res.headers.forEach((v, k) => {
        if (k.includes('cache') || k.includes('location') || k.includes('vercel'))
          console.log(`  ${k}: ${v}`);
      });
      if (url.endsWith('sw.js')) {
        console.log(`  Has brwazwneon-production-v1: ${text.includes('brwazwneon-production-v1')}`);
      } else {
        const buildIdMatch = text.match(/data-build-id="([^"]+)"/);
        console.log(`  data-build-id: ${buildIdMatch ? buildIdMatch[1] : 'NOT FOUND in 302 body'}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}

check();
