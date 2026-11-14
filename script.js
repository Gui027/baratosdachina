const dialog = document.querySelector('#lead-dialog');
const selectedKit = document.querySelector('#selected-kit');
const kitInput = document.querySelector('#kit-input');
const form = document.querySelector('#lead-form');
const pixResult = dialog.querySelector('.pix-result');
const formError = dialog.querySelector('.form-error');
const submitButton = dialog.querySelector('.submit-payment');
let statusTimer;

const onlyDigits = (value) => value.replace(/\D/g, '');

function newCheckoutId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

document.querySelectorAll('.buy').forEach((button) => {
  button.addEventListener('click', () => {
    clearInterval(statusTimer);
    selectedKit.textContent = button.dataset.label;
    kitInput.value = button.dataset.kit;
    form.dataset.checkoutId = newCheckoutId();
    form.hidden = false;
    pixResult.hidden = true;
    formError.hidden = true;
    dialog.showModal();
  });
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => clearInterval(statusTimer));
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

const phone = form.elements.whatsapp;
phone.addEventListener('input', () => {
  const value = onlyDigits(phone.value).slice(0, 11);
  phone.value = value.length > 7
    ? `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`
    : value.length > 2 ? `(${value.slice(0, 2)}) ${value.slice(2)}` : value;
});

const cpf = form.elements.cpf;
cpf.addEventListener('input', () => {
  const value = onlyDigits(cpf.value).slice(0, 11);
  cpf.value = value.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
});

const cep = form.elements.cep;
cep.addEventListener('input', () => {
  const value = onlyDigits(cep.value).slice(0, 8);
  cep.value = value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
});

cep.addEventListener('blur', async () => {
  const value = onlyDigits(cep.value);
  if (value.length !== 8) return;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
    const address = await response.json();
    if (address.erro) return;
    form.elements.rua.value ||= address.logradouro || '';
    form.elements.bairro.value ||= address.bairro || '';
    form.elements.cidade.value ||= address.localidade || '';
    form.elements.estado.value ||= address.uf || '';
  } catch (_) { /* Permite preenchimento manual. */ }
});

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

async function checkPayment(paymentId) {
  try {
    const response = await fetch(`/api/payment-status?id=${encodeURIComponent(paymentId)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const status = dialog.querySelector('.payment-status');
    if (data.status === 'PAID') {
      status.textContent = 'Pagamento confirmado! Obrigado pela compra.';
      status.classList.add('paid');
      clearInterval(statusTimer);
    } else if (['FAILED', 'EXPIRED'].includes(data.status)) {
      status.textContent = data.status === 'EXPIRED' ? 'Este Pix expirou. Gere um novo pedido.' : 'O pagamento não foi concluído.';
      clearInterval(statusTimer);
    }
  } catch (_) { /* A próxima consulta tentará novamente. */ }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'GERANDO PIX...';
  const values = Object.fromEntries(new FormData(form));
  const payload = {
    kit: values.kit,
    checkoutId: form.dataset.checkoutId,
    termsAccepted: values.termos === 'on',
    buyer: {
      name: values.nome,
      email: values.email,
      taxId: values.cpf,
      phone: values.whatsapp,
      address: { zipCode: values.cep, street: values.rua, number: values.numero, complement: values.complemento, district: values.bairro, city: values.cidade, state: values.estado },
    },
  };

  try {
    const response = await fetch('/api/create-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível gerar o Pix.');
    if (!data.paymentId || !data.pixQrCode) throw new Error('A PaySi não retornou um código Pix válido.');
    form.hidden = true;
    pixResult.hidden = false;
    document.querySelector('#pix-code').value = data.pixQrCode;
    const qrTarget = document.querySelector('#pix-qrcode');
    qrTarget.replaceChildren();
    if (window.QRCode) new QRCode(qrTarget, { text: data.pixQrCode, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    dialog.querySelector('.pix-expiration').textContent = data.expiresAt
      ? `Válido até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.expiresAt))}.` : '';
    await checkPayment(data.paymentId);
    statusTimer = setInterval(() => checkPayment(data.paymentId), 5000);
    setTimeout(() => clearInterval(statusTimer), 10 * 60 * 1000);
  } catch (error) {
    showError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'GERAR PIX';
  }
});

document.querySelector('#copy-pix').addEventListener('click', async (event) => {
  const code = document.querySelector('#pix-code').value;
  try {
    await navigator.clipboard.writeText(code);
    event.currentTarget.textContent = 'CÓDIGO COPIADO!';
  } catch (_) {
    document.querySelector('#pix-code').select();
    document.execCommand('copy');
  }
});

document.querySelectorAll('details').forEach((detail) => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    document.querySelectorAll('details').forEach((other) => { if (other !== detail) other.removeAttribute('open'); });
  });
});
