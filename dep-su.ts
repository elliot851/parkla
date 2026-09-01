// ============================================================
//  session-update — kör-in: anlänt, avbryt, åka
//
//  POST { session_id, action: "anlant" | "avbryt" | "avsluta" }
//
//  anlant   → klockan börjar gå
//  avbryt   → släpper påhänget, reservationen annulleras
//  avsluta  → fångar exakt det som ska betalas, resten släpps
// ============================================================

import {
  stripe, db, anvandare, svar, fel, cors,
  rakna, korinBas_ore,
} from "./util.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const user = await anvandare(req);
  if (!user) return fel("Inte inloggad", 401, origin);

  const { session_id, action } = await req.json().catch(() => ({}));
  if (!session_id || !action) return fel("Ofullständigt anrop", 400, origin);

  const { data: sess } = await db.from("sessions")
    .select("*, listings(*)").eq("id", session_id).single();
  if (!sess) return fel("Sessionen finns inte", 404, origin);
  if (sess.driver_id !== user.id) return fel("Inte din parkering", 403, origin);

  const plats = sess.listings;
  const nu = new Date();

  // ══════════ JAG STÅR HÄR ══════════
  if (action === "anlant") {
    if (sess.state !== "pahagg") return fel("Redan påbörjad", 409, origin);
    if (new Date(sess.hall_till) < nu) {
      await slappReservation(sess, "forfallen");
      return fel("Påhänget gick ut. Börja om.", 410, origin);
    }

    // Reservationen måste vara godkänd av banken innan klockan får gå
    const pi = await stripe.paymentIntents.retrieve(sess.payment_intent_id!);
    if (pi.status !== "requires_capture") {
      return fel("Betalningen är inte klar än", 402, origin);
    }

    /* Villkoret på state är inte pynt. Utan det kan stada_paheng()
       hinna emellan, sätta raden till 'forfallen', och vi skriver
       tillbaka 'star' på en session databasen redan avskrivit.
       Resultatet vore en plats och en förare låsta för alltid. */
    const { data: uppdaterad } = await db.from("sessions")
      .update({ state: "star", startad: nu.toISOString() })
      .eq("id", sess.id).eq("state", "pahagg")
      .select("id");

    if (!uppdaterad || !uppdaterad.length) {
      await slappReservation(sess, "forfallen");
      return fel("Påhänget hann gå ut. Börja om.", 410, origin);
    }

    return svar({ state: "star", startad: nu.toISOString() }, 200, origin);
  }

  // ══════════ ÅNGRAR MIG ══════════
  if (action === "avbryt") {
    if (sess.state !== "pahagg") return fel("Parkeringen har redan börjat", 409, origin);
    /* Aldrig 'klar' — en parkering som aldrig började är inte
       genomförd. Statistik och DAC7-underlag bygger på skillnaden. */
    await slappReservation(sess, "avbruten");
    return svar({ state: "klar", debiterat_ore: 0 }, 200, origin);
  }

  // ══════════ JAG ÅKER NU ══════════
  if (action === "avsluta") {
    if (sess.state !== "star") return fel("Ingen pågående parkering", 409, origin);

    const startad = new Date(sess.startad!);
    const minuter = Math.max(1, Math.round((nu.getTime() - startad.getTime()) / 60000));

    const bas = korinBas_ore(plats.pris_timme_kr, minuter);
    const p = rakna(bas, "timme");

    // Aldrig mer än det vi reserverade — då skulle kortet nekas
    const att_fanga = Math.min(p.total_ore, sess.reserv_ore);
    const kvot = att_fanga / p.total_ore;
    const plattform = Math.round(p.plattform_ore * kvot);

    const pi = await stripe.paymentIntents.capture(sess.payment_intent_id!, {
      amount_to_capture: att_fanga,
      application_fee_amount: plattform,
    });

    // Kvitto: sessionen blir en bokning i historiken
    const { data: bokning } = await db.from("bookings").insert({
      listing_id: plats.id, driver_id: user.id, host_id: sess.host_id,
      borjar: startad.toISOString(), slutar: nu.toISOString(), lage: "korin",
      bas_ore: p.bas_ore,
      avgift_forare_ore: p.avgift_forare_ore,
      trygg_ore: p.trygg_ore,
      avgift_vard_ore: p.avgift_vard_ore,
      total_ore: att_fanga,
      utbetalning_ore: att_fanga - plattform,
      status: pi.status === "succeeded" ? "betald" : "vantar_betalning",
      payment_intent_id: pi.id,
    }).select().single();

    await db.from("sessions").update({
      state: "klar", avslutad: nu.toISOString(),
      total_ore: att_fanga, booking_id: bokning?.id ?? null,
    }).eq("id", sess.id).eq("state", "star");

    return svar({
      state: "klar",
      minuter,
      debiterat_ore: att_fanga,
      bas_ore: p.bas_ore,
      avgift_forare_ore: p.avgift_forare_ore,
      trygg_ore: p.trygg_ore,
      slappt_ore: sess.reserv_ore - att_fanga,
      takbelopp_natt: att_fanga >= sess.reserv_ore,
      booking_id: bokning?.id ?? null,
    }, 200, origin);
  }

  return fel("Okänd åtgärd", 400, origin);
});

/** Annullerar reservationen — inga pengar har någonsin lämnat kortet. */
async function slappReservation(sess: any, nytt_state: string) {
  if (sess.payment_intent_id) {
    await stripe.paymentIntents.cancel(sess.payment_intent_id).catch(() => {});
  }
  await db.from("sessions")
    .update({ state: nytt_state, avslutad: new Date().toISOString(), total_ore: 0 })
    .eq("id", sess.id).in("state", ["pahagg", "star"]);
}
