// Creates a Stripe Checkout Session in "setup" mode: this saves the
// buyer's card on file WITHOUT charging it. Actual charging happens later,
// once the group order closes, using the saved payment method.
//
// Required environment variable (set in Vercel project settings):
//   STRIPE_SECRET_KEY   — your Stripe secret key (sk_live_... or sk_test_...)

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(500).json({ error: 'Stripe is not configured on this deployment.' });
    return;
  }
  const stripe = Stripe(stripeKey);

  try {
    const { orderId, email, name, organization, event } = req.body || {};
    if (!orderId || !email) {
      res.status(400).json({ error: 'Missing orderId or email' });
      return;
    }

    const origin = `https://${req.headers.host}`;

    // Find or create a Stripe Customer for this email so the saved card
    // is attached to a customer record we can charge later.
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data.length
      ? existing.data[0]
      : await stripe.customers.create({ email, name });

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customer.id,
      payment_method_types: ['card'],
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: {
        orderId: orderId,
        organization: organization || '',
        event: event || '',
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create Stripe session' });
  }
};
