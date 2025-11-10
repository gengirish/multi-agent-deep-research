"""
Source Credibility Agent
Evaluates the credibility and trustworthiness of sources.
"""

import logging
import re
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from utils.llm_config import create_analyzer_llm, ANALYZER_MODEL, TEMPERATURES

logger = logging.getLogger(__name__)


class SourceCredibilityAgent:
    """Evaluates source credibility using LLM analysis and heuristics."""
    
    def __init__(self, model: str = None, temperature: float = None):
        """Initialize the credibility agent with LLM via OpenRouter.
        
        Uses Claude 3.5 Sonnet for strong reasoning capabilities.
        Default temperature: 0.3 (low creativity, consistent evaluation).
        """
        # Use optimized analyzer LLM with Claude 3.5 Sonnet
        if model or temperature is not None:
            from utils.llm_config import create_llm
            self.llm = create_llm(
                model=model or ANALYZER_MODEL,
                temperature=temperature if temperature is not None else 0.3,
                max_tokens=1500
            )
        else:
            self.llm = create_analyzer_llm()
        if not self.llm:
            logger.warning("OpenRouter API key not found. Credibility will use heuristics only.")
    
    def evaluate_credibility(self, sources: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate credibility of all sources.
        
        Args:
            sources: Dictionary with web, papers, and news sources
            
        Returns:
            Credibility assessment for each source with scores and reasoning
        """
        logger.info("Credibility Agent: Starting credibility evaluation")
        
        credibility_results = {
            "web": [],
            "papers": [],
            "news": [],
            "overall_credibility": {}
        }
        
        # Evaluate web sources
        if sources.get("web"):
            for source in sources["web"]:
                credibility = self._evaluate_source(
                    source, 
                    source_type="web",
                    title=source.get("title", ""),
                    url=source.get("url", ""),
                    snippet=source.get("snippet", "")
                )
                credibility_results["web"].append(credibility)
        
        # Evaluate papers (usually high credibility)
        if sources.get("papers"):
            for source in sources["papers"]:
                credibility = self._evaluate_source(
                    source,
                    source_type="paper",
                    title=source.get("title", ""),
                    url=source.get("url", ""),
                    authors=source.get("authors", ""),
                    summary=source.get("summary", "")
                )
                credibility_results["papers"].append(credibility)
        
        # Evaluate news sources
        if sources.get("news"):
            for source in sources["news"]:
                credibility = self._evaluate_source(
                    source,
                    source_type="news",
                    title=source.get("title", ""),
                    url=source.get("url", ""),
                    snippet=source.get("snippet", "")
                )
                credibility_results["news"].append(credibility)
        
        # Calculate overall credibility metrics
        credibility_results["overall_credibility"] = self._calculate_overall_metrics(credibility_results)
        
        logger.info(f"Credibility Agent: Evaluated {len(credibility_results['web']) + len(credibility_results['papers']) + len(credibility_results['news'])} sources")
        
        return credibility_results
    
    def _evaluate_source(self, source: Dict[str, Any], source_type: str, **kwargs) -> Dict[str, Any]:
        """Evaluate a single source's credibility.
        
        Args:
            source: Source dictionary
            source_type: Type of source (web, paper, news)
            **kwargs: Additional source information
            
        Returns:
            Credibility assessment with score, level, and reasoning
        """
        # Heuristic-based evaluation first
        heuristic_score = self._heuristic_credibility(source, source_type, **kwargs)
        
        # LLM-based evaluation if available
        if self.llm:
            llm_score = self._llm_credibility(source, source_type, **kwargs)
            # Combine heuristic and LLM scores (weighted average)
            final_score = (heuristic_score * 0.4) + (llm_score * 0.6)
        else:
            llm_score = None
            final_score = heuristic_score
        
        # Determine credibility level
        if final_score >= 0.8:
            level = "High"
        elif final_score >= 0.6:
            level = "Medium"
        elif final_score >= 0.4:
            level = "Low"
        else:
            level = "Very Low"
        
        return {
            "source": source,
            "score": round(final_score, 2),
            "level": level,
            "heuristic_score": round(heuristic_score, 2),
            "llm_score": round(llm_score, 2) if llm_score is not None else None,
            "reasoning": self._generate_reasoning(source, source_type, final_score, level),
            "source_type": source_type
        }
    
    def _heuristic_credibility(self, source: Dict[str, Any], source_type: str, **kwargs) -> float:
        """Calculate credibility score using heuristics.
        
        Args:
            source: Source dictionary
            source_type: Type of source
            **kwargs: Additional information
            
        Returns:
            Credibility score (0.0 to 1.0)
        """
        score = 0.5  # Base score
        
        url = kwargs.get("url", source.get("url", ""))
        title = kwargs.get("title", source.get("title", ""))
        
        # URL-based heuristics
        if url:
            # Academic domains
            if any(domain in url.lower() for domain in [".edu", ".ac.", "arxiv.org", "pubmed", "scholar"]):
                score += 0.3
            # Reputable news domains
            elif any(domain in url.lower() for domain in [".gov", "reuters", "bbc", "ap.org", "npr.org"]):
                score += 0.2
            # Questionable domains
            elif any(domain in url.lower() for domain in [".blogspot", ".wordpress", "medium.com"]):
                score -= 0.1
            # Social media
            elif any(domain in url.lower() for domain in ["twitter.com", "facebook.com", "reddit.com"]):
                score -= 0.2
        
        # Source type adjustments
        if source_type == "paper":
            score += 0.2  # Papers are generally more credible
        elif source_type == "news":
            score += 0.1  # News sources are somewhat credible
        elif source_type == "web":
            score += 0.0  # Web sources vary widely
        
        # Title quality (presence of title)
        if title and len(title) > 10:
            score += 0.05
        
        # Authors (for papers)
        if kwargs.get("authors") and len(kwargs["authors"]) > 0:
            score += 0.1
        
        # Normalize to 0.0-1.0 range
        return max(0.0, min(1.0, score))
    
    def _llm_credibility(self, source: Dict[str, Any], source_type: str, **kwargs) -> float:
        """Calculate credibility score using LLM.
        
        Args:
            source: Source dictionary
            source_type: Type of source
            **kwargs: Additional information
            
        Returns:
            Credibility score (0.0 to 1.0)
        """
        if not self.llm:
            return 0.5
        
        # Format source information
        source_info = f"""
Source Type: {source_type}
Title: {kwargs.get('title', source.get('title', 'N/A'))}
URL: {kwargs.get('url', source.get('url', 'N/A'))}
"""
        
        if kwargs.get("authors"):
            source_info += f"Authors: {kwargs.get('authors')}\n"
        
        if kwargs.get("snippet"):
            source_info += f"Content: {kwargs.get('snippet', '')[:500]}\n"
        elif kwargs.get("summary"):
            source_info += f"Summary: {kwargs.get('summary', '')[:500]}\n"
        
        # Create credibility evaluation prompt
        prompt = ChatPromptTemplate.from_template("""
You are a source credibility evaluator. Evaluate the credibility of the following source on a scale of 0.0 to 1.0.

Consider:
1. Domain reputation (.edu, .gov, reputable news sites = higher)
2. Source type (academic papers > news > web articles)
3. Author credentials (if available)
4. Content quality indicators
5. Potential bias or agenda

SOURCE INFORMATION:
{source_info}

Respond with ONLY a number between 0.0 and 1.0 representing the credibility score.
Do not include any explanation, just the number.
""")
        
        try:
            chain = prompt | self.llm
            response = chain.invoke({"source_info": source_info})
            
            response_text = response.content if hasattr(response, 'content') else str(response)
            
            # Extract number from response
            numbers = re.findall(r'\d+\.?\d*', response_text)
            if numbers:
                score = float(numbers[0])
                # Normalize to 0.0-1.0 range
                return max(0.0, min(1.0, score / 10.0 if score > 1.0 else score))
            else:
                logger.warning(f"Could not extract credibility score from LLM response: {response_text}")
                return 0.5
        except Exception as e:
            logger.error(f"LLM credibility evaluation failed: {e}")
            return 0.5
    
    def _generate_reasoning(self, source: Dict[str, Any], source_type: str, 
                           score: float, level: str) -> str:
        """Generate human-readable reasoning for credibility assessment.
        
        Args:
            source: Source dictionary
            source_type: Type of source
            score: Credibility score
            level: Credibility level
            
        Returns:
            Reasoning text
        """
        url = source.get("url", "")
        reasoning_parts = []
        
        # URL-based reasoning
        if url:
            if ".edu" in url.lower() or ".ac." in url.lower():
                reasoning_parts.append("Academic domain (.edu/.ac)")
            elif ".gov" in url.lower():
                reasoning_parts.append("Government domain (.gov)")
            elif any(domain in url.lower() for domain in ["arxiv.org", "pubmed", "scholar"]):
                reasoning_parts.append("Academic database")
            elif any(domain in url.lower() for domain in ["reuters", "bbc", "ap.org"]):
                reasoning_parts.append("Reputable news source")
            elif any(domain in url.lower() for domain in [".blogspot", ".wordpress", "medium.com"]):
                reasoning_parts.append("Blog/self-published content")
        
        # Source type reasoning
        if source_type == "paper":
            reasoning_parts.append("Peer-reviewed research paper")
        elif source_type == "news":
            reasoning_parts.append("News article")
        elif source_type == "web":
            reasoning_parts.append("Web article")
        
        # Score-based reasoning
        if score >= 0.8:
            reasoning_parts.append("High credibility indicators")
        elif score >= 0.6:
            reasoning_parts.append("Moderate credibility")
        elif score < 0.4:
            reasoning_parts.append("Low credibility indicators")
        
        return "; ".join(reasoning_parts) if reasoning_parts else f"Credibility level: {level}"
    
    def _calculate_overall_metrics(self, credibility_results: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overall credibility metrics.
        
        Args:
            credibility_results: Credibility results for all sources
            
        Returns:
            Overall metrics
        """
        all_scores = []
        for source_type in ["web", "papers", "news"]:
            for cred in credibility_results.get(source_type, []):
                all_scores.append(cred.get("score", 0.5))
        
        if not all_scores:
            return {
                "average_score": 0.5,
                "high_credibility_count": 0,
                "medium_credibility_count": 0,
                "low_credibility_count": 0,
                "total_sources": 0
            }
        
        high_count = sum(1 for cred in credibility_results.get("web", []) + 
                         credibility_results.get("papers", []) + 
                         credibility_results.get("news", []) 
                         if cred.get("level") == "High")
        
        medium_count = sum(1 for cred in credibility_results.get("web", []) + 
                          credibility_results.get("papers", []) + 
                          credibility_results.get("news", []) 
                          if cred.get("level") == "Medium")
        
        low_count = sum(1 for cred in credibility_results.get("web", []) + 
                       credibility_results.get("papers", []) + 
                       credibility_results.get("news", []) 
                       if cred.get("level") in ["Low", "Very Low"])
        
        return {
            "average_score": round(sum(all_scores) / len(all_scores), 2),
            "high_credibility_count": high_count,
            "medium_credibility_count": medium_count,
            "low_credibility_count": low_count,
            "total_sources": len(all_scores)
        }

