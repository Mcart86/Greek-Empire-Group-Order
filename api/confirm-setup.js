// Confirms a completed Stripe "setup" Checkout Session, then writes the
// resulting Stripe customer + payment method IDs back onto the matching
// row in the Google Sheet (matched by the orderId set in step 1).
//
// Required environment variables (set in Vercel project settings):
//   STRIPE_SECRET_KEY   — your Stripe secret key
//   SHEET_WEBAPP_URL    — the same Google Apps Script Web App URL used by
//                          the front end for saving orders

const Stripe = require('stripe');

module.exports = async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const sheetUrl = process.env.SHEET_WEBAPP_URL;
  if (!stripeKey) {
    res.status(500).json({ error: 'Stripe is not configured on this deployment.' });
    return;
  }
  const stripe = Stripe(stripeKey);

  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing session_id' });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent'],
    });

    const customerId = session.customer;
    const paymentMethodId = session.setup_intent && session.setup_intent.payment_method;
    const orderId = session.metadata && session.metadata.orderId;

    if (sheetUrl && orderId) {
      // Fire-and-forget update back to the sheet; failure here shouldn't
      // block the confirmation the buyer sees.
      try {
        await fetch(sheetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'attach_payment',
            orderId: orderId,
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
          }),
        });
      } catch (sheetErr) {
        console.error('Sheet update failed:', sheetErr);
      }
    }

    res.status(200).json({ ok: true, customerId, paymentMethodId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm setup session' });
  }
};
