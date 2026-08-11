"""
Report Builder Agent
Compiles all insights into a structured report.
"""

import logging
from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from utils.llm_config import create_report_llm, REPORT_MODEL, TEMPERATURES, message_text
from utils.degraded import unavailable

logger = logging.getLogger(__name__)


class ReportBuilderAgent:
    """Compiles research findings into a structured markdown report."""
    
    def __init__(self, model: str = None, temperature: float = None):
        """Initialize the report builder agent with LLM via OpenRouter.
        
        Uses Claude 3.5 Haiku for fast, consistent formatting.
        Default temperature: 0.2 (low creativity, consistent formatting).
        """
        # Use optimized report LLM with Claude 3.5 Haiku
        if model or temperature is not None:
            from utils.llm_config import create_llm
            self.llm = create_llm(
                model=model or REPORT_MODEL,
                temperature=temperature if temperature is not None else TEMPERATURES["report"],
                max_tokens=4000
            )
        else:
            self.llm = create_report_llm()
        if not self.llm:
            logger.warning("OpenRouter API key not found. Report will use template.")
    
    def compile(self, query: str, sources: Dict[str, Any], 
                analysis: Dict[str, Any], insights: Dict[str, Any]) -> str:
        """
        Compile all research components into a structured report.
        
        Args:
            query: Original research query
            sources: Retrieved sources
            analysis: Analysis results
            insights: Generated insights
            
        Returns:
            Formatted markdown report
        """
        logger.info("Report Builder: Compiling final report")
        
        if not any(sources.get(channel) for channel in ("web", "papers", "news")):
            # The single most dangerous path in the pipeline: handed no sources,
            # the report model writes a fluent, confident, entirely ungrounded
            # report from its own priors — which is precisely the failure this
            # project exists to prevent. Say nothing was retrieved instead.
            logger.warning("Report Builder: no sources retrieved — refusing to generate")
            return self._no_sources_report(query, sources)

        if not self.llm:
            return self._template_report(
                query, sources, analysis, insights,
                reason="report LLM not configured",
            )
        
        # Format all data for prompt
        report_data = self._format_report_data(query, sources, analysis, insights)
        
        # Create report generation prompt
        prompt = ChatPromptTemplate.from_template("""
You are a professional research report writer. Create a comprehensive, well-structured research report based on the following information:

{report_data}

Generate a professional markdown report with the following structure:

# Research Report: [Query]

## Executive Summary
A concise 2-3 paragraph summary of the key findings.

## Key Findings
Bullet points of the most important discoveries.

## Source Analysis
Summary of sources analyzed, including credibility assessments.

## Contradictions & Validation
Discussion of any contradictory information and how it was validated.

## Insights & Recommendations
Synthesized insights, hypotheses, and trends identified.

## Sources Cited
List of all sources with URLs in proper citation format. Format sources as markdown links: [Title](URL)

Make the report professional, clear, and well-formatted in markdown.
""")
        
        try:
            chain = prompt | self.llm
            response = chain.invoke({"report_data": report_data})
            
            report = message_text(response)
            
            logger.info("Report Builder: Report compilation complete")
            
            return report
        
        except Exception as e:
            logger.error(f"Report compilation failed: {e}")
            return self._template_report(
                query, sources, analysis, insights,
                reason=f"{type(e).__name__}: {e}",
            )
    
    def _format_report_data(self, query: str, sources: Dict[str, Any],
                           analysis: Dict[str, Any], insights: Dict[str, Any]) -> str:
        """Format all data for the report generation prompt."""
        formatted = [f"RESEARCH QUERY: {query}\n"]
        
        # Sources
        formatted.append("SOURCES:")
        if sources.get("web"):
            formatted.append("Web Sources:")
            for web in sources["web"]:
                formatted.append(f"- {web.get('title', 'No title')}: {web.get('url', 'No URL')}")
        
        if sources.get("papers"):
            formatted.append("Research Papers:")
            for paper in sources["papers"]:
                formatted.append(f"- {paper.get('title', 'No title')}: {paper.get('url', 'No URL')}")
        
        if sources.get("news"):
            formatted.append("News Sources:")
            for news in sources["news"]:
                formatted.append(f"- {news.get('title', 'No title')}: {news.get('url', 'No URL')}")
                
        if sources.get("rag_context"):
            formatted.append("RAG Context Documents:")
            formatted.append(sources["rag_context"])
        
        formatted.append("\n")
        
        # Analysis
        formatted.append("ANALYSIS:")
        if analysis.get("summary"):
            formatted.append("Summary:")
            for point in analysis["summary"]:
                formatted.append(f"- {point}")
        
        if analysis.get("contradictions"):
            formatted.append("Contradictions:")
            for contradiction in analysis["contradictions"]:
                formatted.append(f"- {contradiction}")
        
        if analysis.get("credibility"):
            formatted.append("Credibility Assessment:")
            for cred in analysis["credibility"]:
                formatted.append(f"- {cred}")
        
        formatted.append("\n")
        
        # Insights
        formatted.append("INSIGHTS:")
        if insights.get("insights"):
            formatted.append("Key Insights:")
            for insight in insights["insights"]:
                formatted.append(f"- {insight}")
        
        if insights.get("hypotheses"):
            formatted.append("Hypotheses:")
            for hypothesis in insights["hypotheses"]:
                formatted.append(f"- {hypothesis}")
        
        if insights.get("trends"):
            formatted.append("Trends:")
            for trend in insights["trends"]:
                formatted.append(f"- {trend}")
        
        if insights.get("reasoning_chains"):
            formatted.append("Reasoning Chains:")
            for chain in insights["reasoning_chains"]:
                formatted.append(f"- {chain}")
        
        return "\n".join(formatted)
    
    def _no_sources_report(self, query: str, sources: Dict[str, Any]) -> str:
        """Report returned when retrieval came back empty.

        No model is called. A grounded-research tool that invents a report
        when it has nothing to ground it in is worse than one that returns
        nothing, so this states the failure and what caused it.
        """
        errors = (sources or {}).get("errors") or {}
        report = f"# Research Report: {query}\n\n"
        report += f"> {unavailable('report', 'no sources were retrieved')}\n\n"
        report += (
            "No report was generated because no sources were retrieved for this "
            "query. Producing one anyway would mean writing from the model's "
            "own priors, with nothing to cite.\n\n"
        )
        if errors:
            report += "## Retrieval failures\n\n"
            for channel, reason in errors.items():
                report += f"- **{channel}**: {reason}\n"
            report += "\n"
        report += (
            "## What to try\n\n"
            "- Check that the search providers are configured and reachable\n"
            "- Retry with a broader or differently-worded query\n"
        )
        return report

    def _template_report(self, query: str, sources: Dict[str, Any],
                        analysis: Dict[str, Any], insights: Dict[str, Any],
                        reason: str = "report LLM not configured") -> str:
        """Assemble the report deterministically when the model can't run.

        Unlike the analyzer and insight fallbacks this one is honest by
        construction — every line comes from data the pipeline actually
        produced — so it stays. It is marked so the run is still reported as
        degraded rather than passing for a model-written report.
        """
        report = f"# Research Report: {query}\n\n"
        report += f"> {unavailable('report', reason)}\n>\n"
        report += (
            "> This report was assembled directly from the retrieved sources "
            "and analysis, without the report model.\n\n"
        )
        
        report += "## Executive Summary\n\n"
        report += "This report synthesizes findings from multiple sources including web articles, research papers, and news sources. "
        report += "The analysis identifies key trends, contradictions, and insights relevant to the research query.\n\n"
        
        report += "## Key Findings\n\n"
        if analysis.get("summary"):
            for point in analysis["summary"]:
                report += f"- {point}\n"
        report += "\n"
        
        report += "## Source Analysis\n\n"
        if analysis.get("credibility"):
            report += "### Credibility Assessment\n\n"
            for cred in analysis["credibility"]:
                report += f"- {cred}\n"
        report += "\n"
        
        report += "## Contradictions & Validation\n\n"
        if analysis.get("contradictions"):
            for contradiction in analysis["contradictions"]:
                report += f"- {contradiction}\n"
        else:
            report += "No significant contradictions identified across sources.\n"
        report += "\n"
        
        report += "## Insights & Recommendations\n\n"
        if insights.get("insights"):
            report += "### Key Insights\n\n"
            for insight in insights["insights"]:
                report += f"- {insight}\n"
            report += "\n"
        
        if insights.get("hypotheses"):
            report += "### Hypotheses\n\n"
            for hypothesis in insights["hypotheses"]:
                report += f"- {hypothesis}\n"
            report += "\n"
        
        if insights.get("trends"):
            report += "### Trends\n\n"
            for trend in insights["trends"]:
                report += f"- {trend}\n"
            report += "\n"
        
        report += "## Sources Cited\n\n"
        all_sources = []
        if sources.get("web"):
            all_sources.extend([(s.get("title", "No title"), s.get("url", "")) for s in sources["web"]])
        if sources.get("papers"):
            all_sources.extend([(s.get("title", "No title"), s.get("url", "")) for s in sources["papers"]])
        if sources.get("news"):
            all_sources.extend([(s.get("title", "No title"), s.get("url", "")) for s in sources["news"]])
        
        for i, (title, url) in enumerate(all_sources, 1):
            if url:
                # Create markdown link: [Title](URL)
                report += f"{i}. [{title}]({url})\n"
            else:
                report += f"{i}. {title}\n"
            report += "\n"
        
        return report

