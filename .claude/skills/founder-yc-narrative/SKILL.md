---
name: founder-yc-narrative
description: The verified Girish Hiremath / IntelliForge AI founder and team credibility narrative, for use in any investor-facing surface for Chronicle. Use whenever the user is writing a YC application answer, pitch deck Team slide, demo day script, investor cold email, About / Team page, founder bio, "why us" / "unfair advantage" framing, or any copy where the founder or team needs to be introduced to investors. Also use when the user mentions YC, Y Combinator, fundraising, seed round, angel intro, demo day, founder bio, "team slide", or wants to import facts from intelliforge.tech or girishbhiremath.vercel.app. Pulls only from canonical, source-of-truth facts and prevents fabrication of numbers, titles, or credentials.
---

# Founder & team narrative for investor-facing copy

**Chronicle** — the multi-agent research copilot in this repo — is a product built by **Girish Hiremath** under the **IntelliForge AI** umbrella, a Hyderabad-based AI agency aligned with India's Bharat AI Mission. When investor-facing copy needs founder or team framing, this skill is the single source of truth so we never invent titles, dates, revenue numbers, or credentials.

The two canonical sources are:

- **[girishbhiremath.vercel.app](https://girishbhiremath.vercel.app/)** — founder portfolio (career history, AI/ML toolkit, projects, education, recommendations).
- **[intelliforge.tech](https://intelliforge.tech/)** — agency / team site (positioning, 5-level framework, portfolio, case studies, testimonials, Bharat AI Mission alignment).

Both have already been distilled in `references/` so you do not need to re-fetch them. Re-fetch only if the user explicitly says "the website was updated."

---

## ⚠️ Read this before touching `references/`

The reference files were originally written for **CiteForge**, a *different* IntelliForge product. They mix two kinds of content, and only one kind is portable:

| Content | Portable to Chronicle? |
|---|---|
| Founder facts — career history, employers, education, toolkit, contact details | ✅ Yes, verbatim |
| Team / agency facts — IntelliForge positioning, 5-level framework, Bharat AI Mission, sister-product list | ✅ Yes, verbatim |
| Product facts — CiteForge's market, wedge, pricing tiers, "Citation Graph" thesis, citation-share lift metrics, AEO/GEO framing | ❌ **No.** These are CiteForge's, not Chronicle's. |

When a reference passage names CiteForge, its market, or its metrics, **do not rename it to Chronicle** — that manufactures a claim nobody verified. Either use the passage as-is (when the ask really is about CiteForge or the wider portfolio), or keep the structure and leave `[FILL: …]` where a Chronicle-specific fact belongs. Chronicle is the **eleventh** product in the portfolio; CiteForge remains the tenth.

For portfolio framing, Chronicle sits alongside the products listed in `references/team-narrative.md` under "Sister products."

---

## When to use this skill

Use proactively for any of these surfaces:

| Surface | Why this skill |
|---|---|
| YC application answers (Founders, Why this idea, Why this team, Equity, Progress) | YC weighs founder-market fit heavily — needs the right specifics |
| Pitch deck "Team" slide | Needs short, tight, proof-loaded bullets |
| Demo day script (verbal pitch) | Needs the spoken 1-sentence intro, not the bio |
| Investor cold email (seed, angel, scout) | Needs the cold-email framing — proof first, ask second |
| Founder one-liner for press / Twitter bio | Needs the one-sentence form |
| `/about` and "Team" page on the product site | Needs web copy, links, and the company-of-builder framing |
| LinkedIn "About" sections, intro DMs | Needs the warm-network framing |
| Job posts, hiring pages | Needs the team credibility section |
| Any time someone says "tell me about the team" | This skill |

If a user says "write a founder bio" or "draft the YC team answer" without naming a length, default to **the form most appropriate for the surface** — see the "Pick the right form" table below.

---

## The two things you should know without opening any reference

These short forms cover most asks. Use them inline. Both are product-neutral and safe for Chronicle.

### Founder one-liner

> Girish Hiremath — 14+ years of enterprise software engineering across compliance, banking, pharma, telecom, fintech, and IoT (including Fortune 500 clients), now pursuing an M.Tech in Data Science & AI at IIIT Dharwad while shipping AI-native SaaS products under IntelliForge AI.

### Team one-liner

> Built by IntelliForge AI — a Hyderabad-based AI agent and workflow automation studio aligned with India's Bharat AI Mission, with a stated focus on shipping production AI in weeks, not months.

### "Why this team" — build it, don't copy it

The founder half is fixed and portable:

> The founding team has 14+ years in enterprise-grade software (Fortune 500 compliance, banking, pharma, telecom systems) and is now formally trained in AI (M.Tech in Data Science & AI at IIIT Dharwad, an Institute of National Importance), alongside hands-on work building multi-agent RAG products under IntelliForge AI.

The product half — why *that* background is the unfair advantage for *this* market — has to be written for Chronicle specifically. `references/why-this-team.md` shows the shape of that argument for CiteForge; use it as a template, not as copy.

---

## Pick the right form

Read the matching reference file, copy the variant, then adapt with the *minimum* number of edits.

| Ask | Reference to read | Variant to copy |
|---|---|---|
| "Tell us about each founder" (YC application) | `references/founder-bio.md` | **Full bio (YC long form)** |
| "Founder background" — pitch deck Team slide | `references/founder-bio.md` | **Tagline + 3 proof bullets** |
| "Who's behind this?" — About page | `references/founder-bio.md` + `references/team-narrative.md` | **Web copy** sections from each |
| Demo Day verbal intro (15-30 seconds) | `references/founder-bio.md` | **Spoken one-liner** |
| Investor cold email opening | `references/why-this-team.md` | **Cold-email opener** (founder half only) |
| YC "Why are you the right team?" | `references/why-this-team.md` | **Unfair advantage** — template, rewrite the market half |
| YC "Why this idea?" | `references/yc-application-snippets.md` | **Why this idea** — template only, CiteForge-specific |
| YC "Progress so far" | `references/yc-application-snippets.md` | **Progress** (must be edited with current numbers — see editable fields) |
| LinkedIn / X bio | `references/founder-bio.md` | **One-liner** |
| Press / podcast bio | `references/founder-bio.md` | **One-paragraph bio** |
| Hiring page "About the team" | `references/team-narrative.md` | **Web copy** |
| Slack / Email signature | `references/founder-bio.md` | **One-liner** truncated |

---

## The non-negotiables (read before generating)

1. **Never invent.** Numbers, dates, employer names, customer counts, revenue, lift percentages — only use values that appear in this skill's references or in the user's current message. If the user hasn't given you a metric YC requires (MRR, customers, growth rate), leave a `[FILL: …]` placeholder. Do not estimate.

2. **Never transplant a CiteForge product claim onto Chronicle.** See the warning section above. This is the single most likely failure mode of this skill.

3. **Don't name confidential employers.** Girish's portfolio describes his employers as "Fortune 500 Life Sciences Company", "Global Banking Corporation", "Major US Financial Institution", "Top-4 US Investment Bank", "Global Telecom Leader", "Leading Semiconductor & IoT Company", and now "Compliance & RegTech Company". Mirror this language exactly. Do not name actual companies even if you can guess them. If a YC question forces a name, leave `[FILL: client name if releasable]`.

4. **Position Girish as a builder-engineer with formal AI training, not as an "AI researcher."** This is a deliberate framing choice — it's both more accurate and stronger for a B2B SaaS pitch. Phrases to avoid: "AI researcher", "ML scientist", "thought leader", "passionate about AI." Phrases to prefer: "shipped", "built", "led", "architected", "M.Tech in Data Science & AI", "14+ years across N industries."

5. **Bharat AI Mission alignment is a credibility marker, not the pitch.** Invoke it when the audience is India-focused, the question is about market access / wedge, or the surface explicitly asks about company values. Do **not** lead a US-focused YC investor email with it.

6. **A product is one product in an ecosystem, not the company.** The legal/operating entity is IntelliForge AI (Individual Proprietorship — Hyderabad, Telangana, India). Chronicle ships under that umbrella. When a YC form asks for "company name", use the product/brand seeking funding; when it asks for legal entity, use **IntelliForge AI**. For other products by the same team, see `references/team-narrative.md` "Sister products."

7. **Show, don't claim.** Lead with proof (years, industries, prior products, paper citations) before adjectives. Numbers beat superlatives. "14+ years across 6 industries" beats "deeply experienced engineer."

8. **The contact details are fixed:**
   - Founder email: `gen.girish@gmail.com`
   - Company email: `contact@intelliforge.tech`
   - Founder portfolio: `https://girishbhiremath.vercel.app`
   - Company site: `https://intelliforge.tech`
   - Product email / site for Chronicle: `[FILL: confirm with founder]`

   Use the most surface-appropriate one. YC application → `gen.girish@gmail.com` (personal, founder-direct). Hiring → `contact@intelliforge.tech`.

---

## Editable fields you must always check

Some YC answers require numbers that change weekly. Always confirm with the user before submitting — never default to historical or example numbers from this skill, and never reuse a CiteForge figure as a Chronicle one.

- `[FILL: current MRR]` — current month MRR in $ and ₹
- `[FILL: customer count]` — paying customers
- `[FILL: design partner count]` — unpaid design partners
- `[FILL: WoW growth]` — week-over-week growth percentage
- `[FILL: signed LOIs]`
- `[FILL: round size]` — if asking for a specific check
- `[FILL: equity split]` — for YC application

If the user has provided these earlier in the conversation, use them. Otherwise, leave the placeholder so they fill in before submitting.

---

## Tone calibration by audience

| Audience | Tone | Bharat AI Mission? | Length bias |
|---|---|---|---|
| YC partners (US-based) | Confident, proof-loaded, no jargon | Mention only in "wedge / why now" | Tighter |
| Indian / regional VCs | Same plus regional context | Yes, lead with it | Slightly longer |
| Angel investors (warm intro) | Conversational, founder-first | Optional | Medium |
| Strategic partners (CMS, CRM, etc.) | Engineering-credibility forward | No | Medium |
| Press / podcast | Story-arc forward (semiconductor → banking → AI) | If the outlet is India-focused | Longer |
| Hiring candidates | Mission + quality of engineering | Yes — mission alignment matters | Medium |

---

## Reference files

Load only the one(s) the table above points you to. Each file is self-contained and includes multiple length variants so you can pick without re-reading the others. All were written for CiteForge — apply the portability rule at the top of this file.

- `references/founder-bio.md` — Girish Hiremath, multiple lengths (fully portable)
- `references/team-narrative.md` — IntelliForge AI, framing + sister products (portable; Chronicle is not yet in the product table)
- `references/why-this-team.md` — "Unfair advantage" framings keyed to audience (founder half portable, market half is CiteForge's)
- `references/yc-application-snippets.md` — Pre-drafted YC answers (CiteForge-specific; use as structure only)
- `references/cold-emails.md` — Investor cold-email templates (CiteForge-specific; use as structure only)

---

## When the underlying facts change

If Girish or IntelliForge updates `girishbhiremath.vercel.app` or `intelliforge.tech` (e.g., new credential, new role, new product, completed M.Tech), update the relevant reference file in this skill in the same change. The reference files — not the websites — are the binding source of truth for any output this skill produces, so they need to stay in sync.

A good rule: when reading either site for the first time in a session, scan the references for any out-of-date claim, and surface diffs to the user before generating copy.
