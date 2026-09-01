// ============================================================
//  connect-onboard — värden kopplar sitt bankkonto
//  POST { retur_url }  →  { url }  eller  { klar: true }
// ============================================================

import { stripe, db, anvandare, svar, fel, cors } from "./util.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const user = await anvandare(req);
  if (!user) return fel("Inte inloggad", 401, origin);

  const { retur_url } = await req.json().catch(() => ({ retur_url: null }));
  if (!retur_url || !/^https?:\/\//.test(retur_url)) {
    return fel("retur_url saknas", 400, origin);
  }

  const { data: profil } = await db.from("profiles")
    .select("stripe_account_id, utbetalning_klar, namn").eq("id", user.id).single();

  let konto = profil?.stripe_account_id as string | null;

  // Saknas konto → skapa ett Express-konto åt värden
  if (!konto) {
    const acct = await stripe.accounts.create({
      type: "express",
      country: "SE",
      email: user.email ?? undefined,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_profile: {
        mcc: "7523",                       // Parking Lots, Garages
        product_description: "Uthyrning av egen parkeringsplats via Parkla",
      },
      settings: {
        payouts: { schedule: { interval: "weekly", weekly_anchor: "monday" } },
      },
      metadata: { parkla_user: user.id },
    });
    konto = acct.id;
    await db.from("profiles").update({ stripe_account_id: konto }).eq("id", user.id);
  }

  // Redan färdigverifierad?
  const acct = await stripe.accounts.retrieve(konto);
  if (acct.payouts_enabled && acct.charges_enabled) {
    await db.from("profiles").update({ utbetalning_klar: true }).eq("id", user.id);
    return svar({ klar: true }, 200, origin);
  }

  // Annars: skicka värden till Stripes egen verifiering
  const lank = await stripe.accountLinks.create({
    account: konto,
    refresh_url: retur_url,
    return_url: retur_url,
    type: "account_onboarding",
  });

  return svar({ url: lank.url, klar: false }, 200, origin);
});
