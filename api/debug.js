// /api/debug — TEMPORARY. Visit https://YOUR-APP.vercel.app/api/debug
// Confirms whether the env vars are visible to the serverless functions.
// It shows only whether each value is PRESENT and its length — never the secret.
// DELETE this file once sign-in works.
module.exports = (req, res) => {
  const out = {
    GOOGLE_CLIENT_ID_present: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_ID_length: (process.env.GOOGLE_CLIENT_ID || '').length,
    GOOGLE_CLIENT_ID_tail: (process.env.GOOGLE_CLIENT_ID || '').slice(-20), // safe: public half
    GOOGLE_CLIENT_SECRET_present: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_CLIENT_SECRET_length: (process.env.GOOGLE_CLIENT_SECRET || '').length,
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID || null,
  };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(out, null, 2));
};
