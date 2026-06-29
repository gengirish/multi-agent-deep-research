import React from "react";
import Link from "next/link";
import { TopNav } from "../../components/TopNav";
import { Icon, IconName } from "../../components/icons";
import { SubscribeForm } from "../../components/SubscribeForm";
import "./LandingPage.css";

const FOUNDER_QUERIES = [
  "Market size for AI coding assistants — TAM, SAM, SOM 2025",
  "How big is the vertical SaaS market for healthcare?",
  "TAM and growth rate for AI customer support automation",
  "Market size of the creator economy and key segments",
];

const TRUST_PILLARS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "shield",
    title: "Every source scored",
    body:
      "Each source gets a credibility score before it reaches your number. You see the average confidence up front — not a black box.",
  },
  {
    icon: "alert",
    title: "Contradictions surfaced",
    body:
      "When sources disagree on a number, Chronicle flags it instead of silently averaging. You walk into the room knowing what's disputed.",
  },
  {
    icon: "link",
    title: "Every figure cited",
    body:
      "TAM/SAM/SOM with a clickable source behind each claim. When a partner asks \"where's that from?\", you have the link.",
  },
];

const AGENT_TILES = [
  {
    span: "wide",
    eyebrow: "01 \u00b7 Retriever",
    title: "Pulls from web, papers, and news",
    body:
      "Tavily, Perplexity, and arXiv in parallel. Sources scored before they hit your report.",
  },
  {
    span: "tall",
    eyebrow: "02 \u00b7 Enricher",
    title: "Adds metadata + sentiment",
    body:
      "Dates, author signals, source-type classification, sentiment polarity. Every claim gets context.",
  },
  {
    span: "small",
    eyebrow: "03 \u00b7 Analyzer",
    title: "Surfaces contradictions",
    body: "Claude 3.5 Sonnet flags conflicts between sources.",
  },
  {
    span: "small",
    eyebrow: "04 \u00b7 Insight",
    title: "Builds the reasoning chain",
    body: "GPT-4o turns scattered claims into hypotheses + trends.",
  },
  {
    span: "wide",
    eyebrow: "05 \u00b7 Reporter",
    title: "Compiles a cited markdown report",
    body:
      "Claude 3.5 Haiku assembles the deck-ready output. Drop your TAM/SAM/SOM straight into a slide, Notion, or a YC application.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Name your market",
    body:
      "Type a market, segment, or category. No prompt engineering, no API keys, no signup.",
  },
  {
    n: "02",
    title: "Watch five agents fan out",
    body:
      "Web, papers, and news in parallel. Every source scored, every contradiction flagged, the reasoning chain assembled live.",
  },
  {
    n: "03",
    title: "Get a cited sizing report",
    body:
      "TAM/SAM/SOM with sources, surfaced contradictions, and a confidence score. Markdown export — paste straight into your deck.",
  },
];

const PROOF_METRICS = [
  { value: "10\u00d7", label: "faster research output" },
  { value: "80%", label: "cost reduction per report" },
  { value: "0", label: "manual citations \u2014 fully automated" },
];

