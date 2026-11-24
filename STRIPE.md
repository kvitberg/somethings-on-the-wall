# Stripe for Somethings on the wall

Hver print får sin egen Stripe-betalingslenke. Lenken stenger seg selv når opplaget er solgt.
Kjøperen betaler med kort, Apple Pay, Google Pay eller Klarna. Stripe henter leveringsadresse og telefonnummer,
og sender kjøperen tilbake til takkesiden (`/thanks/`).

## Første gang (testmodus)

1. Lag en Stripe-konto på stripe.com hvis du ikke har en. Bestem om den skal stå på deg personlig
   eller på Fotostallen AS (spør regnskapsføreren om mva-unntaket for kunstfoto først).
2. I Stripe: **Developers → API keys → Create restricted key**, i *testmodus*. Gi den disse rettighetene:
   - Products: Write
   - Prices: Write
   - Payment Links: Write
   - Checkout Sessions: Read
3. Lag en fil som heter `.env` i prosjektmappen med én linje (lim inn nøkkelen selv):

   ```
   STRIPE_SECRET_KEY=rk_test_...
   ```

   Filen blir aldri lagt på GitHub.
4. Lag testlenkene:

   ```bash
   npm run stripe:links
   ```

5. Se dem på siden lokalt:

   ```bash
   npm run dev:test-checkout
   ```

   (I Claude-appen heter den lokale testversjonen `somethings-on-the-wall-testkasse`, på port 4322.)

   Kjøp med testkortet `4242 4242 4242 4242`, en dato fram i tid og hvilken som helst CVC.

## Når priser og opplag er bestemt (live)

1. Sett riktig `priceEur`, `editionSize`, `format` og eventuelt `shippingEur` i `src/data/prints.json`.
2. Lag en ny begrenset nøkkel i *live-modus* med de samme rettighetene, og bytt linjen i `.env`.
3. `npm run stripe:links -- --live`
4. Bygg og publiser siden. Kjøpsknappene peker nå til Stripe.

## Etter salg

```bash
npm run stripe:sold -- --live
```

Teller betalte ordre per print og lagrer dem i `src/data/sales.json` (test og live hver for seg, så testkjøp aldri vises på den publiserte siden). Siden viser da riktig antall igjen og neste nummer.
Bygg og publiser etterpå. Bestill trykket hos theprintspace fra ordren i Stripe.

## Godt å vite

- Endrer du prisen på et bilde, stenger `stripe:links` den gamle lenken og lager en ny.
- `-- --dry-run` viser hva som ville blitt sendt til Stripe uten å gjøre noe.
- Frakt: står `shippingEur` på 0, er frakten inkludert i prisen.
- Landene det kan sendes til står øverst i `scripts/stripe/links.mjs`.
