// Backup path for linking a saved card to its order in the Google Sheet.
//
// The normal path runs in the buyer's browser: Stripe redirects them back to
// the site, which calls /api/confirm-setup. If the buyer closes the tab before
// that happens, the card is saved in Stripe but never linked to the sheet row.
// Stripe also calls this webhook directly, so the link happens either way.
//
// Writing the same values twice is harmless: the sheet update just overwrites
// the two Stripe ID cells with identical data.

/**
 * @param {object}   opts
 * @param {string}   opts.rawBody       Exact request body as sent by Stripe
 * @param {string}   opts.signature     Value of the Stripe-Signature header
 * @param {object}   opts.env           { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SHEET_WEBAPP_URL }
 * @param {Function} opts.makeStripe    (secretKey) => Stripe client
 * @param {Function} opts.fetchImpl     fetch implementation (injected for testing)
 * @returns {Promise<{status:number, body:string}>}
 */
export async function handleWebhook({ rawBody, signature, env, makeStripe, fetchImpl }) {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SHEET_WEBAPP_URL } = env;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return { status: 500, body: 'Webhook is not configured on this deployment.' };
  }

  const stripe = makeStripe(STRIPE_SECRET_KEY);

  // 1. Only trust events that Stripe actually signed.
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { status: 400, body: 'Invalid signature' };
  }

  // 2. Ignore everything except a finished card-save (setup-mode checkout).
  if (event.type !== 'checkout.session.completed') {
    return { status: 200, body: 'Ignored event type' };
  }
  const eventSession = event.data.object;
  if (eventSession.mode !== 'setup') {
    return { status: 200, body: 'Ignored: not a setup session' };
  }
  const orderId = eventSession.metadata && eventSession.metadata.orderId;
  if (!orderId) {
    return { status: 200, body: 'Ignored: no orderId on session' };
  }
  if (!SHEET_WEBAPP_URL) {
    return { status: 500, body: 'SHEET_WEBAPP_URL is not set.' };
  }

  // 3. Look up the saved card, then write the IDs onto the order's row.
  try {
    const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
      expand: ['setup_intent'],
    });
    const customerId = session.customer;
    const paymentMethodId = session.setup_intent && session.setup_intent.payment_method;

    const res = await fetchImpl(SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'attach_payment',
        orderId: orderId,
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
      }),
    });
    if (!res.ok) {
      throw new Error('Sheet responded with status ' + res.status);
    }
  } catch (err) {
    // A 500 makes Stripe retry the delivery later, which is what we want.
    console.error('Webhook could not update the sheet:', err);
    return { status: 500, body: 'Could not update the sheet' };
  }

  return { status: 200, body: 'ok' };
}
