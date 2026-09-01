// ============================================================
//  session-start — kör-in utan bokning
//
//  Reserverar ett takbelopp på kortet (manual capture), precis
//  som en bensinmack. Föraren legitimerar sig EN gång, i början.
//  Vid avslut fångar vi bara det som faktiskt ska betalas.
//
//  POST { listing_id, retur_url }
//    →  { session_id, client_secret, reserv_ore, hall_till }
// ============================================================

import {
  stripe, db, anvandare, svar, fel, cors,
  reservation_ore, HALL_MINUTER,
} from "./util.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const user = await anvandare(req);
  if (!user) return fel("Inte inloggad", 401, origin);

  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return fel("listing_id saknas", 400, origin);

  // ── Har föraren redan en session igång? ──
  const { data: pagaende } = await db.from("sessions")
    .select("id").eq("driver_id", user.id).in("state", ["pahagg", "star"]).maybeSingle();
  if (pagaende) return fel("Du har redan en parkering igång", 409, origin);

  // ── Platsen ──
  const { data: plats } = await db.from("listings")
    .select("*").eq("id", listing_id).single();
  if (!plats) return fel("Platsen finns inte", 404, origin);
  if (plats.pausad) return fel("Platsen är pausad", 409, origin);
  if (!plats.korin) return fel("Här går det inte att svänga in utan bokning", 409, origin);
  if (!plats.direktbokning) return fel("Värden godkänner varje bokning på den här platsen", 409, origin);
  if (plats.host_id === user.id) return fel("Det är din egen plats", 400, origin);

  // ── Ledig just nu? ──
  const nu = new Date();
  const { data: ledig } = await db.rpc("ar_ledig", {
    p_listing: listing_id,
    p_borjar: nu.toISOString(),
    p_slutar: new Date(nu.getTime() + 60 * 60_000).toISOString(),
  });
  if (!ledig) return fel("Platsen är upptagen just nu", 409, origin);

  // ── Öppettider ──
  const dagar = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const idag = (plats.oppettider ?? {})[dagar[nu.getDay()]];
  if (Array.isArray(idag) && idag.length === 2) {
    const timme = nu.getHours() + nu.getMinutes() / 60;
    if (timme < idag[0] || timme >= idag[1]) {
      return fel("Platsen är inte öppen just nu", 409, origin);
    }
  }

  const { data: vard } = await db.from("profiles")
    .select("stripe_account_id, utbetalning_klar").eq("id", plats.host_id).single();
  if (!vard?.stripe_account_id || !vard.utbetalning_klar) {
    return fel("Värden har inte kopplat utbetalning än", 409, origin);
  }

  /* Portkoden bor i platskoder, inte i listings — den far aldrig
     folja med i nagot svar som gar till fel person. */
  const { data: kod } = await db.from("platskoder")
    .select("grindkod, instruktion").eq("listing_id", listing_id).maybeSingle();

  const reserv = reservation_ore(plats.pris_timme_kr, plats.pris_dag_kr);
  const hall_till = new Date(nu.getTime() + HALL_MINUTER * 60_000);

  // Unikt index i databasen ser till att bara en session kan finnas per plats
  const { data: sess, error: sfel } = await db.from("sessions").insert({
    listing_id, driver_id: user.id, host_id: plats.host_id,
    state: "pahagg", hall_till: hall_till.toISOString(), reserv_ore: reserv,
  }).select().single();

  if (sfel) return fel("Någon annan svängde in precis före dig", 409, origin);

  // ── Reservation, fångas inte förrän föraren åker ──
  //
  // Går något fel efter att Stripe skapat reservationen MÅSTE vi
  // städa upp den. Annars ligger en spärr kvar på förarens kort
  // som ingen rad i databasen känner till.
  let pi;
  try {
    pi = await stripe.paymentIntents.create({
      amount: reserv,
      currency: "sek",
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      // Avgiften sätts först vid capture — vi vet inte beloppet än
      transfer_data: { destination: vard.stripe_account_id },
      metadata: { session_id: sess.id, listing_id, driver: user.id },
      description: `Parkla · kör-in · ${plats.titel}`,
      // Gör det möjligt att hitta tillbaka från Stripe till oss
      statement_descriptor_suffix: "PARKLA",
    });

    const { data: kopplad } = await db.from("sessions")
      .update({ payment_intent_id: pi.id })
      .eq("id", sess.id).select("id");
    if (!kopplad || !kopplad.length) throw new Error("kunde inte koppla reservationen");
  } catch (e) {
    // Släpp spärren och ta bort raden. Föraren märker ingenting.
    if (pi?.id) await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    await db.from("sessions").delete().eq("id", sess.id);
    return fel("Betalningen kunde inte förberedas. Försök igen.", 502, origin);
  }

  return svar({
    session_id: sess.id,
    client_secret: pi.client_secret,
    reserv_ore: reserv,
    hall_till: hall_till.toISOString(),
    grindkod: kod?.grindkod ?? null,
    adress: plats.adress,
  }, 200, origin);
});
