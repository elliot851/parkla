// ============================================================
//  booking-intent — bokning i förväg (timme / dag / månad)
//  POST { listing_id, borjar, slutar, lage }
//    →  { booking_id, client_secret, total_ore, ... }
// ============================================================

import {
  stripe, db, anvandare, svar, fel, cors, rakna, bokningBas_ore,
} from "./util.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const user = await anvandare(req);
  if (!user) return fel("Inte inloggad", 401, origin);

  const { listing_id, borjar, slutar, lage } = await req.json().catch(() => ({}));
  if (!listing_id || !borjar || !slutar) return fel("Ofullständig bokning", 400, origin);

  const start = new Date(borjar), slut = new Date(slutar);
  if (isNaN(+start) || isNaN(+slut) || slut <= start) return fel("Ogiltig tid", 400, origin);
  if (start.getTime() < Date.now() - 5 * 60_000) return fel("Starttiden har passerat", 400, origin);

  // ── Platsen ──
  const { data: plats } = await db.from("listings")
    .select("*").eq("id", listing_id).single();
  if (!plats) return fel("Platsen finns inte", 404, origin);
  if (plats.pausad) return fel("Platsen är pausad", 409, origin);
  if (plats.host_id === user.id) return fel("Du kan inte boka din egen plats", 400, origin);

  // ── Ledig? Räknas i databasen, inte i webbläsaren. ──
  const { data: ledig } = await db.rpc("ar_ledig", {
    p_listing: listing_id, p_borjar: start.toISOString(), p_slutar: slut.toISOString(),
  });
  if (!ledig) return fel("Platsen är upptagen den tiden", 409, origin);

  // ── Värden måste kunna få pengar ──
  const { data: vard } = await db.from("profiles")
    .select("stripe_account_id, utbetalning_klar").eq("id", plats.host_id).single();
  if (!vard?.stripe_account_id || !vard.utbetalning_klar) {
    return fel("Värden har inte kopplat utbetalning än", 409, origin);
  }

  // ── Pris: serversanning ──
  const l = lage ?? "timme";
  const bas = await bokningBas_ore(plats, start, slut, l);
  const p = rakna(bas, l);

  const godkannande = !plats.direktbokning;

  const { data: bokning, error: bfel } = await db.from("bookings").insert({
    listing_id, driver_id: user.id, host_id: plats.host_id,
    borjar: start.toISOString(), slutar: slut.toISOString(), lage: l,
    bas_ore: p.bas_ore,
    avgift_forare_ore: p.avgift_forare_ore,
    trygg_ore: p.trygg_ore,
    avgift_vard_ore: p.avgift_vard_ore,
    total_ore: p.total_ore,
    utbetalning_ore: p.utbetalning_ore,
    status: godkannande ? "vantar_godkannande" : "vantar_betalning",
  }).select().single();

  // 23P01 = exclusion_violation: dubbelboknings-spärren i databasen slog till.
  // Någon hann boka exakt samma tid mellan ar_ledig-kollen och insertningen.
  // Spärren har gjort sitt jobb (ingen dubbelbokning), vi ger bara ett rent svar.
  if (bfel) {
    if (bfel.code === "23P01") return fel("Platsen blev precis bokad av någon annan, välj en annan tid", 409, origin);
    return fel("Kunde inte skapa bokningen", 500, origin);
  }

  // Kräver godkännande → ingen betalning än
  if (godkannande) {
    return svar({ booking_id: bokning.id, godkannande: true, ...p }, 200, origin);
  }

  // ── Betalning: destination charge, avgiften stannar hos Parkla ──
  const pi = await stripe.paymentIntents.create({
    amount: p.total_ore,
    currency: "sek",
    automatic_payment_methods: { enabled: true },
    application_fee_amount: p.plattform_ore,
    transfer_data: { destination: vard.stripe_account_id },
    metadata: { booking_id: bokning.id, listing_id, driver: user.id },
    description: `Parkla · ${plats.titel}`,
  });

  await db.from("bookings").update({ payment_intent_id: pi.id }).eq("id", bokning.id);

  return svar({
    booking_id: bokning.id,
    client_secret: pi.client_secret,
    godkannande: false,
    ...p,
  }, 200, origin);
});
