import type { FastifyInstance } from 'fastify';
import {
  exchangeOAuthCode,
  getDefaultUser,
  hasPutioAccessToken,
  pollOobCode,
  requestOobCode,
  savePutioAccessToken,
} from '@putio-stremio/db';
import {
  getEnv,
  normalizeBaseUrl,
  ValidationError,
} from '@putio-stremio/shared';

function oauthRedirectUri(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/oauth/callback`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function configureHtml(options: {
  connected: boolean;
  username?: string;
  userSlug?: string;
  baseUrl: string;
  oauthAvailable: boolean;
  oauthStartUrl?: string;
  oobStartUrl?: string;
  message?: string;
  error?: string;
}): string {
  const status = options.connected
    ? `<p class="ok">Connected${options.username ? ` as <strong>${escapeHtml(options.username)}</strong>` : ''}.</p>`
    : '<p class="warn">Not connected — add your Put.io OAuth token below.</p>';

  const feedback = options.message
    ? `<p class="ok">${escapeHtml(options.message)}</p>`
    : options.error
      ? `<p class="err">${escapeHtml(options.error)}</p>`
      : '';

  const manifestSection = options.connected
    ? `<section>
  <h2>Stremio install URLs</h2>
  <p><strong>Default:</strong> <code>${escapeHtml(`${options.baseUrl}/manifest.json`)}</code></p>
  ${
    options.userSlug
      ? `<p><strong>Per-user:</strong> <code>${escapeHtml(`${options.baseUrl}/u/${options.userSlug}/manifest.json`)}</code></p>`
      : ''
  }
</section>`
    : '';

  const oauthSection =
    options.oauthAvailable && options.oauthStartUrl
      ? `<p>Or <a href="${escapeHtml(options.oauthStartUrl)}">sign in with Put.io OAuth</a>.</p>`
      : '';

  const oobSection =
    options.oobStartUrl
      ? `<section>
  <h2>TV / out-of-band sign-in</h2>
  <p>For devices without a browser redirect:</p>
  <ol>
    <li><a href="${escapeHtml(options.oobStartUrl)}">Get a link code</a></li>
    <li>Visit <a href="https://put.io/link" target="_blank" rel="noopener">put.io/link</a> and enter the code</li>
    <li>Return to the code page and wait for confirmation</li>
  </ol>
</section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Put.io Library — Configure</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
    input[type=password] { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.5rem 1rem; }
    code { word-break: break-all; }
    section { margin-top: 2rem; }
    .ok { color: #0a7; }
    .warn { color: #a70; }
    .err { color: #c22; }
    a { color: #06c; }
  </style>
</head>
<body>
  <h1>Put.io Library</h1>
  ${status}
  ${feedback}
  <form id="configure-form">
    <label for="token">Put.io OAuth token</label>
    <input id="token" name="token" type="password" autocomplete="off" required />
    <button type="submit">Save token</button>
  </form>
  ${oauthSection}
  ${oobSection}
  ${manifestSection}
  <p><small>Create a token at <a href="https://app.put.io/oauth" target="_blank" rel="noopener">app.put.io/oauth</a>.</small></p>
  <script>
    document.getElementById('configure-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = document.getElementById('token').value;
      const response = await fetch('/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload.message || 'Failed to save token');
        return;
      }
      window.location.href = '/configure?saved=1';
    });
  </script>
</body>
</html>`;
}

function oobHtml(options: {
  code: string;
  pollUrl: string;
  linkUrl: string;
  error?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Put.io Link Code</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
    .code { font-size: 2rem; letter-spacing: 0.2rem; font-weight: 700; }
    .ok { color: #0a7; }
    .err { color: #c22; }
  </style>
</head>
<body>
  <h1>Put.io link code</h1>
  ${options.error ? `<p class="err">${escapeHtml(options.error)}</p>` : ''}
  <p class="code">${escapeHtml(options.code)}</p>
  <p>Go to <a href="${escapeHtml(options.linkUrl)}" target="_blank" rel="noopener">${escapeHtml(options.linkUrl)}</a> and enter this code.</p>
  <p id="status">Waiting for authorization…</p>
  <script>
    const pollUrl = ${JSON.stringify(options.pollUrl)};
    const timer = setInterval(async () => {
      const response = await fetch(pollUrl);
      const payload = await response.json().catch(() => ({}));
      if (payload.connected) {
        clearInterval(timer);
        document.getElementById('status').textContent = 'Connected! Redirecting…';
        document.getElementById('status').className = 'ok';
        window.location.href = '/configure?saved=1';
        return;
      }
      if (payload.error) {
        clearInterval(timer);
        document.getElementById('status').textContent = payload.error;
        document.getElementById('status').className = 'err';
      }
    }, 3000);
  </script>
</body>
</html>`;
}

export async function registerConfigureRoutes(app: FastifyInstance) {
  const env = getEnv();
  const oauthAvailable = Boolean(env.PUTIO_CLIENT_ID && env.PUTIO_CLIENT_SECRET);
  const baseUrl = normalizeBaseUrl(env.BASE_URL);

  app.get('/configure', async (request, reply) => {
    const query = request.query as { saved?: string; error?: string };
    const connected = await hasPutioAccessToken();
    const user = await getDefaultUser();
    const message =
      query.saved === '1' ? 'Token saved successfully.' : undefined;
    const error = query.error ? decodeURIComponent(query.error) : undefined;

    return reply.type('text/html').send(
      configureHtml({
        connected,
        username: user?.putioUsername ?? undefined,
        userSlug: user?.slug,
        baseUrl,
        oauthAvailable,
        oauthStartUrl: oauthAvailable ? '/oauth/start' : undefined,
        oobStartUrl: env.PUTIO_CLIENT_ID ? '/oauth/oob/start' : undefined,
        message,
        error,
      }),
    );
  });

  app.post('/configure', async (request, reply) => {
    const body = request.body as { token?: string } | undefined;
    try {
      if (!body?.token?.trim()) {
        throw new ValidationError('Token is required');
      }
      await savePutioAccessToken(body.token);
      return reply.redirect('/configure?saved=1');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save token';
      return reply.status(400).send({ error: 'CONFIGURE_FAILED', message });
    }
  });

  app.get('/oauth/start', async (_request, reply) => {
    if (!env.PUTIO_CLIENT_ID) {
      throw new ValidationError('PUTIO_CLIENT_ID is not configured');
    }

    const redirectUri = oauthRedirectUri(env.BASE_URL);
    const url = new URL('https://api.put.io/v2/oauth2/authenticate');
    url.searchParams.set('client_id', env.PUTIO_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');

    return reply.redirect(url.toString());
  });

  app.get('/oauth/callback', async (request, reply) => {
    const query = request.query as { code?: string; error?: string };
    if (query.error) {
      return reply.redirect(
        `/configure?error=${encodeURIComponent(query.error)}`,
      );
    }
    if (!query.code) {
      throw new ValidationError('Missing OAuth code');
    }

    await exchangeOAuthCode(query.code, oauthRedirectUri(env.BASE_URL));
    return reply.redirect('/configure?saved=1');
  });

  app.get('/oauth/oob/start', async (_request, reply) => {
    const code = await requestOobCode('Put.io Stremio Addon');
    return reply.type('text/html').send(
      oobHtml({
        code,
        pollUrl: `/oauth/oob/poll/${encodeURIComponent(code)}`,
        linkUrl: 'https://put.io/link',
      }),
    );
  });

  app.get('/oauth/oob/poll/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    try {
      const token = await pollOobCode(code);
      if (!token) {
        return reply.send({ connected: false });
      }

      await savePutioAccessToken(token);
      return reply.send({ connected: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'OOB poll failed';
      return reply.send({ connected: false, error: message });
    }
  });
}
