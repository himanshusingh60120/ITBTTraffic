// /api/report — body: { token, start, end }
// Runs landingPage×date and country×date queries, builds the 3-sheet workbook,
// returns it as an .xlsx download. Mirrors the validated Colab logic exactly.
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { OAuth2Client } = require('google-auth-library');
const ExcelJS = require('exceljs');

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '362728230';
const DOMAIN = 'https://itbusinesstoday.com';
const JAPAN_COUNTRY = 'Japan';
const METRIC = 'sessions';          // change to 'totalUsers' to match a Total-users export
const URL_DIMENSION = 'landingPage';
const EXTRA_EXCLUSIONS = [];        // e.g. ['/author/']

function excelSerial(d) {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round(utc / 86400000) + 25569;
}
function dKey(d) { return d.toISOString().slice(0, 10); }
function gaDateToKey(s) { return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }

function normalize(path) {
  const low = String(path).toLowerCase();
  if (low.includes('.html')) return null;
  if (EXTRA_EXCLUSIONS.some(ex => low.includes(ex.toLowerCase()))) return null;
  let p;
  try { p = new URL(path, DOMAIN); } catch { p = { pathname: '/' }; }
  let pth = (p.pathname || '/').toLowerCase();
  if (pth.length > 1) pth = pth.replace(/\/+$/, '');
  return DOMAIN + pth;
}

async function runReport(client, start, end, dimensions, metrics) {
  const [resp] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: dimensions.map(name => ({ name })),
    metrics: metrics.map(name => ({ name })),
    limit: 250000,
  });
  return (resp.rows || []).map(r => ({
    dims: r.dimensionValues.map(d => d.value),
    val: Number(r.metricValues[0].value),
  }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
  try {
    let body = '';
    await new Promise(r => { req.on('data', c => body += c); req.on('end', r); });
    const { token, start, end } = JSON.parse(body || '{}');
    if (!token || !start || !end) { res.statusCode = 400; return res.end('Missing token/start/end'); }

    const startD = new Date(start + 'T00:00:00Z');
    const endD = new Date(end + 'T00:00:00Z');
    if (startD > endD) { res.statusCode = 400; return res.end('Start after end'); }

    const oauth = new OAuth2Client();
    oauth.setCredentials({ access_token: token });
    const client = new BetaAnalyticsDataClient({ authClient: oauth });

    // date columns newest → oldest
    const dates = [];
    for (let d = new Date(endD); d >= startD; d.setUTCDate(d.getUTCDate() - 1)) dates.push(new Date(d));
    const serials = dates.map(excelSerial);
    const dkeys = dates.map(dKey);

    // URL sheet
    const urlMap = {};
    for (const { dims, val } of await runReport(client, start, end, [URL_DIMENSION, 'date'], [METRIC])) {
      const [path, gdate] = dims;
      let nu;
      if (String(path).trim().toLowerCase() === '(not set)') nu = `${DOMAIN}/NA`;
      else { nu = normalize(path); if (nu === null) continue; }
      const k = gaDateToKey(gdate);
      (urlMap[nu] = urlMap[nu] || {})[k] = (urlMap[nu][k] || 0) + val;
    }
    const urlsSorted = Object.keys(urlMap).sort((a, b) =>
      Object.values(urlMap[b]).reduce((s, v) => s + v, 0) -
      Object.values(urlMap[a]).reduce((s, v) => s + v, 0));

    // Country sheet, (not set) → NA
    const countryMap = {};
    for (const { dims, val } of await runReport(client, start, end, ['country', 'date'], [METRIC])) {
      let [country, gdate] = dims;
      country = (country || '').trim();
      if (country === '' || country.toLowerCase() === '(not set)') country = 'NA';
      const k = gaDateToKey(gdate);
      (countryMap[country] = countryMap[country] || {})[k] = (countryMap[country][k] || 0) + val;
    }
    const countriesSorted = Object.keys(countryMap).sort((a, b) =>
      Object.values(countryMap[b]).reduce((s, v) => s + v, 0) -
      Object.values(countryMap[a]).reduce((s, v) => s + v, 0));

    const daily = row => dkeys.map(k => Math.round(row[k] || 0));
    const totalRow = dkeys.map(k => Object.keys(urlMap).reduce((s, u) => s + Math.round(urlMap[u][k] || 0), 0));
    const japanRow = daily(countryMap[JAPAN_COUNTRY] || {});

    const wb = new ExcelJS.Workbook();
    const data = wb.addWorksheet('Data');
    data.addRow(['Data', ...serials]);
    data.addRow(['Total Traffic', ...totalRow]);
    data.addRow(['Japan Traffic', ...japanRow]);
    const cw = wb.addWorksheet('Country Wise');
    cw.addRow(['Country', ...serials]);
    countriesSorted.forEach(c => cw.addRow([c, ...daily(countryMap[c])]));
    const tt = wb.addWorksheet('Total Traffic');
    tt.addRow(['Webpage', ...serials]);
    urlsSorted.forEach(u => tt.addRow([u, ...daily(urlMap[u])]));

    [data, cw, tt].forEach(sh => {
      sh.getRow(1).font = { bold: true };
      sh.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      for (let c = 2; c <= serials.length + 1; c++) sh.getColumn(c).numFmt = 'm/d/yyyy';
    });

    const buf = await wb.xlsx.writeBuffer();
    const fname = `ITBT_Traffic_Data_${start}_to_${end}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.statusCode = 200;
    res.end(Buffer.from(buf));
  } catch (e) {
    res.statusCode = 500;
    res.end('Report failed: ' + (e.message || 'unknown error'));
  }
};
