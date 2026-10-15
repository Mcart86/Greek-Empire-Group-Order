// Stripe webhook endpoint:  https://<your-site>/api/stripe-webhook
//
// Required environment variables (Vercel project settings):
//   STRIPE_SECRET_KEY      your Stripe restricted key (rk_test_... or rk_live_...)
//   STRIPE_WEBHOOK_SECRET  the signing secret (whsec_...) of THIS endpoint in
//                          Stripe. Test mode and live mode each have their own,
//                          so it must match the mode of STRIPE_SECRET_KEY.
//   SHEET_WEBAPP_URL       the Google Apps Script web app URL
//
// Uses the Web-standard handler so the request body arrives untouched, which
// Stripe's signature check requires (a re-serialized body would never verify).

import Stripe from 'stripe';
import { handleWebhook } from './_webhook-core.mjs';

export async function POST(request) {
  const rawBody = await request.text();
  const result = await handleWebhook({
    rawBody,
    signature: request.headers.get('stripe-signature'),
    env: process.env,
    makeStripe: (key) => new Stripe(key),
    fetchImpl: fetch,
  });
  return new Response(result.body, { status: result.status });
}
