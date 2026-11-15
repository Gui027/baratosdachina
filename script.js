const dialog = document.querySelector('#lead-dialog');
const selectedKit = document.querySelector('#selected-kit');
const kitInput = document.querySelector('#kit-input');
const form = document.querySelector('#lead-form');
const pixResult = dialog.querySelector('.pix-result');
const cardResult = dialog.querySelector('.card-result');
const formError = dialog.querySelector('.form-error');
const submitButton = dialog.querySelector('.submit-payment');
let currentStep = 1;
let statusTimer;

const onlyDigits = (value) => value.replace(/\D/g, '');

function newCheckoutId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showStep(step) {
  currentStep = step;
  dialog.querySelectorAll('.checkout-panel').forEach((panel) => {
    const active = Number(panel.dataset.step) === step;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  dialog.querySelectorAll('[data-step-indicator]').forEach((indicator) => {
    const number = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('active', number === step);
    indicator.classList.toggle('complete', number < step);
    if (number === step) indicator.setAttribute('aria-current', 'step');
    else indicator.removeAttribute('aria-current');
  });
  formError.hidden = true;
  dialog.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
  const panel = dialog.querySelector(`[data-step="${step}"]`);
  const fields = [...panel.querySelectorAll('input, select')].filter((field) => !field.disabled);
  let valid = true;
  fields.forEach((field) => {
    const fieldValid = field.checkValidity();
    field.classList.toggle('invalid', !fieldValid);
    if (!fieldValid && valid) {
      valid = false;
      field.reportValidity();
      field.focus();
    }
  });
  return valid;
}

document.querySelectorAll('.buy').forEach((button) => {
  button.addEventListener('click', () => {
    clearInterval(statusTimer);
    selectedKit.textContent = button.dataset.label;
    form.reset();
    kitInput.value = button.dataset.kit;
    form.dataset.checkoutId = newCheckoutId();
    form.hidden = false;
    pixResult.hidden = true;
    cardResult.hidden = true;
    formError.hidden = true;
    setPaymentMethod('PIX');
    showStep(1);
    dialog.showModal();
  });
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.querySelector('.finish-checkout').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => clearInterval(statusTimer));
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

form.querySelectorAll('.next-step').forEach((button) => {
  button.addEventListener('click', () => {
    if (validateStep(currentStep)) showStep(Number(button.dataset.next));
  });
});

form.querySelectorAll('.back-step').forEach((button) => {
  button.addEventListener('click', () => showStep(Number(button.dataset.back)));
});

form.addEventListener('input', (event) => event.target.classList.remove('invalid'));

const phone = form.elements.whatsapp;
phone.addEventListener('input', () => {
  const value = onlyDigits(phone.value).slice(0, 11);
  const prefixEnd = value.length === 11 ? 7 : 6;
  phone.value = value.length > 6
    ? `(${value.slice(0, 2)}) ${value.slice(2, prefixEnd)}-${value.slice(prefixEnd)}`
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
    form.elements.numero.focus();
  } catch (_) { /* Permite preenchimento manual. */ }
});

const cardNumber = form.elements.cartaoNumero;
cardNumber.addEventListener('input', () => {
  cardNumber.value = onlyDigits(cardNumber.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
});

const cardExpiry = form.elements.cartaoValidade;
cardExpiry.addEventListener('input', () => {
  const value = onlyDigits(cardExpiry.value).slice(0, 4);
  cardExpiry.value = value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
});

const cardCvv = form.elements.cartaoCvv;
cardCvv.addEventListener('input', () => { cardCvv.value = onlyDigits(cardCvv.value).slice(0, 4); });

function setPaymentMethod(method) {
  const isCard = method === 'CARD';
  dialog.querySelector('.pix-fields').hidden = isCard;
  dialog.querySelector('.card-fields').hidden = !isCard;
  dialog.querySelectorAll('.payment-option').forEach((option) => {
    option.classList.toggle('selected', option.querySelector('input').value === method);
  });
  [cardNumber, form.elements.cartaoNome, cardExpiry, cardCvv].forEach((field) => {
    field.required = isCard;
    field.disabled = !isCard;
  });
  form.elements.parcelas.disabled = !isCard;
  submitButton.textContent = isCard ? 'PAGAR COM CARTÃO' : 'GERAR PIX';
}

form.elements.metodo.forEach((radio) => radio.addEventListener('change', () => setPaymentMethod(radio.value)));

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

async function checkPayment(paymentId) {
  try {
    const response = await fetch(`api/payment-status?id=${encodeURIComponent(paymentId)}`, { cache: 'no-store' });
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
  if (!validateStep(3)) return;

  const values = Object.fromEntries(new FormData(form));
  const isCard = values.metodo === 'CARD';
  submitButton.disabled = true;
  submitButton.textContent = isCard ? 'PROCESSANDO...' : 'GERANDO PIX...';
  const expiry = onlyDigits(values.cartaoValidade || '');
  const payload = {
    kit: values.kit,
    checkoutId: form.dataset.checkoutId,
    method: values.metodo,
    termsAccepted: values.termos === 'on',
    buyer: {
      name: values.nome,
      email: values.email,
      taxId: values.cpf,
      phone: values.whatsapp,
      address: { zipCode: values.cep, street: values.rua, number: values.numero, complement: values.complemento, district: values.bairro, city: values.cidade, state: values.estado },
    },
  };
  if (isCard) {
    payload.card = {
      number: onlyDigits(values.cartaoNumero),
      holderName: values.cartaoNome,
      expiryMonth: expiry.slice(0, 2),
      expiryYear: `20${expiry.slice(2)}`,
      cvv: values.cartaoCvv,
      installments: Number(values.parcelas),
    };
  }

  try {
    const response = await fetch('api/create-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível concluir o pagamento.');
    form.hidden = true;
    if (isCard) {
      if (data.redirectUrl) window.location.assign(data.redirectUrl);
      cardResult.hidden = false;
      return;
    }
    if (!data.paymentId || !data.pixQrCode) throw new Error('A PaySi não retornou um código Pix válido.');
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
    form.hidden = false;
    showError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = isCard ? 'PAGAR COM CARTÃO' : 'GERAR PIX';
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
