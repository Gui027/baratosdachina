const PAYSI_BASE_URL = 'https://api.paysi.com.br/v1/public';

const KIT_OFFERS = Object.freeze({
  essencial: 'fly-trap-fedbaaa9',
  familia: 'fly-trap-e079fc96',
  pro: 'fly-trap-9652aa56',
});

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function getApiKey() {
  const key = process.env.PAYSI_API_KEY;
  if (!key) throw new Error('PAYSI_API_KEY_NOT_CONFIGURED');
  return key;
}

function getCustomerIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (candidate || request.socket?.remoteAddress || '').trim().slice(0, 64);
}

async function paysiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${PAYSI_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        Accept: 'application/json',
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { KIT_OFFERS, getCustomerIp, paysiRequest, sendJson };
