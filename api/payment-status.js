const { paysiRequest, sendJson } = require('./_paysi');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { message: 'Método não permitido.' });
  }

  const paymentId = String(request.query?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return sendJson(response, 400, { message: 'Pagamento inválido.' });

  try {
    const result = await paysiRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (!result.ok) return sendJson(response, result.status, { message: result.data.message || 'Pagamento não encontrado.' });
    return sendJson(response, 200, { status: result.data.status, expiresAt: result.data.expiresAt });
  } catch (_) {
    return sendJson(response, 503, { message: 'Não foi possível consultar o pagamento.' });
  }
};
