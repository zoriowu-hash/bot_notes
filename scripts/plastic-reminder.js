#!/usr/bin/env node
/**
 * Plastic-bag reminder checker for Peder Buchs gate 31.
 * Fetches pickup dates from RfD, computes days until next Plastemballasje
 * collection. Prints:
 *   NONE            -> no reminder needed today
 *   REMINDER|<text> -> reminder message to send to the user
 * Run: node scripts/plastic-reminder.js
 */
const https = require('https');

const API_URL =
  'https://www.rfd.no/_/service/com.enonic.app.rfd/pickupDays?address=Peder%20Buchs%20gate%2031%2C%20Drammen&postCode=3014&region_id=3301&street_code=330101548&street=Peder%20Buchs%20gate&house_number=31';

const PLASTIC_FRACTIONS = new Set([7, 11]); // Plastemballasje

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
  return Math.round((new Date(Date.UTC(y, mo - 1, d)) - osloToday()) / 86400000);
}

function fmtDate(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

async function main() {
  const json = await fetchJSON(API_URL);
  if (!json || !Array.isArray(json.fetchDays)) throw new Error('Unexpected API response');

  const dates = [];
  for (const f of json.fetchDays) {
    if (!PLASTIC_FRACTIONS.has(f.fraksjonId)) continue;
    for (const s of f.tommedatoer || []) {
      const ds = s.slice(0, 10);
      if (daysUntil(ds) >= 0 && !dates.includes(ds)) dates.push(ds);
    }
  }
  dates.sort();
  if (!dates.length) throw new Error('No upcoming plastic pickup dates found');

  const days = daysUntil(dates[0]);
  if (days === 2) {
    console.log(`REMINDER|🛍️ Reminder: Plastemballasje (plastic packaging) is collected in 2 days — on ${fmtDate(dates[0])}. Remember to put the plastic bags out tonight!`);
  } else if (days === 1) {
    console.log(`REMINDER|🛍️ Reminder: Plastemballasje (plastic packaging) is collected TOMORROW — on ${fmtDate(dates[0])}. Remember to put the plastic bags out tonight!`);
  } else {
    console.log('NONE');
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
