#!/usr/bin/env node
/**
 * Daily trash-calendar updater for bot_notes GitHub Pages site.
 * Fetches pickup dates for Peder Buchs gate 31 from RfD's API,
 * rewrites the wizard block in index.html, commits and pushes.
 * Run: node scripts/update-waste.mjs
 */
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const REPO = '/home/node/.openclaw/workspace/bot_notes';
const FILE = REPO + '/index.html';
const API_URL =
  'https://www.rfd.no/_/service/com.enonic.app.rfd/pickupDays?address=Peder%20Buchs%20gate%2031%2C%20Drammen&postCode=3014&region_id=3301&street_code=330101548&street=Peder%20Buchs%20gate&house_number=31';
const LIVE_URL =
  'https://www.rfd.no/#/adresse/hentedager/Peder%20Buchs%20gate%2031,%20Drammen/3014/3301/330101548/Peder%20Buchs%20gate/31/';

const FRACTION_NAMES = {
  1: 'Mat- og restavfall',
  3: 'Mat- og restavfall',
  2: 'Papiravfall',
  4: 'Glass- og metallemballasje',
  5: 'Glass- og metallemballasje',
  7: 'Plastemballasje',
  11: 'Plastemballasje',
};
const ORDER = ['Mat- og restavfall', 'Papiravfall', 'Plastemballasje', 'Glass- og metallemballasje'];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function osloToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const m = {};
  parts.forEach((p) => (m[p.type] = p.value));
  return new Date(Date.UTC(+m.year, +m.month - 1, +m.day));
}

function daysUntil(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, mo - 1, d));
  return Math.round((target - osloToday()) / 86400000);
}

function fmtDate(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function badge(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

async function main() {
  const json = await fetchJSON(API_URL);
  if (!json || !Array.isArray(json.fetchDays)) throw new Error('Unexpected API response: ' + JSON.stringify(json).slice(0, 200));

  const byName = {};
  for (const f of json.fetchDays) {
    const name = FRACTION_NAMES[f.fraksjonId];
    if (!name) continue;
    const upcoming = (f.tommedatoer || []).map((s) => s.slice(0, 10)).find((s) => daysUntil(s) >= 0);
    if (upcoming && (!byName[name] || upcoming < byName[name])) byName[name] = upcoming;
  }

  const names = ORDER.filter((n) => byName[n]);
  if (!names.length) throw new Error('No upcoming pickup dates found in API response');

  const items = names
    .map((name) => {
      const ds = byName[name];
      const days = daysUntil(ds);
      const badgeHtml = days >= 0 ? `\n                <span class="status-badge">${badge(days)}</span>` : '';
      return `            <div class="waste-item">\n                <h3>${name}</h3>\n                <p>${fmtDate(ds)}</p>${badgeHtml}\n            </div>`;
    })
    .join('\n');

  const stamp = osloToday().toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const block =
    `<div class="waste-grid">\n${items}\n        </div>\n` +
    `        <p style="font-size: 0.8rem; margin-top: 1.5rem; opacity: 0.8;">\n` +
    `            Updated ${stamp} · <a href="${LIVE_URL}" style="color: white;">View live on RfD.no</a>\n        </p>`;

  const html = fs.readFileSync(FILE, 'utf8');
  const re = /<!-- WIZARD:START -->[\s\S]*?<!-- WIZARD:END -->/;
  if (!re.test(html)) throw new Error('WIZARD markers not found in index.html');
  const updated = html.replace(re, `<!-- WIZARD:START -->\n${block}\n        <!-- WIZARD:END -->`);

  if (updated === html) {
    console.log('No change — page already up to date');
    return;
  }
  fs.writeFileSync(FILE, updated);
  execSync(`git -C "${REPO}" add index.html && git -C "${REPO}" commit -m "Auto-update trash calendar (${stamp}) 🗑️"`, { stdio: 'inherit' });
  execSync(`git -C "${REPO}" push`, {
    stdio: 'inherit',
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -p 443 -o StrictHostKeyChecking=no' },
  });
  console.log('Trash calendar updated and pushed ✅');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
