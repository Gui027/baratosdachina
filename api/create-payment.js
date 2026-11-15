const crypto = require('node:crypto');
const { KIT_OFFERS, getCustomerIp, paysiRequest, sendJson } = require('./_paysi');

const digits = (value) => String(value || '').replace(/\D/g, '');
const text = (value, max = 200) => String(value || '').trim().slice(0, max);

function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) sum += Number(cpf[index]) * (position + 1 - index);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(cpf[position])) return false;
  }
  return true;
}

function validCardNumber(value) {
  const number = digits(value);
  if (number.length < 13 || number.length > 19 || /^(\d)\1+$/.test(number)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { message: 'Método não permitido.' });
  }

  const body = request.body || {};
  const offerSlug = KIT_OFFERS[body.kit];
  const buyer = body.buyer || {};
  const address = buyer.address || {};
  const checkoutId = text(body.checkoutId, 80);
  const method = body.method === 'CARD' ? 'CARD' : 'PIX';
  const card = body.card || {};

  if (!offerSlug) return sendJson(response, 400, { message: 'Kit inválido.' });
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(checkoutId)) return sendJson(response, 400, { message: 'Identificador do pedido inválido.' });
  if (text(buyer.name).length < 3 || !/^\S+@\S+\.\S+$/.test(text(buyer.email))) {
    return sendJson(response, 400, { message: 'Informe nome e e-mail válidos.' });
  }
  if (!validCpf(buyer.taxId)) return sendJson(response, 400, { message: 'Informe um CPF válido.' });
  if (digits(buyer.phone).length < 10 || digits(buyer.phone).length > 11) {
    return sendJson(response, 400, { message: 'Informe um WhatsApp válido.' });
  }
  if (digits(address.zipCode).length !== 8 || !text(address.street) || !text(address.number) ||
      !text(address.district) || !text(address.city) || !/^[A-Za-z]{2}$/.test(text(address.state))) {
    return sendJson(response, 400, { message: 'Preencha o endereço completo para entrega.' });
  }
  if (body.termsAccepted !== true) return sendJson(response, 400, { message: 'É necessário aceitar os termos.' });

  if (method === 'CARD') {
    const month = Number(card.expiryMonth);
    const year = Number(card.expiryYear);
    const now = new Date();
    const expirationIsValid = month >= 1 && month <= 12 && year >= now.getUTCFullYear() &&
      (year > now.getUTCFullYear() || month >= now.getUTCMonth() + 1);
    if (!validCardNumber(card.number) || text(card.holderName).length < 3 || !expirationIsValid || !/^\d{3,4}$/.test(digits(card.cvv))) {
      return sendJson(response, 400, { message: 'Confira os dados do cartao e tente novamente.' });
    }
  }

  const payload = {
    offerSlug,
    method,
    buyer: {
      name: text(buyer.name),
      email: text(buyer.email).toLowerCase(),
      personType: 'PF',
      taxId: digits(buyer.taxId),
      phone: digits(buyer.phone),
      address: {
        zipCode: digits(address.zipCode),
        street: text(address.street),
        number: text(address.number, 30),
        complement: text(address.complement),
        district: text(address.district),
        city: text(address.city),
        state: text(address.state, 2).toUpperCase(),
      },
    },
    reference: `flytrap-${body.kit}-${checkoutId}`.slice(0, 128),
    visitorKey: crypto.createHash('sha256').update(checkoutId).digest('hex'),
    customerIp: getCustomerIp(request),
    termsHash: 'flytrap-termos-v1-2026-11-14',
    termsAcceptedAt: new Date().toISOString(),
  };

  if (method === 'CARD') {
    payload.card = {
      number: digits(card.number),
      holderName: text(card.holderName, 100).toUpperCase(),
      expiryMonth: String(card.expiryMonth).padStart(2, '0'),
      expiryYear: String(card.expiryYear),
      cvv: digits(card.cvv),
      installments: Math.min(Math.max(Number(card.installments) || 1, 1), 12),
    };
  }

  try {
    const result = await paysiRequest('/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `flytrap-${body.kit}-${checkoutId}`,
      },
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      const safeMessage = result.status >= 500
        ? 'A PaySi está temporariamente indisponível. Tente novamente.'
        : result.data.message || 'Não foi possível gerar o Pix.';
      return sendJson(response, result.status, { message: safeMessage, code: result.data.code || null });
    }

    return sendJson(response, 201, {
      paymentId: result.data.payment?.chargeId,
      status: result.data.payment?.status,
      pixQrCode: result.data.payment?.pixQrCode,
      expiresAt: result.data.payment?.expiresAt,
      redirectUrl: result.data.payment?.redirectUrl || result.data.redirectUrl,
    });
  } catch (error) {
    const message = error.message === 'PAYSI_API_KEY_NOT_CONFIGURED'
      ? 'Pagamento ainda não configurado no servidor.'
      : 'Não foi possível conectar ao serviço de pagamento.';
    return sendJson(response, 503, { message });
  }
};
