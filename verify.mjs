// Verify live deployment
const urls = [
  'https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/',
  'https://brwazwneon.com/',
];

async function verify() {
  for (const url of urls) {
    console.log(`\n=== ${url} ===`);
    try {
      const res = await fetch(url, { redirect: 'manual' });
      console.log('Status:', res.status, res.statusText);
      console.log('Cache-Control:', res.headers.get('cache-control') || '(none)');
      console.log('x-vercel-id:', res.headers.get('x-vercel-id') || '(none)');
      
      const html = await res.text();
      const buildIdMatch = html.match(/data-build-id="([^"]+)"/);
      console.log('data-build-id:', buildIdMatch ? buildIdMatch[1] : 'NOT FOUND');
      
      const swMatch = html.match(/sw\.js/);
      console.log('SW referenced:', swMatch ? 'YES' : 'NO (may be dynamic)');
      
      const hasManifest = html.includes('manifest.webmanifest');
      console.log('Manifest referenced:', hasManifest ? 'YES' : 'NO');
      
      // Check for build ID in HTML
      if (buildIdMatch) {
        console.log('\n✓ BUILD ID PRESENT in HTML');
      } else {
        console.log('\n✗ BUILD ID MISSING from HTML');
      }
    } catch (err) {
      console.log('ERROR:', err.message);
    }
  }

  // Verify SW
  console.log('\n=== Service Worker ===');
  try {
    const swRes = await fetch('https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/sw.js');
    console.log('SW Status:', swRes.status);
    const swText = await swRes.text();
    if (swText.includes('brwazwneon-production-v1')) {
      console.log('✓ SW has new cache strategy (brwazwneon-production-v1)');
    } else {
      console.log('✗ SW has OLD cache strategy');
    }
    if (swText.includes('NetworkFirst')) {
      console.log('✓ SW has NetworkFirst for HTML');
    }
    if (swText.includes('CacheFirst')) {
      console.log('✓ SW has CacheFirst for assets');
    }
    if (swText.includes('StaleWhileRevalidate')) {
      console.log('✓ SW has StaleWhileRevalidate for images');
    }
    console.log('\nSW Cache-Control:', swRes.headers.get('cache-control') || '(none)');
  } catch (err) {
    console.log('SW ERROR:', err.message);
  }

  // Verify _headers
  console.log('\n=== Static Assets ===');
  try {
    const assetRes = await fetch('https://brwaz-poster-boutique-i7yu424dt-1555.vercel.app/manifest.webmanifest');
    console.log('manifest Status:', assetRes.status);
    console.log('manifest Cache-Control:', assetRes.headers.get('cache-control') || '(none)');
  } catch (err) {
    console.log('Asset ERROR:', err.message);
  }
}

verify();
