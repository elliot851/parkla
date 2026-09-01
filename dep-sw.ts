// ============================================================
//  stripe-webhook — Stripe berättar vad som faktiskt hände
//
//  Detta är sanningen om pengarna. Klienten kan ljuga,
//  tappa nätet eller stänga appen mitt i — webhooken kan inte.
//
//  OBS: ingen JWT här. Verifieras med signatur istället.
//       Sätt verify_jwt = false för den här funktionen.
// ============================================================

import Stripe from "npm:stripe@17.7.0";
import { stripe, db } from "./util.ts";

const HEMLIGHET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const krypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Ingen signatur", { status: 400 });

  const kropp = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync — Deno kräver den asynkrona varianten
    event = await stripe.webhooks.constructEventAsync(
      kropp, sig, HEMLIGHET, undefined, krypto,
    );
  } catch (e) {
    console.error("Signaturen stämmer inte:", (e as Error).message);
    return new Response("Ogiltig signatur", { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Pengarna gick igenom ──
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("bookings")
          .update({ status: "betald" }).eq("payment_intent_id", pi.id);
        break;
      }

      // ── Kortet nekades ──
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("bookings")
          .update({ status: "misslyckad" }).eq("payment_intent_id", pi.id);
        await db.from("sessions")
          .update({ state: "forfallen" }).eq("payment_intent_id", pi.id);
        break;
      }

      // ── Reservationen släpptes eller bokningen avbröts ──
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("bookings")
          .update({ status: "avbruten" }).eq("payment_intent_id", pi.id);
        break;
      }

      // ── Värdens verifiering ändrades ──
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await db.from("profiles")
          .update({ utbetalning_klar: !!(acct.payouts_enabled && acct.charges_enabled) })
          .eq("stripe_account_id", acct.id);
        break;
      }

      // ── Återbetalning / tvist ──
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        if (typeof ch.payment_intent === "string") {
          await db.from("bookings")
            .update({ status: "avbruten" }).eq("payment_intent_id", ch.payment_intent);
        }
        break;
      }
    }
  } catch (e) {
    console.error("Kunde inte hantera", event.type, e);
    // 500 → Stripe försöker igen. Vi vill aldrig tappa en betalning.
    return new Response("Fel vid hantering", { status: 500 });
  }

  return new Response(JSON.stringify({ mottagen: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
