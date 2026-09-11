"""
Insight Generation Agent
Suggests hypotheses or trends using reasoning chains.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from langchain_core.prompts import ChatPromptTemplate
from utils.llm_config import create_insight_llm, INSIGHT_MODEL, TEMPERATURES, message_text
from utils.degraded import unavailable

logger = logging.getLogger(__name__)


# Section headings, normalised to our keys. Models ignore the prompt's exact
# format: gpt-oss writes "**INSIGHTS**", Gemini writes "INSIGHTS:", others
# write "## Key Insights" or "1. Insights".
_SECTION_ALIASES = {
    "INSIGHTS": "insights",
    "KEY INSIGHTS": "insights",
    "HYPOTHESES": "hypotheses",
    "HYPOTHESIS": "hypotheses",
    "TRENDS": "trends",
    "KEY TRENDS": "trends",
    "REASONING CHAINS": "reasoning_chains",
    "REASONING": "reasoning_chains",
    "CHAINS": "reasoning_chains",
}

# A heading is short. This length cap is what stops a sentence that merely
# mentions trends — "- **Trend 1 – Retrieval-centric fine-tuning:** …" — from
# being mistaken for the TRENDS heading and resetting the section.
_MAX_HEADING_CHARS = 28

# Bullet markers. `\*(?=\s)` requires whitespace after the asterisk so that a
# markdown italic ("*Reasoning:* …") is read as prose rather than as a bullet,
# which is what makes the continuation branch below reachable.
_BULLET_RE = re.compile(r"^(?:[-•+\u2022]|\*(?=\s)|\d+[.)])\s*")

_HORIZONTAL_RULE_RE = re.compile(r"^\s*([-*_])\1{2,}\s*$")


# Bullet characters that rule a line out as a heading. A numeric prefix does
# not: "1. Insights" is a heading and "1. the first item" is a bullet, and the
# two are told apart by whether what follows names a section.
_LIST_MARKER_RE = re.compile(r"^(?:[-•+\u2022]|\*(?=\s))")


def _section_of(line: str) -> Optional[str]:
    """Return the section a heading line names, or None if it is not a heading."""
    text = line.strip()
    if _LIST_MARKER_RE.match(text):
        return None
    text = re.sub(r"^#{1,6}\s*", "", text)        # "## Insights"
    text = re.sub(r"^\d+[.)]\s*", "", text)      # "1. Insights"
    text = text.strip("*_` \t")                   # "**INSIGHTS**"
    # Trailing colon comes off before the parenthetical, so that
    # "Key Insights (3-5):" reduces rather than being left with the paren.
    text = text.rstrip(":").strip("*_` \t")
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text)  # "Insights (3-5)"
    text = text.rstrip(":").strip("*_` \t")
    if not text or len(text) > _MAX_HEADING_CHARS:
        return None
    return _SECTION_ALIASES.get(re.sub(r"\s+", " ", text).upper())


class InsightGenerationAgent:
    """Generates insights, hypotheses, and trends from analyzed sources."""
    
    def __init__(self, model: str = None, temperature: float = None):
        """Initialize the insight generation agent with LLM via OpenRouter.
        
        Uses GPT-4o for creative pattern matching and hypothesis generation.
        Default temperature: 0.7 (higher creativity for trends).
        """
        # Use optimized insight LLM with GPT-4o
        if model or temperature is not None:
            from utils.llm_config import create_llm
            self.llm = create_llm(
                model=model or INSIGHT_MODEL,
                temperature=temperature if temperature is not None else TEMPERATURES["insight"],
                max_tokens=1500
            )
        else:
            self.llm = create_insight_llm()
        if not self.llm:
            logger.warning(
                "No insight LLM available. Insights will be reported as "
                "unavailable rather than substituted."
            )
    
    def generate(self, analysis: Dict[str, Any], query: str) -> Dict[str, Any]:
        """
        Generate insights, hypotheses, and trends from analysis.
        
        Args:
            analysis: Analysis results from CriticalAnalysisAgent
            query: Original research query
            
        Returns:
            Insights including hypotheses, trends, and reasoning chains
        """
        logger.info("Insight Generator: Generating insights and hypotheses")
        
        if not self.llm:
            return self._unavailable("insight LLM not configured")

        if not any(
            analysis.get(key)
            for key in ("summary", "key_claims", "contradictions")
        ):
            logger.warning("Insight: no analysis to build on — skipping")
            return self._unavailable("no analysis was available to reason from")
        
        # Format analysis for prompt
        analysis_text = self._format_analysis(analysis)
        
        # Create insight generation prompt
        prompt = ChatPromptTemplate.from_template("""
You are an expert research analyst generating insights from research findings.

ORIGINAL QUERY: {query}

ANALYSIS FINDINGS:
{analysis_text}

Based on this analysis, generate:

1. **Key Insights** (3-5 insights): High-level observations that synthesize the findings
2. **Hypotheses** (2-3 hypotheses): Testable propositions based on the evidence
3. **Trends** (2-3 trends): Patterns or directions identified across sources
4. **Reasoning Chains** (2-3 chains): Logical if-then reasoning paths connecting evidence to conclusions

