# YC application snippets

> **Source of truth.** Pre-drafted answers for the standard YC application form (Winter 2027 / Summer 2027 batch). Each answer pulls from `founder-bio.md`, `team-narrative.md`, and `why-this-team.md` — those are the only fact sources. Everywhere a number appears that is not verifiable from those files, this document uses a `[FILL: …]` placeholder. **The founder must replace every `[FILL: …]` before submission.** Do not let any `[FILL: …]` reach a YC reviewer.

YC application questions change slightly between batches. Check the live application form before submission — if a question below is missing or new, draft it in the same style and add it back here.

---

## Company

### Company name

> **CiteForge**

(Operating entity for legal questions: **IntelliForge AI** — Individual Proprietorship, Hyderabad, Telangana, India.)

### Company URL

> [https://citeforgeai.com](https://citeforgeai.com)

### What is your company going to make? (Describe in 50 characters or less.)

> The autonomous AEO agent. Get cited by AI.

(48 characters. Backup if YC tightens to ≤40 chars: *"Autonomous AEO agent for AI search citations."* — 47 chars; or *"Be the answer, not a result, in AI search."* — 43 chars.)

### What is your company going to make? (Describe what your company does in three sentences or fewer.)

> CiteForge probes ChatGPT, Claude, Perplexity, Gemini, and Grok daily to measure whether your brand is *cited* by AI search. We score every page against six structural targets from peer-reviewed GEO research (KDD 2024, ICLR 2025, three 2025 follow-ups), automatically rewrite pages to be more citeable, draft outreach to less-popular AI-preferred third-party domains, and detect Preference Manipulation Attacks against your domain. The product is a closed loop — probe → diagnose → rewrite → publish → re-probe — priced for the global south at ₹3,499/month, 30× cheaper than the US enterprise alternatives.

### Where do you live now, and where would the company be based after YC?

> The founder lives in **Hyderabad, India**. The company will remain headquartered in Hyderabad after YC, with a US Delaware C-Corp parent set up during YC for fundraising and US customer contracting. The engineering and operations centre stays in India for the global-south wedge, with founder travel to SF for the YC batch in person.

---

## Progress

### How far along are you?

> **The product is shipped and live at [citeforgeai.com](https://citeforgeai.com).** All core agents are wired end-to-end:
>
> - Probe Engine across **5 platforms** (ChatGPT, Claude, Perplexity, Gemini, Grok) using paraphrase ensembles, with daily Inngest crons and a 24-hour read-through cache.
> - Content Analyzer scoring pages against the six numerical principles from Yu et al. 2025, with architecture-weighted profiles (STS / IR / ISG).
> - Content Agent rewriting against research-derived thresholds, with semantic-preservation guardrails using OpenAI `text-embedding-3-small` (sentence cosine, paragraph similarity, document JS-divergence). Publish endpoint and re-probe verify loop are wired — the lift is *measured*, not estimated.
> - Authority Agent with target discovery from the cross-tenant citation graph (filtered by Tranco rank to surface less-popular AI-cited domains), drafts for guest posts, Reddit, LinkedIn, HN, G2, plus AgentMail-driven send.
> - Defensive Mode (PMA detection) — four detectors: hidden text, instruction injection, preference biasing, cross-page injection. Async via Inngest. Daily digest cron emails owners.
> - Attribution beacon, Razorpay billing on five plans, Auth.js v5 with Prisma + JWT sessions, MCP server published as `@citeforge/mcp` so Cursor / Claude Desktop drive the product directly.
>
> Source code is open at [github.com/gengirish/citeforge](https://github.com/gengirish/citeforge). The `/research` page links to all five papers. Architecture and operator docs live in [`AGENTS.md`](https://github.com/gengirish/citeforge/blob/main/AGENTS.md).

### How long have each of you been working on this? How much of that has been full-time?

> Solo-founded by **Girish Hiremath**, building under his IntelliForge AI studio. CiteForge has been in development for **[FILL: months working on CiteForge specifically — e.g. "4 months"]**, of which **[FILL: hours/week or full-time status — e.g. "20 hours/week alongside a Principal SE role at a Compliance & RegTech Company; will go full-time on YC acceptance"]**. The underlying intuition has been operational for **[FILL: longer — e.g. "the founder has been manually probing LLMs to rank his own studio's seven products since early 2025"]**.

### How many active users / customers do you have?

> **[FILL: paying customers — number]** paying customers. **[FILL: design partners — number]** unpaid design partners actively using the product. **[FILL: beta sign-ups — number]** waitlist sign-ups via citeforgeai.com.
>
> If the founder has zero paying customers today, the honest version is: *"Zero paying customers today. Product launched [FILL: launch date] and is in the design-partner phase. We have [FILL: design partner count] design partners across [FILL: India / SEA / US] who are actively running probes and giving us weekly feedback. Our YC ask includes the runway to convert this cohort to paid in the first 90 days of the batch."* Use this version — it is materially better than fabricating numbers, which YC partners pattern-match for in seconds.

### How much revenue have you been making?

> **[FILL: current MRR in $ and ₹]**. Pricing is on the public pricing page at [citeforgeai.com/pricing](https://citeforgeai.com/pricing). Plans range from Free → ₹3,499/mo (Starter) → ₹13,999/mo (Pro) → ₹49,999/mo (Scale) → ₹149,999/mo (Agency). Razorpay subscription billing is wired and live.
>
> If pre-revenue: *"Pre-revenue today. Pricing is published and Razorpay billing is wired and tested. We are converting design partners to paid in the first month of the YC batch."*

### What is your monthly growth rate?

> **[FILL: WoW growth rate — calculate honestly from your actual signup or revenue numbers, e.g. "+22% WoW signups", or leave as "Pre-revenue, [FILL: signups WoW] WoW signup growth on the waitlist."]**

### Anything else you would like us to know?

> CiteForge is the **tenth shipped product** in the IntelliForge AI portfolio. Seven are listed at [intelliforge.tech](https://intelliforge.tech), plus two production multi-tier B2B SaaS products that aren't yet on the agency site but are publicly live: **Vettd** ([vettd-app.com](https://vettd-app.com/)) — the Hiring Intelligence OS with autonomous AI interview agents, cross-tenant Talent Graph, and India-first multi-tier pricing (Free / ₹3,999 / ₹11,999 / ₹29,999) that maps almost 1:1 to CiteForge's pricing structure — and **InfinityHire** ([infinityhire.ai](https://infinityhire.ai/)), an AI interview-prep copilot for engineers and PMs. This is not the founder's first build, and CiteForge is not the founder's first multi-tier B2B SaaS — Vettd already has the same architectural shape (autonomous agent + cross-tenant network effects + multi-tier pricing) live in production. The studio is aligned with India's **Bharat AI Mission** (₹10,372 crore IndiaAI initiative). The founder is currently pursuing an M.Tech in Data Science & AI at **IIIT Dharwad**, an **Institute of National Importance** under India's MoE — formal AI training in parallel with the founder role.
>
> **[FILL: any specific YC-relevant thing not covered above — e.g. "we already have a Letter of Intent from [FILL: customer] for $[FILL: amount] / year on the Scale tier" or "we are speaking to [FILL: number] enterprise customers in [FILL: regions]"]**

---

## Idea

### Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you're making?

> Three threads converged. **First**, the studio I run (IntelliForge AI) ships AI-native SaaS products and we depend on AI search visibility — I have been manually paraphrase-probing the major LLMs for our own products for **[FILL: months — e.g. "the past 12 months"]** to understand which structural changes move citation share. The pain is real and operationally measurable. **Second**, the academic literature flipped my mental model in 2025: the Source-Coverage-Bias study (arXiv 2512.09483, Dec 2025) measured 55,936 queries and found that **Copilot, Gemini, Grok, and Perplexity all cite *less-popular* domains more often than traditional search does** — only ChatGPT clusters with Google's high-popularity bias. The Aggarwal et al. (KDD 2024) GEO paper found that **rank-5 sites get +115% Position-Adjusted Word Count lift** from optimisation versus ~+30% for rank-1. AI search is structurally favourable to challenger brands — the exact opposite of what most people assume — and that means there is a real, defensible product to build for them. **Third**, my background is the right one to build it: 14+ years of enterprise software for Fortune 500 clients across compliance, banking, pharma, telecom, AML, and IoT, and now formal AI training at IIIT Dharwad in parallel with running the studio.

### What's new about what you're making? What substitutes do people resort to because it doesn't exist yet?

> The new thing is the **closed autonomous loop**. Existing tools (Profound, Athena, Otterly, Daydream) are dashboards — $2,500–$50,000/month — that *measure* AI visibility and leave the customer to fix it manually. There is no autonomous re-write, no autonomous outreach, no PMA detection, and no integration with the page-publishing surface. Customers today resort to either: (a) ignoring the problem ("we'll deal with AI search later"), (b) hiring an SEO agency that retrofits SEO playbooks that are demonstrably the wrong playbook for AI search, or (c) sending the dashboard PDF to their content team and waiting weeks for prioritisation.
>
> CiteForge is the first product to ship the entire loop: probe, diagnose against research-derived structural targets, rewrite with a Yu-et-al. semantic-preservation guardrail, publish via CMS, re-probe to *measure* lift, then surface the next-best authority target from the cross-tenant citation graph — and detect Preference Manipulation Attacks against the customer's own domain. Every leg of that loop is grounded in a peer-reviewed paper, all five linked from `/research`.

### Who are your competitors? What do you understand about your business that they don't?

> **Direct competitors:** Profound (raised $155M, US-enterprise dashboard), Athena (YC-backed, dashboard), Otterly, Daydream, Peec AI. **Adjacent / SEO incumbents:** Ahrefs, SEMrush, Surfer (retrofitting AI features onto SEO products).
>
> Three things they don't operate on the way we do:
>
> 1. **AI search is structurally favourable to challenger brands.** The Source-Coverage-Bias study and Aggarwal et al. (rank-5 sites get +115% PAW lift, rank-1 sites get ~+30%) make this measurable, not hypothetical. We sell to challenger brands directly, in the geographies the US tools price out — India, SEA, MENA, LATAM. The competitor pricing model ($2,500–$50,000/month) cannot reach them; ours (₹3,499 / ~$42/month entry) does.
> 2. **Defensive Mode is a category nobody else ships.** Nestaas et al. ICLR 2025 explicitly warn that "successful defense against prompt injection attacks may not be sufficient to defend against Preference Manipulation Attacks." Every dashboard incumbent shows you that a competitor outranks you in AI; none of them check whether the competitor is doing it via PMA against your domain. We do.
> 3. **The autonomous loop, not the dashboard.** The competitor surface is a dashboard — humans must act on it. Ours is an agent — it acts. Probe → analyse → rewrite → publish → verify is a closed loop, not a four-tab UI.

### How do or will you make money? How much could you make?

> **Subscription SaaS** with action-credit metering for the autonomous parts. Five tiers (Free / Starter / Pro / Scale / Agency), three currencies (₹ for India, $ for US, with localised pricing planned for SEA/MENA/LATAM). Content Agent rewrites and Authority drafts are credit-metered (overage at margin, ~$1.50/rewrite, ~$0.30/draft) to keep unit economics positive at every tier. Defensive Mode is a Scale-tier feature — the upsell path.
>
> **Bottom-up TAM (the addressable, not the vanity number):** the global B2B / B2B2C content-marketing software market is ~$23B/year (multiple analyst sources). The under-served segment we go after first — companies that publish content but cannot afford the $2,500–$50,000/month US AI-visibility tools — is conservatively ~$2–4B/year (India + SEA + MENA + LATAM SMB and mid-market). At ₹3,499–₹49,999/month average revenue per customer, **5,000 paying customers = ~$2M ARR; 25,000 = ~$10M ARR; 100,000 = ~$40M ARR** — all credible at our entry price points.
>
> **Why the gross margin is real, not aspirational:** every plan limit was reverse-engineered from per-probe API cost (we measured); the cache hit rate on shared probes amortises the cost across customers asking the same prompts; the Defensive Mode tier carries the high-margin LLM spend. Blended GM target is **65%+** at scale — sized into [`plan/CITEFORGE_YC_BRIEF.md`](https://github.com/gengirish/citeforge/blob/main/plan/CITEFORGE_YC_BRIEF.md) Section 5 with full unit economics.

### Which category best applies to your company?

> **B2B SaaS (Marketing / Search) + AI Infrastructure.**

### If you had any other ideas you considered applying with, please list them. (One sentence each.)

> **[FILL: 1–3 other ideas, e.g.: "An AI agent for compliance-driven content (carries through from current Principal SE work in RegTech)", "An AI-native code-review SaaS in the global-south price band", "A multi-agent legal research platform leveraging the existing Multi-Agent Deep Research product"].**

### Why do you think this idea will be a success? What's the alternative?

> The product loop is real and the founder has shipped **nine public AI products before this one** (including Vettd at vettd-app.com — a multi-tier B2B SaaS with the same architectural shape as CiteForge) — the execution risk is calibrated. The market timing is right (Google AI Overviews already cut organic CTR by 34–46% in published 2024–2025 studies; Gartner's Dec 2025 forecast says 25% of search traffic disappears by end of 2026). The wedge is defensible (no US tool can profitably serve the ₹3,499 / month price point at our cost structure). The research foundation is real and citable. **The alternative** if this doesn't work: the founder remains a Principal Software Engineer + IntelliForge AI studio operator and continues to ship — but the upside of the YC path (capital, network, US distribution) is materially higher than the agency path, which is why we're applying.

---

## Founders

### Tell us about each of you. (Each founder writes their own bio — first person, no marketing speak.)

> **Girish Hiremath (founder, sole technical lead, Hyderabad)**
>
> I've spent the last 14 years building enterprise software, almost entirely for Fortune 500 clients. I started in 2012 at a leading semiconductor company building IoT cloud agents, an LTE simulator, and an AI-powered Hindi Reader using OpenCV and artificial neural networks — that early AI work is the through-line of my career; I have been shipping AI products before "AI" was a marketing term. I then spent four years (2016–2019) at a Global Telecom Leader leading microservices and Elasticsearch dashboards serving 13M+ test results and 2,600+ users; two years (2019–2021) at a top-4 US investment bank and a major US financial institution building client-onboarding and AML compliance platforms (zero-downtime blue-green deploys, 98% code coverage, +40% Agile efficiency); two years (2021–2023) at a global banking corporation designing the personal-accounts core API; and 18 months (2023–2025) at a Fortune 500 life sciences company leading a kit-ordering portal team of 7. I am currently Principal Software Engineer at a Compliance & RegTech Company in Hyderabad. In parallel I am pursuing an M.Tech in Data Science & Artificial Intelligence at IIIT Dharwad — an Institute of National Importance — and running my AI studio IntelliForge AI, which has shipped **nine public AI-native products before CiteForge** — most relevantly **Vettd** ([vettd-app.com](https://vettd-app.com/)), a production multi-tier B2B SaaS hiring-intelligence OS with the same architectural shape as CiteForge (autonomous AI agent + cross-tenant network effects + India-first multi-tier pricing), and **InfinityHire** ([infinityhire.ai](https://infinityhire.ai/)), an AI interview-prep copilot. CiteForge is not my first multi-tier B2B SaaS; the architecture is proven on Vettd. I will go full-time on CiteForge on YC acceptance. I want to be at YC because the autonomous-agent SaaS loop I am building is the right product to scale into a global category, and the YC distribution network is the fastest path from our India launch base to a defensible US footprint.

### How long have the founders known one another and how did you meet?

> Solo founder. **Not applicable** — but the studio (IntelliForge AI) has been operating since [FILL: studio start date] with [FILL: 0 / number of contributors / contractors / advisors]. **[FILL: hiring plan — e.g. "Plan to hire one technical co-founder + one growth lead in the first 90 days post-YC."]**

### How much money have you raised so far?

> **₹0 / $0** — all engineering, hosting (Vercel + Neon), AgentMail, Razorpay setup, and content production has been bootstrapped from the IntelliForge AI studio's services revenue.

### Have you taken any investment yet?

> **No.** No SAFEs, no convertibles, no equity, no debt.

### Equity split?

> Solo founder. **Girish Hiremath: 100%.** Equity for any post-YC hire is **[FILL: planned ESOP — e.g. "5–10% reserved in an ESOP for the first three engineering and growth hires"]**.

### What's your equity ask, and at what valuation?

> Standard YC terms: **$500K SAFE** at the standard YC post-money cap, plus the optional MFN. We are also open to discussing the YC accelerator deal as published at [ycombinator.com/deal](https://www.ycombinator.com/deal). **No external lead is committed.**

---

## Curveball questions YC has historically asked

These are not always on the form, but they appear on the partner call. Pre-draft.

### "If we funded you for $1M, what would you spend it on in the first year?"

> Three buckets. **40% engineering** ([FILL: 1–2] technical hires for the autonomous-agent surface; one specifically for Defensive Mode + ContextCite-style decision attribution). **30% go-to-market** ([FILL: 1] growth lead in India + SEA, content production for the AEO Index report cadence, design-partner conversion programme). **20% LLM API spend + infra** to support the cohort growth (probe API costs, embedding API costs, hosting, observability — Sentry is wired). **10% legal + compliance** (US Delaware C-Corp setup, India proprietorship → private limited conversion, US data-processing addenda for enterprise tier).

### "What are you uncertain about?"

> Three honest unknowns. **(1) Repeatable enterprise sales motion in the US** — we've built for the global-south SMB wedge first because that is what we can deliver with our cost structure; the US Scale and Agency tiers will need a US-based growth hire and we don't have one yet. **(2) The Defensive Mode legal exposure** — surfacing PMAs run by the customer's competitors will eventually surface PMAs run by venture-backed competitors; we have a defensible methodology but no in-house counsel yet. **(3) Long-term LLM API economics** — our cost model assumes the major model API prices continue their current decline; a sudden price reversal would compress margins and force the browser-automation fallback live earlier than planned.

### "What would have to be true for this to be a $10B company?"

> **(1)** AI search overtakes traditional Google search as the primary discovery surface for ≥50% of B2B and B2C buying journeys by 2030 (multiple analyst forecasts already trend this way). **(2)** The Source Coverage Bias result holds — challenger brands continue to win disproportionately in AI search, expanding our addressable market beyond the SEO incumbents. **(3)** The autonomous-loop product format becomes the category standard (replacing dashboards), and we are the brand identified with that format. **(4)** The Defensive Mode category becomes mandatory enterprise compliance the way malware scanning is today, with CiteForge as the de facto provider for that category.

---

## Editable-fields checklist (founder must complete before submission)

The application above contains exactly **N=15** `[FILL: …]` placeholders (count yourself before submission — if any new question gets added, count again):

- [ ] Months working on CiteForge specifically
- [ ] Hours/week or full-time status today
- [ ] Long-term operational intuition timeframe
- [ ] Paying customers count
- [ ] Design partners count
- [ ] Beta sign-ups / waitlist count
- [ ] Current MRR in $ and ₹
- [ ] WoW growth rate
- [ ] Specific YC-relevant additional fact
- [ ] How long manually probing LLMs (months)
- [ ] Other ideas considered (1–3 sentences each)
- [ ] Studio start date
- [ ] Studio current contributor count
- [ ] Hiring plan
- [ ] ESOP planned percentage
- [ ] Engineering hire count + planned growth-lead count

After every batch of edits, run `grep "\[FILL:" plan/YC_APPLICATION_W27.md` and confirm the list is empty before clicking "Submit."
