// Try Vercel deploy via child process with piped input
import { spawn } from 'node:child_process';

const child = spawn('npx', ['vercel', 'deploy', '--prebuilt', '--prod', '--yes'], {
  cwd: 'C:\\Users\\layaan\\Documents\\Default Project',
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
  timeout: 60000,
});

let output = '';
child.stdout.on('data', (d) => { const s = d.toString(); output += s; process.stdout.write(s); });
child.stderr.on('data', (d) => { const s = d.toString(); output += s; process.stderr.write(s); });

// If prompted for anything, just say yes
setTimeout(() => {
  try { child.stdin.write('Y\n'); } catch {}
}, 2000);
setTimeout(() => {
  try { child.stdin.write('\n'); } catch {}
}, 5000);

child.on('close', (code) => {
  console.log('\nExit code:', code);
  if (output.includes('success') || output.includes('ready')) {
    console.log('\n✓ DEPLOYMENT TRIGGERED');
  } else if (output.includes('Error') || output.includes('error') || code !== 0) {
    console.log('\n× Deployment failed');
  }
});
