const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PAYSI_API_KEY = 'paysi_live_test';
const handler = require('../api/create-payment');

function responseRecorder() {
  return {
    statusCode: 200, headers: {},
    status(value) { this.statusCode = value; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

const validBody = {
  kit: 'essencial', checkoutId: 'f5d7c935-1aa8-4ccf-b114-0a7c7c25c409', termsAccepted: true,
  buyer: {
    name: 'Cliente Teste', email: 'cliente@example.com', taxId: '52998224725', phone: '11999999999',
    address: { zipCode: '01310100', street: 'Avenida Paulista', number: '100', complement: '', district: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  },
};

test('rejeita kit que não existe', async () => {
  const response = responseRecorder();
  await handler({ method: 'POST', body: { ...validBody, kit: 'fraude' }, headers: {}, socket: {} }, response);
  assert.equal(response.statusCode, 400);
});

test('cria Pix usando slug e preço definidos no servidor', async () => {
  const originalFetch = global.fetch;
  let sent;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => ({ payment: { chargeId: '91c80000-0000-4000-8000-000000000001', status: 'PENDING', pixQrCode: '00020126TESTE', expiresAt: '2026-11-14T20:00:00Z' } }) };
  };
  try {
    const response = responseRecorder();
    await handler({ method: 'POST', body: validBody, headers: { 'x-forwarded-for': '203.0.113.42' }, socket: {} }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(sent.offerSlug, 'fly-trap-fedbaaa9');
    assert.equal(sent.amountCents, undefined);
    assert.equal(sent.customerIp, '203.0.113.42');
    assert.equal(response.body.pixQrCode, '00020126TESTE');
  } finally {
    global.fetch = originalFetch;
  }
});