Format your response as:
INSIGHTS:
- Insight 1
- Insight 2
- Insight 3

HYPOTHESES:
- Hypothesis 1 (with brief reasoning)
- Hypothesis 2 (with brief reasoning)

TRENDS:
- Trend 1: Description
- Trend 2: Description

REASONING CHAINS:
- Chain 1: If [evidence] then [conclusion] because [reasoning]
- Chain 2: If [evidence] then [conclusion] because [reasoning]
""")
        
        try:
            chain = prompt | self.llm
            response = chain.invoke({
                "query": query,
                "analysis_text": analysis_text
            })
            
            insights_text = message_text(response)
            
            # Parse the response
            parsed_insights = self._parse_insights(insights_text)
            
            logger.info(f"Insight Generator: Generated {len(parsed_insights.get('insights', []))} insights")
            
            return {
                "insights": parsed_insights.get("insights", []),
                "hypotheses": parsed_insights.get("hypotheses", []),
                "trends": parsed_insights.get("trends", []),
                "reasoning_chains": parsed_insights.get("reasoning_chains", []),
                "raw_insights": insights_text
            }
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Insight generation failed: {error_msg}")
            
            # Check for authentication errors
            if "401" in error_msg or "Unauthorized" in error_msg or "User not found" in error_msg:
                logger.error("=" * 60)
                logger.error("OPENROUTER API KEY ERROR:")
                logger.error("The API key is invalid, expired, or not set correctly.")
                logger.error("")
                logger.error("Please check:")
                logger.error("1. OPEN_ROUTER_KEY is set in your .env file")
                logger.error("2. API key is correct (starts with 'sk-or-')")
                logger.error("3. API key is active at https://openrouter.ai/keys")
                logger.error("4. API key has sufficient credits")
                logger.error("5. No extra quotes or spaces in .env file")
                logger.error("")
                logger.error("Get your API key from: https://openrouter.ai/keys")
                logger.error("=" * 60)
            
            return self._unavailable(f"{type(e).__name__}: {error_msg}")
    
    def _format_analysis(self, analysis: Dict[str, Any]) -> str:
        """Format analysis results for the LLM prompt."""
        formatted = []
        
        if analysis.get("summary"):
            formatted.append("SUMMARY:")
            for point in analysis["summary"]:
                formatted.append(f"- {point}")
            formatted.append("")
        
        if analysis.get("key_claims"):
            formatted.append("KEY CLAIMS:")
            for claim in analysis["key_claims"]:
                formatted.append(f"- {claim}")
            formatted.append("")
        
        if analysis.get("contradictions"):
            formatted.append("CONTRADICTIONS:")
            for contradiction in analysis["contradictions"]:
                formatted.append(f"- {contradiction}")
            formatted.append("")
        
        if analysis.get("credibility"):
            formatted.append("CREDIBILITY ASSESSMENT:")
            for cred in analysis["credibility"]:
                formatted.append(f"- {cred}")
            formatted.append("")
        
        return "\n".join(formatted)
    
    def _parse_insights(self, insights_text: str) -> Dict[str, Any]:
        """Parse the LLM response into structured lists.

        Models do not honour the prompt's exact layout, and this parser used to
        require a literal colon (`'INSIGHTS:' in line`). The gpt-oss family
        writes `**INSIGHTS**` instead, so no section was ever entered and a
        perfectly good 4,500-character response was discarded in full — the
        stage reported "no insights could be parsed" while the model had
        answered well. Headings are now matched after stripping markdown, so
        `INSIGHTS:`, `**INSIGHTS**` and `## Key Insights` all work.
        """
        parsed: Dict[str, List[str]] = {
            "insights": [],
            "hypotheses": [],
            "trends": [],
            "reasoning_chains": [],
        }

        current_section: Optional[str] = None
        for raw_line in insights_text.split("\n"):
            line = raw_line.strip()
            if not line or _HORIZONTAL_RULE_RE.match(line):
                # Models separate sections with `---`, which starts with a
                # bullet character and would otherwise be collected as an item.
                continue

            section = _section_of(line)
            if section:
                current_section = section
                continue

            if current_section is None:
                # Preamble before the first heading ("Here are the insights:").
                continue

            bullet = _BULLET_RE.match(line)
            if bullet:
                content = line[bullet.end():].strip()
                if content:
                    parsed[current_section].append(content)
            elif parsed[current_section]:
                # An unbulleted continuation line — gpt-oss puts its
                # `*Reasoning:* …` justification on its own line under each
                # hypothesis. Attach it to the item it belongs to rather than
                # dropping it or promoting it to an item of its own.
                parsed[current_section][-1] += " " + line
            else:
                parsed[current_section].append(line)

        return parsed
    
    def _unavailable(self, reason: str) -> Dict[str, Any]:
        """Return empty, attributable insights when the model can't run.

        Empty rather than plausible — canned hypotheses like "the trend will
        continue based on current evidence" read as generated insight and
        conceal the failure that produced them.
        """
        return {
            "insights": [],
            "hypotheses": [],
            "trends": [],
            "reasoning_chains": [],
            "raw_insights": unavailable("insight", reason),
        }

