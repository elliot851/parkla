// ============================================================
//  Parkla — delad kod för alla edge functions
// ============================================================

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

// ── Stripe ─────────────────────────────────────────────────
export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

// ── CORS ───────────────────────────────────────────────────
const TILLATNA = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://parkla.se,https://www.parkla.se,https://elliot851.github.io,http://localhost:8080")
  .split(",").map((s) => s.trim());

export function cors(origin: string | null) {
  const ok = origin && TILLATNA.includes(origin) ? origin : TILLATNA[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function svar(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

export function fel(meddelande: string, status: number, origin: string | null) {
  return svar({ fel: meddelande }, status, origin);
}

// ── Supabase med service-role (förbi RLS — bara i functions) ──
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ── Vem ringer? ────────────────────────────────────────────
export async function anvandare(req: Request) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const { data, error } = await db.auth.getUser(h.slice(7));
  if (error || !data.user) return null;
  return data.user;
}

// ============================================================
//  AVGIFTER  —  22 % take rate: 12 % på föraren, 10 % av värden
//  Räknas ALLTID här. Klienten får aldrig skicka in belopp.
// ============================================================

export const AVGIFT_FORARE = 0.12;          // korttid
export const AVGIFT_FORARE_MANAD = 0.06;
export const AVGIFT_VARD = 0.10;
export const AVGIFT_VARD_MANAD = 0.08;
export const TRYGG_ORE = 900;               // 9 kr per bokning
export const TRYGG_ORE_MANAD = 4900;        // 49 kr i månaden
export const MIN_DEBITERING_ORE = 300;      // Stripes minsta SEK-belopp

export interface Pengar {
  bas_ore: number;
  avgift_forare_ore: number;
  trygg_ore: number;
  avgift_vard_ore: number;
  total_ore: number;          // det föraren dras
  utbetalning_ore: number;    // det värden får
  plattform_ore: number;      // application_fee_amount
}

/**
 * Måste ge exakt samma siffror som feeSplit() i app.js.
 * Ser föraren ett pris i appen ska hen dras precis det.
 */
export function rakna(bas_ore: number, lage = "timme"): Pengar {
  const manad = lage === "manad";
  const bas = Math.max(0, Math.round(bas_ore));
  const bas_kr = bas / 100;

  // Avgifterna avrundas till HELA KRONOR, precis som feeSplit() i appen.
  // Räknar man i öre här blir totalen 40 öre fel mot det föraren fick se.
  const avgift_forare_ore = Math.round(bas_kr * (manad ? AVGIFT_FORARE_MANAD : AVGIFT_FORARE)) * 100;
  const trygg_ore = manad ? TRYGG_ORE_MANAD : TRYGG_ORE;
  const avgift_vard_ore = Math.round(bas_kr * (manad ? AVGIFT_VARD_MANAD : AVGIFT_VARD)) * 100;

  const total_ore = bas + avgift_forare_ore + trygg_ore;
  const utbetalning_ore = bas - avgift_vard_ore;

  return {
    bas_ore: bas,
    avgift_forare_ore,
    trygg_ore,
    avgift_vard_ore,
    total_ore,
    utbetalning_ore,
    plattform_ore: total_ore - utbetalning_ore,
  };
}

// ============================================================
//  PRISSÄTTNING  —  serversanning
// ============================================================

export const HALL_MINUTER = 20;   // påhäng vid kör-in
export const MIN_TIMMAR = 1;      // minsta debitering
export const STEG_MINUTER = 30;   // därefter påbörjad halvtimme

/** Kör-in: minst en timme, sedan påbörjad halvtimme. */
export function korinBas_ore(pris_timme_kr: number, minuter: number): number {
  const tim_ore = Math.round(pris_timme_kr * 100);
  if (minuter <= MIN_TIMMAR * 60) return tim_ore * MIN_TIMMAR;
  const over = minuter - MIN_TIMMAR * 60;
  const steg = Math.ceil(over / STEG_MINUTER);
  return tim_ore * MIN_TIMMAR + Math.round(tim_ore * (STEG_MINUTER / 60)) * steg;
}

/** Reservation vid kör-in: 4 h eller dagspriset, det som är lägst. Aldrig under 100 kr. */
export function reservation_ore(pris_timme_kr: number, pris_dag_kr: number): number {
  const fyra = Math.round(pris_timme_kr * 100) * 4;
  const dag = pris_dag_kr > 0 ? Math.round(pris_dag_kr * 100) : fyra;
  const bas = Math.max(10000, Math.min(fyra, dag));
  return rakna(bas, "timme").total_ore;
}

/** Bokning i förväg: summera dagspris/timpris över intervallet. */
export async function bokningBas_ore(
  listing: { id: string; pris_timme_kr: number; pris_dag_kr: number; pris_manad_kr: number },
  borjar: Date,
  slutar: Date,
  lage: string,
): Promise<number> {
  const minuter = Math.round((slutar.getTime() - borjar.getTime()) / 60000);

  if (lage === "manad") {
    const manader = Math.max(1, Math.round(minuter / (60 * 24 * 30)));
    return Math.round(listing.pris_manad_kr * 100) * manader;
  }

  if (lage === "dag") {
    // Hämta ev. avvikande dagspriser
    const dagar: string[] = [];
    for (let d = new Date(borjar); d < slutar; d.setDate(d.getDate() + 1)) {
      dagar.push(d.toISOString().slice(0, 10));
    }
    const { data } = await db.from("day_prices")
      .select("dag, pris_kr").eq("listing_id", listing.id).in("dag", dagar);
    const karta = new Map((data ?? []).map((r) => [r.dag as string, r.pris_kr as number]));
    return dagar.reduce(
      (s, d) => s + Math.round((karta.get(d) ?? listing.pris_dag_kr) * 100), 0);
  }

  return korinBas_ore(listing.pris_timme_kr, minuter);
}
