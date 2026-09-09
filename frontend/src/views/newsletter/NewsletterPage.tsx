import React from "react";
import Link from "next/link";
import { TopNav } from "../../components/TopNav";
import { SubscribeForm } from "../../components/SubscribeForm";
import "./NewsletterPage.css";

/**
 * Dedicated public sign-up page for the Chronicle briefing.
 *
 * This exists because `/#newsletter` — an anchor into the landing page — is a
 * poor destination for the places a newsletter actually gets shared: a
 * LinkedIn featured link, a bio link, the footer CTA of the briefing itself.
 * Those readers arrive already interested in the newsletter, and the landing
 * page makes them scroll past a product pitch to find the form. Here the form
 * is the page, above the fold, with the pitch underneath for anyone who wants
 * it.
 *
 * A server component: nothing here is interactive except `SubscribeForm`,
 * which brings its own "use client".
 */

const WHAT_YOU_GET = [
  {
    title: "Cited, not vibes",
    body:
      "Every figure in every issue links to the source it came from. If a claim can't be sourced, it doesn't ship.",
  },
  {
    title: "Contradictions flagged",
    body:
      "When sources disagree on a number, the briefing says so instead of quietly averaging them into a figure you can't defend.",
  },
  {
    title: "Written for the room",
    body:
      "Market sizing, competitive moves, and funding activity, framed the way you'd need to present them to a partner or an investor.",
  },
];

const FAQ = [
  {
    q: "How often does it arrive?",
    a: "Only when there's a briefing worth sending. No filler issues to keep a schedule.",
  },
  {
    q: "Do I need a Chronicle account?",
    a: "No. Subscribing is just an email address, and running research on the site needs no signup either.",
  },
  {
    q: "How do I get off the list?",
    a: "One click, from the footer of any issue. No login, no confirmation loop, no retention flow.",
  },
];

export const NewsletterPage: React.FC = () => {
  return (
    <div className="nl">
      <div className="nl__bg" aria-hidden="true">
        <div className="nl__glow" />
      </div>

      <TopNav variant="landing" />

      <main className="nl__main" id="main-content">
        <section className="nl__hero">
          <p className="nl__eyebrow">The Chronicle briefing</p>
          <h1 className="nl__title">
            Market research you can
            <br />
            <span className="nl__title-accent">put in front of a partner.</span>
          </h1>
          <p className="nl__lede">
            Founder-grade research briefings &mdash; market sizing, competitive
            intel, and funding activity &mdash; with every claim cited to a
            source you can click. Written by the same multi-agent pipeline that
            powers Chronicle.
          </p>

          <div className="nl__form-wrap">
            <SubscribeForm
              variant="panel"
              source="newsletter"
              showName
              title="Subscribe free"
              subtitle="One confirmation click and you're in. No spam, and one-click unsubscribe on every issue."
              footnote={
                <>
                  We&rsquo;ll email you a confirmation link first &mdash; your
                  address does nothing until you click it. We never sell or
                  share the list.
                </>
              }
            />
          </div>
        </section>

        <section className="nl__section" aria-label="What you get">
          <h2 className="nl__h2">What lands in your inbox</h2>
          <div className="nl__cards">
            {WHAT_YOU_GET.map((item) => (
              <article className="nl__card" key={item.title}>
                <h3 className="nl__card-title">{item.title}</h3>
                <p className="nl__card-body">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="nl__section nl__section--split" aria-label="How issues are made">
          <div>
            <h2 className="nl__h2">Where the issues come from</h2>
            <p className="nl__body">
              Each briefing is a Chronicle research run: five specialized agents
              search the web, papers, and news; score every source for
              credibility; flag the places sources disagree; and assemble a
              cited report. The newsletter is that report, edited down to what
              matters.
            </p>
            <p className="nl__body">
              You can run the same pipeline yourself on any market, free and
              without an account.
            </p>
            <Link href="/research" className="nl__link-btn">
              Try a research query &rarr;
            </Link>
          </div>
          <ol className="nl__pipeline">
            <li>
              <strong>Retriever</strong> pulls candidate sources from web
              search, news, and arXiv.
            </li>
            <li>
              <strong>Enricher</strong> adds dates, source types, and sentiment.
            </li>
            <li>
              <strong>Analyzer</strong> scores credibility and surfaces
              contradictions.
            </li>
            <li>
              <strong>Insight</strong> builds the trend and hypothesis chain.
            </li>
            <li>
              <strong>Reporter</strong> writes the cited briefing.
            </li>
          </ol>
        </section>

        <section className="nl__section" aria-label="Frequently asked questions">
          <h2 className="nl__h2">Before you subscribe</h2>
          <dl className="nl__faq">
            {FAQ.map((item) => (
              <div className="nl__faq-item" key={item.q}>
                <dt className="nl__faq-q">{item.q}</dt>
                <dd className="nl__faq-a">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="nl__footer">
          <p>
            Chronicle by{" "}
            <a
              href="https://intelliforge.tech"
              target="_blank"
              rel="noopener noreferrer"
            >
              IntelliForge AI
            </a>{" "}
            &middot; <Link href="/">Home</Link> &middot;{" "}
            <Link href="/about">About</Link> &middot;{" "}
            <Link href="/research">Run research</Link>
          </p>
        </footer>
      </main>
    </div>
  );
};
