import React from "react";
import Link from "next/link";

export const AboutPage: React.FC = () => {
  return (
    <div className="page-container" style={{ paddingTop: "1rem" }}>
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          lineHeight: 1.7,
          textAlign: "left",
          padding: "0 1rem",
        }}
      >
        <h1 style={{ marginBottom: "0.25rem", fontSize: "1.6rem", fontWeight: 700 }}>About Chronicle</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          AI research copilot for founders.
        </p>

        <h3 style={{ marginTop: "2.5rem" }}>Why we built it</h3>
        <p>
          Founders run the same five research questions over and over &mdash;
          market sizing, competitive landscape, customer discovery,
          regulatory intel, recent funding activity. The current options are
          all bad: ChatGPT hallucinates citations, Perplexity gives you a
          paragraph instead of a report, and a real analyst costs $5k a week.
        </p>
        <p>
          Chronicle runs the question through a multi-agent pipeline that
          searches the web, papers, and news; scores every source for
          credibility; flags contradictions between them; and assembles a
          cited report you can paste straight into a deck or send to YC.
        </p>

        <h3 style={{ marginTop: "2.5rem" }}>Verified results</h3>
        <p>
          From a published case study with an analytics firm:{" "}
          <strong>10&times; faster research output</strong>,{" "}
          <strong>80% cost reduction per report</strong>, and{" "}
          <strong>fully automated citation generation</strong>. Source:{" "}
          <a
            href="https://intelliforge.tech"
            target="_blank"
            rel="noopener noreferrer"
          >
            IntelliForge AI case studies
          </a>
          .
        </p>

        <h3 style={{ marginTop: "2.5rem" }}>What makes it different</h3>
        <ul>
          <li>
            <strong>It shows its work.</strong> You watch five agents run in
            real time. Every claim links back to a source. Every source has
            a credibility score. Contradictions get surfaced, not hidden.
          </li>
          <li>
            <strong>It&rsquo;s built around founder workflows.</strong> The
            starter queries are real founder questions, not&nbsp;&ldquo;latest
            developments in quantum computing.&rdquo;
          </li>
          <li>
            <strong>It&rsquo;s open and honest about its stack.</strong>{" "}
            LangGraph orchestration, OpenRouter for model access, Tavily and
            Perplexity for search, ArXiv for papers. Nothing proprietary
            that you can&rsquo;t inspect.
          </li>
        </ul>

        <h3 style={{ marginTop: "2.5rem" }}>The agents</h3>
        <ul>
          <li>
            <strong>Retriever</strong> &mdash; pulls candidate sources from
            web search, news APIs, and arXiv.
          </li>
          <li>
            <strong>Enricher</strong> &mdash; adds metadata, dates, source
            type classifications, and sentiment.
          </li>
          <li>
            <strong>Analyzer</strong> &mdash; scores credibility, surfaces
            contradictions, extracts the load-bearing claims.
          </li>
          <li>
            <strong>Insight generator</strong> &mdash; turns claims into
            hypotheses, trends, and reasoning chains.
          </li>
          <li>
            <strong>Report builder</strong> &mdash; compiles everything into
            a structured, cited markdown report.
          </li>
        </ul>

        <h3 style={{ marginTop: "2.5rem" }}>Who built it</h3>
        <p>
          Chronicle is built by{" "}
          <a
            href="https://intelliforge.tech"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>IntelliForge AI</strong>
          </a>{" "}
          &mdash; a Hyderabad-based AI agent and workflow automation studio
          aligned with India&rsquo;s Bharat AI Mission, with a stated focus
          on shipping production AI in weeks, not months. Chronicle is the{" "}
          <strong>second of nine shipped AI products</strong> in the
          IntelliForge portfolio.
        </p>
        <p>
          Founder:{" "}
          <a
            href="https://girishbhiremath.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>Girish Hiremath</strong>
          </a>{" "}
          &mdash; software engineer with 14+ years of enterprise experience
          across compliance, banking, pharma, telecom, and IoT, including
          Fortune 500 clients. Currently formalising the AI training with an{" "}
          <strong>M.Tech in Data Science &amp; AI at IIIT Dharwad</strong>{" "}
          &mdash; an Institute of National Importance &mdash; alongside
          shipping AI-native SaaS products under the IntelliForge AI
          umbrella.
        </p>

        <h3 style={{ marginTop: "2.5rem" }}>Status</h3>
        <p>
          Live, open-source, free to try. Frontend on Vercel (Next.js 14),
          backend on Fly.io (FastAPI + LangGraph). Installable as a PWA. No
          signup required to run a query.
        </p>

        <p style={{ marginTop: "2.5rem" }}>
          <Link href="/research">&rarr; Try a query</Link> &nbsp; &middot;
          &nbsp;
          <a
            href="https://intelliforge.tech"
            target="_blank"
            rel="noopener noreferrer"
          >
            IntelliForge AI
          </a>
          &nbsp; &middot; &nbsp;
          <a
            href="https://github.com/gengirish/multi-agent-deep-research"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
};
