// /api/auth-start — redirects the user to Google's consent screen.
// Client secret is read from env vars (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
// so it is never exposed to the browser.
const { OAuth2Client } = require('google-auth-library');

function redirectUri(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth-callback`;
}

module.exports = (req, res) => {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(req)
  );
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  res.writeHead(302, { Location: url });
  res.end();
};