export const LandingPage: React.FC = () => {
  return (
    <div className="landing">
      <div className="landing__bg" aria-hidden="true">
        <div className="landing__glow landing__glow--a" />
        <div className="landing__glow landing__glow--b" />
        <div className="landing__grid" />
      </div>

      <TopNav variant="landing" />

      <main className="landing__main">
        <section className="hero">
          <div className="hero__eyebrow">
            <span className="hero__dot" /> Live demo &middot; No signup
          </div>

          <h1 className="hero__title">
            Market sizing you can
            <br />
            <span className="hero__title--accent">defend in the room.</span>
          </h1>

          <p className="hero__sub">
            Chronicle runs your market through a multi-agent pipeline that
            searches the web, papers, and news, scores every source for
            credibility, flags contradictions, and hands you a cited
            TAM/SAM/SOM report &mdash; not a paragraph you have to fact-check.
          </p>

          <div className="hero__cta">
            <Link href="/research" className="btn btn--primary">
              Size your market &rarr;
            </Link>
            <a href="#how-it-works" className="btn btn--ghost">
              How it works
            </a>
          </div>

          <div className="hero__queries" aria-label="Example market-sizing queries">
            <span className="hero__queries-label">Try one of these:</span>
            <div className="hero__chips">
              {FOUNDER_QUERIES.map((q) => (
                <Link
                  key={q}
                  href={`/research?q=${encodeURIComponent(q)}`}
                  className="chip"
                  title={q}
                >
                  {q}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="pillars" aria-label="Why founders trust the numbers">
          <div className="how__head">
            <span className="bento__eyebrow">Numbers with receipts</span>
            <h2 className="section__title">
              The difference between an estimate and a defensible number.
            </h2>
            <p className="section__sub">
              ChatGPT gives you a number. Chronicle gives you a number you can
              source, stress-test, and stand behind in a partner meeting.
            </p>
          </div>
          <div className="pillars__grid">
            {TRUST_PILLARS.map((p) => (
              <div className="pillar" key={p.title}>
                <div className="pillar__icon">
                  <Icon name={p.icon} size={20} />
                </div>
                <h3 className="pillar__title">{p.title}</h3>
                <p className="pillar__body">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="proof" aria-label="Verified case study">
          <div className="proof__head">
            <span className="proof__eyebrow">Verified case study</span>
            <h2 className="proof__title">
              How an analytics firm shipped research 10&times; faster.
            </h2>
            <p className="proof__sub">
              Manual research was taking 10+ hours per report; analysts spent
              most of that time aggregating data instead of generating
              insights. Chronicle&rsquo;s multi-agent pipeline replaced the
              aggregation step end-to-end.
            </p>
          </div>
          <div className="proof__grid">
            {PROOF_METRICS.map((m) => (
              <div className="proof__stat" key={m.label}>
                <div className="proof__value">{m.value}</div>
                <div className="proof__label">{m.label}</div>
              </div>
            ))}
          </div>
          <blockquote className="proof__quote">
            &ldquo;Their multi-agent research system transformed how we
            operate. Research that took days now takes minutes &mdash; and the
            quality is consistently better than manual work.&rdquo;
            <cite>&mdash; Priya S., Head of Research, Analytics Firm</cite>
          </blockquote>
        </section>

        <section className="bento" aria-label="The five agents that power Chronicle">
          <div className="bento__head">
            <span className="bento__eyebrow">Inside the pipeline</span>
            <h2 className="section__title">
              Five specialized agents. One auditable trail.
            </h2>
            <p className="section__sub">
              Not a single LLM call. Each agent is picked for the specific
              cognitive load of its job &mdash; and you watch every step run
              live.
            </p>
          </div>
          <div className="bento__grid">
            {AGENT_TILES.map((t) => (
              <div className={`bento__tile bento__tile--${t.span}`} key={t.eyebrow}>
                <div className="bento__tile-eyebrow">{t.eyebrow}</div>
                <h3 className="bento__tile-title">{t.title}</h3>
                <p className="bento__tile-body">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="how" aria-label="How Chronicle works">
          <div className="how__head">
            <h2 className="section__title">How it works</h2>
            <p className="section__sub">
              No black box. Every step the agents take is visible, recorded,
              and replayable.
            </p>
          </div>

          <ol className="how__steps">
            {STEPS.map((s) => (
              <li className="step" key={s.n}>
                <div className="step__num">{s.n}</div>
                <div className="step__body">
                  <h3 className="step__title">{s.title}</h3>
                  <p className="step__text">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="who" aria-label="Who Chronicle is for">
          <h2 className="section__title">Built for the questions founders actually ask.</h2>
          <ul className="who__list">
            <li>
              <strong>Pre-fundraise</strong> &mdash; size your market with
              numbers you can defend in a partner meeting.
            </li>
            <li>
              <strong>Pre-launch</strong> &mdash; map the competitive
              landscape, find the gaps, find the prior art.
            </li>
            <li>
              <strong>Customer discovery</strong> &mdash; surface what real
              users are saying about today&rsquo;s solutions, with sources.
            </li>
            <li>
              <strong>YC application</strong> &mdash; back every claim with a
              citation a partner can click.
            </li>
          </ul>
        </section>

        <section className="newsletter" aria-label="Subscribe to the Chronicle briefing">
          <SubscribeForm
            variant="panel"
            title="Get the Chronicle briefing"
            subtitle="Founder-grade market research — cited, defensible, and delivered to your inbox. No spam, unsubscribe in one click."
          />
        </section>

        <section className="cta">
          <div className="cta__card">
            <h2>Stop guessing your TAM.</h2>
            <p>
              Run your market through Chronicle. Free, open-source, and every
              number comes with a source you can defend.
            </p>
            <Link href="/research" className="btn btn--primary btn--lg">
              Size your market &rarr;
            </Link>
          </div>
        </section>

        <section className="madeby" aria-label="Made by IntelliForge AI">
          <p className="madeby__text">
            Made by{" "}
            <a
              href="https://intelliforge.tech"
              target="_blank"
              rel="noopener noreferrer"
            >
              IntelliForge AI
            </a>
            &mdash; a Hyderabad-based AI agent and workflow automation studio
            aligned with India&rsquo;s Bharat AI Mission. Chronicle is the{" "}
            <strong>second product</strong> in a portfolio of nine shipped AI
            apps. Founder:{" "}
            <a
              href="https://girishbhiremath.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Girish Hiremath
            </a>
            &mdash; 14+ years across compliance, banking, pharma, telecom,
            and IoT, now formalising the AI side with an M.Tech in Data
            Science &amp; AI at IIIT Dharwad.
          </p>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <div className="landing__footer-brand">
            <strong>Chronicle</strong>
            <span> &middot; AI research copilot for founders</span>
          </div>
          <div className="landing__footer-links">
            <Link href="/about">About</Link>
            <a
              href="https://intelliforge.tech"
              target="_blank"
              rel="noopener noreferrer"
            >
              IntelliForge AI
            </a>
            <a
              href="https://github.com/gengirish/multi-agent-deep-research"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <Link href="/research">Live demo</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
