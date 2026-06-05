// /api/auth-callback — Google redirects here with ?code=...
// We exchange it for tokens and pass the access token back to the page in the
// URL fragment (#), which never reaches the server logs, then the page stores it.
const { OAuth2Client } = require('google-auth-library');

function redirectUri(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth-callback`;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'https://x');
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(302, { Location: '/?error=no_code' });
      return res.end();
    }
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri(req)
    );
    const { tokens } = await client.getToken(code);
    const token = tokens.access_token || '';
    // hand the token back to the SPA via the URL fragment
    res.writeHead(302, { Location: `/#token=${encodeURIComponent(token)}` });
    res.end();
  } catch (e) {
    res.writeHead(302, { Location: `/?error=${encodeURIComponent(e.message || 'auth_failed')}` });
    res.end();
  }
};
