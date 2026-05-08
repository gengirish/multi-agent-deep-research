# Cold-email templates — warm YC-alum intros

Source-of-truth, copy-paste templates for asking a YC alum (S/W/X-batch) for a
warm intro to a Group Partner before the YC W27 application closes.

All three templates assume:
- the founder is **Girish Hiremath**, writing from `girish@citeforgeai.com`
- the recipient is a YC alum the founder has at least a weak prior
  connection to (LinkedIn 2nd-degree, mutual friend, podcast appearance,
  university alumni, ex-colleague at one of the prior nine SaaS, etc.)
- the recipient knows enough about YC to evaluate "is this worth
  forwarding to my Group Partner / batchmate"

The templates are intentionally **short** (under 120 words each), **fact-only**
(no fabricated traction), **demonstration-based** (every claim has a clickable
URL the recipient can verify in under 60 seconds), and **single-CTA** (no menu).

> Hard rules:
>   - Never claim revenue, customer count, or lift numbers we don't have.
>   - Always include both `vettd-app.com` (proof of multi-tier B2B SaaS
>     credibility) and a `citeforgeai.com/report/...` URL (proof the engine
>     works).
>   - Always name CiteForge as the **tenth** product so the recipient
>     understands "this is not a first-time founder's first idea."
>   - Subject lines are <50 chars and contain no emoji.

---

## Template 1 — "Closest comp" intro (recipient is a B2B SaaS YC alum)

**Use when:** the recipient runs or ran a B2B SaaS that ships across multiple
pricing tiers (Retool, PostHog, Hightouch, Apollo, Mintlify, Resend pattern).

**Subject:** `YC W27 intro request — AEO agent (10th SaaS shipped)`

```
Hi [first name],

[How we're connected, one sentence — e.g. "We met briefly at SaaStr Mumbai 2024" or
"Both 2024 IIIT-B alums".]

I'm applying to YC W27 with CiteForge — the autonomous AEO agent that gets brands
cited by AI engines (ChatGPT, Claude, Perplexity, Gemini, Grok). It's the tenth
production AI-native B2B SaaS my team has shipped; the closest comp is Vettd
(vettd-app.com), our multi-tier hiring OS, which is built on the exact pattern
CiteForge is built on.

The engine is live. Two reports built against our own products are public:
  · citeforgeai.com/report/QUdJEAINm4g  (Vettd)
  · citeforgeai.com/report/kKMAPMarM3E  (InfinityHire)

Would you be willing to forward this thread to your Group Partner — [partner name
if known, otherwise "any GP working in dev tools / B2B SaaS"] — so they can
audit the product before our application reads?

Thanks for considering it,
Girish
girish@citeforgeai.com  ·  citeforgeai.com
```

---

## Template 2 — "Same problem, different angle" (recipient is a search/SEO YC alum)

**Use when:** the recipient runs an SEO, content, search, or marketing tool
(Ahrefs, Semrush-adjacent, Pulse, Anyword, Jasper, Frase, ContentSquare).

**Subject:** `Built the AEO agent we needed — quick YC ask`

```
Hi [first name],

I've been a [user / reader / customer] of [their product] since [year] and that
context is why I'm writing.

Traditional search is collapsing — Google AI Overviews are now in 25.8% of US
searches and zero-click rates have reached 93% on AI-mode queries. The brands
I run (vettd-app.com, infinityhire.ai) needed an autonomous agent that could
probe AI engines daily, score our content against the citation-friendly
structures from the KDD 2024 GEO paper, and rewrite + publish + verify in 14–30
days. Nothing on the market does the rewrite-and-verify loop, so we built it.

CiteForge is now live. It is the tenth AI-native B2B SaaS my team has shipped.
Two real reports built on our own products are public — you can audit the
engine end-to-end at citeforgeai.com/report/QUdJEAINm4g.

We're applying to YC W27. Would you be open to making a 1-line intro to your
Group Partner so they can run the engine on a brand they care about before
reading our application?

Best,
Girish
```

---

## Template 3 — "Pure ask, fastest possible" (recipient is a busy operator)

**Use when:** the recipient is a YC alum founder who barely knows the founder
and the founder needs to maximise reply rate by minimising read time.

**Subject:** `60-second YC W27 ask`

```
[First name] —

Direct ask, fast.

I'm applying to YC W27 with CiteForge — autonomous AEO agent, gets brands cited
by AI. It's the tenth AI-native B2B SaaS my team has shipped (the prior nine
include vettd-app.com and infinityhire.ai).

The engine is live and the proof is public — every report on
citeforgeai.com/report/... is built against one of our own products. Two
worked examples:

  · citeforgeai.com/report/QUdJEAINm4g
  · citeforgeai.com/report/kKMAPMarM3E

If you're willing to forward this thread to your Group Partner with a one-line
"audit this before they apply" note, that is the only thing I'm asking for.
No call, no deck, no demo unless they want one.

Thanks either way,
Girish
girish@citeforgeai.com
```

---

## Operator notes (do NOT include in the actual email)

1. **Never** send all three templates to the same network on the same day.
   Pick one per audience and stagger by 7–10 days.

2. Track replies in the YC application checklist (`plan/YC_APPLICATION_W27.md`,
   pre-submission checklist) under "warm intros — sent / replied / forwarded".

3. The two `citeforgeai.com/report/...` URLs are seeded by
   `npm run seed:demo-reports -- --run --share`. If the URLs above 404, re-run
   the seeder and **regenerate the templates with the fresh slugs** before
   sending.

4. After we have a measured-lift case study on a real design partner (Tier
   2 of the YC plan), add a fourth bullet to each template:
   `· [partner-domain] saw [N]× lift in [days]d — case study at citeforgeai.com/case/[slug]`

5. Compliance: the templates name **specific product domains** (vettd-app.com,
   infinityhire.ai) which the founder personally owns. Do not adapt these
   templates to name domains the team does not own without rewriting the
   surrounding sentences.
