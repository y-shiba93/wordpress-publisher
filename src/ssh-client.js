import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shellQuote } from './utils.js';

const HELPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../remote/wordpress-publisher.php');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

export class SshClient {
  constructor(config) {
    this.transport = config.transport;
    this.siteUrl = config.siteUrl.replace(/\/$/, '');
    this.host = this.transport.host;
    this.wpRoot = this.transport.wordpressRoot;
    this.wpUser = String(this.transport.wpCliUser ?? 1);
    this.releaseRoot = this.transport.releaseRoot;
    this.sshArgs = ['-o', 'BatchMode=yes'];
    const sshConfig = this.transport.sshConfigEnv && process.env[this.transport.sshConfigEnv];
    if (sshConfig) this.sshArgs.push('-F', sshConfig);
  }

  ssh(command) {
    return run('ssh', [...this.sshArgs, this.host, command]);
  }

  withRelease(operation, payload, files = []) {
    const releaseId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomUUID().slice(0, 8)}`;
    const remoteDir = `${this.releaseRoot.replace(/\/$/, '')}/${releaseId}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordpress-publisher-'));
    const payloadPath = path.join(tempDir, 'payload.json');
    fs.writeFileSync(payloadPath, `${JSON.stringify({
      ...payload,
      expectedSiteUrl: this.siteUrl,
      expectedWordpressRoot: this.wpRoot,
    })}\n`, { mode: 0o600 });
    const remoteCommand = (command) => this.ssh(command);
    try {
      remoteCommand(`umask 077; mkdir -p ${shellQuote(remoteDir)}`);
      const copies = [[HELPER, 'wordpress-publisher.php'], [payloadPath, 'payload.json'], ...files];
      for (const [localPath, remoteName] of copies) {
        run('scp', [...this.sshArgs, '-q', localPath, `${this.host}:${remoteDir}/${remoteName}`]);
      }
      const command = [
        'wp', `--path=${this.wpRoot}`, `--user=${this.wpUser}`, 'eval-file',
        `${remoteDir}/wordpress-publisher.php`, operation, remoteDir,
      ].map(shellQuote).join(' ');
      const output = remoteCommand(command);
      const line = output.trim().split('\n').findLast((value) => value.startsWith('WP_PUBLISHER_JSON='));
      if (!line) throw new Error(`Remote helper returned no result: ${output.trim()}`);
      return JSON.parse(line.slice('WP_PUBLISHER_JSON='.length));
    } finally {
      try { remoteCommand(`rm -rf ${shellQuote(remoteDir)}`); } catch {}
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async fetchTerms(taxonomy) {
    return this.withRelease('taxonomy', { taxonomy }).terms;
  }

  async upsertWithMedia(payload, mediaFiles) {
    const files = mediaFiles.map((item, index) => [item.filePath, `media-${index}${path.extname(item.filePath)}`]);
    const media = mediaFiles.map((item, index) => ({
      ...item,
      filePath: `media-${index}${path.extname(item.filePath)}`,
    }));
    return this.withRelease('upsert', { ...payload, media }, files);
  }

  async getPost(endpoint, postId) {
    return this.withRelease('get-post', { endpoint, postId });
  }
}
