"""
Enhanced Source Credibility Agent
Multi-dimensional credibility evaluation with provenance tracking.
"""

import logging
import re
from typing import Dict, Any, List, Tuple
from datetime import datetime
from langchain_core.prompts import ChatPromptTemplate
from utils.llm_config import create_analyzer_llm, ANALYZER_MODEL

logger = logging.getLogger(__name__)


class EnhancedCredibilityAgent:
    """
    Multi-dimensional credibility evaluation.
    
    Dimensions:
    1. Authority: Domain reputation, author credentials
    2. Recency: Publication/update date
    3. Corroboration: Cross-referenced with other sources
    4. Bias: Political/commercial bias indicators
    5. Methodology: Evidence quality, citations
    """
    
    def __init__(self, model: str = None, temperature: float = None):
        """Initialize enhanced credibility agent."""
        if model or temperature is not None:
            from utils.llm_config import create_llm
            self.llm = create_llm(
                model=model or ANALYZER_MODEL,
                temperature=temperature if temperature is not None else 0.2,
                max_tokens=2000
            )
        else:
            self.llm = create_analyzer_llm()
        
        if not self.llm:
            logger.warning("LLM not available. Using heuristics only.")
    
    def evaluate_multi_dimensional(self, sources: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate sources with multi-dimensional credibility scoring.
        
        Returns:
            Enhanced credibility results with dimensions, provenance, and cross-validation
        """
        logger.info("Enhanced Credibility: Starting multi-dimensional evaluation")
        
        all_sources = self._flatten_sources(sources)
        evaluated_sources = []
        
        for source in all_sources:
            evaluation = self._evaluate_source_dimensions(source)
            evaluated_sources.append(evaluation)
        
        # Cross-validate sources (find corroborations and contradictions)
        cross_validation = self._cross_validate_sources(evaluated_sources)
        
        # Calculate aggregate metrics
        aggregate = self._calculate_aggregate_metrics(evaluated_sources)
        
        logger.info(f"Enhanced Credibility: Evaluated {len(evaluated_sources)} sources")
        
        return {
            "sources": evaluated_sources,
            "cross_validation": cross_validation,
            "aggregate_metrics": aggregate,
            "metadata": {
                "evaluation_timestamp": datetime.now().isoformat(),
                "total_sources": len(evaluated_sources),
                "dimensions": ["authority", "recency", "corroboration", "bias", "methodology"]
            }
        }
    
    def _flatten_sources(self, sources: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Flatten sources from categorized dict to list."""
        all_sources = []
        
        for source_type in ["web", "papers", "news"]:
            if source_type in sources:
                for source in sources[source_type]:
                    source["_type"] = source_type
                    all_sources.append(source)
        
        return all_sources
    
    def _evaluate_source_dimensions(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate a single source across all dimensions."""
        dimensions = {
            "authority": self._score_authority(source),
            "recency": self._score_recency(source),
            "corroboration": 0.5,  # Will be updated during cross-validation
            "bias": self._score_bias(source),
            "methodology": self._score_methodology(source)
        }
        
        # Calculate composite score (weighted average)
        weights = {
            "authority": 0.30,
            "recency": 0.15,
            "corroboration": 0.25,
            "bias": 0.15,
            "methodology": 0.15
        }
        
        composite_score = sum(
            dimensions[dim] * weights[dim] for dim in dimensions.keys()
        )
        
        # Determine overall level
        if composite_score >= 0.8:
            level = "High"
        elif composite_score >= 0.6:
            level = "Medium"
        elif composite_score >= 0.4:
            level = "Low"
        else:
            level = "Very Low"
        
        return {
            "source": source,
            "dimensions": dimensions,
            "composite_score": round(composite_score, 3),
            "level": level,
            "provenance": self._track_provenance(source),
            "citation_key": self._generate_citation_key(source)
        }
    
    def _score_authority(self, source: Dict[str, Any]) -> float:
        """Score based on domain authority and author credentials."""
        score = 0.5
        url = source.get("url", "").lower()
        
        # Academic domains (highest authority)
        if any(d in url for d in [".edu", ".ac.", "arxiv.org", "scholar.google"]):
            score = 0.9
        # Government domains
        elif ".gov" in url:
            score = 0.85
        # Top-tier news
        elif any(d in url for d in ["reuters.com", "bbc.com", "ap.org", "npr.org"]):
            score = 0.75
        # Research institutions
        elif any(d in url for d in ["nature.com", "science.org", "ieee.org"]):
            score = 0.85
        # Blogs/personal sites
        elif any(d in url for d in [".blogspot", ".wordpress", "medium.com"]):
            score = 0.3
        # Social media
        elif any(d in url for d in ["twitter.com", "facebook.com", "reddit.com"]):
            score = 0.2
        
        # Author boost for papers
        if source.get("authors") and len(source.get("authors", "")) > 5:
            score = min(1.0, score + 0.1)
        
        return round(score, 3)
    
    def _score_recency(self, source: Dict[str, Any]) -> float:
        """Score based on publication/update date."""
        # Extract date from source (if available)
        pub_date = source.get("published_date") or source.get("date")
        
        if not pub_date:
            return 0.5  # Unknown recency
        
        try:
            # Parse date (assuming ISO format or similar)
            if isinstance(pub_date, str):
                date = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
            else:
                date = pub_date
            
            # Calculate age in days
            age_days = (datetime.now(date.tzinfo) - date).days
            
            # Scoring based on age
            if age_days < 30:
                return 0.95  # < 1 month: very recent
            elif age_days < 180:
                return 0.80  # < 6 months: recent
            elif age_days < 365:
                return 0.65  # < 1 year: fairly recent
            elif age_days < 730:
                return 0.50  # < 2 years: somewhat dated
            else:
                return 0.30  # > 2 years: dated
        except Exception as e:
            logger.debug(f"Failed to parse date: {e}")
            return 0.5
    
    def _score_bias(self, source: Dict[str, Any]) -> float:
        """Score neutrality (1.0 = neutral, lower = more biased)."""
        score = 0.7  # Assume moderate neutrality
        
        url = source.get("url", "").lower()
        title = source.get("title", "").lower()
        
        # Known neutral sources
        if any(d in url for d in ["reuters.com", "ap.org", "nature.com", "science.org"]):
            score = 0.9
        
        # Academic papers (typically neutral)
        if source.get("_type") == "paper":
            score = 0.85
        
        # Detect bias indicators in title
        bias_keywords = [
            "shocking", "you won't believe", "must see", "conspiracy",
            "mainstream media", "fake news", "exclusive", "breaking"
        ]
        
        if any(keyword in title for keyword in bias_keywords):
            score -= 0.2
        
        return max(0.0, min(1.0, round(score, 3)))
    
    def _score_methodology(self, source: Dict[str, Any]) -> float:
        """Score based on evidence quality and citations."""
        score = 0.5
        
        # Papers have strong methodology by default
        if source.get("_type") == "paper":
            score = 0.8
            # Boost if has many citations (not currently tracked, placeholder)
            if source.get("citations"):
                score = min(1.0, score + 0.1)
        
        # Check for evidence indicators in content
        content = (source.get("snippet") or source.get("summary") or "").lower()
        
        evidence_indicators = ["study", "research", "data", "analysis", "peer-reviewed"]
        if any(indicator in content for indicator in evidence_indicators):
            score += 0.15
        
        # Check for methodology issues
        if any(word in content for word in ["anecdotal", "reportedly", "allegedly"]):
            score -= 0.1
        
        return max(0.0, min(1.0, round(score, 3)))
    
    def _cross_validate_sources(self, evaluated_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Cross-validate sources to find corroborations and contradictions.
        
        Returns:
            Cross-validation results
        """
        # Group sources by topic/claim (simplified: use title similarity)
        clusters = self._cluster_similar_sources(evaluated_sources)
        
        corroborations = []
        contradictions = []
        
        for cluster in clusters:
            if len(cluster) >= 2:
                # Sources on similar topic
                corroborations.append({
                    "sources": [s["citation_key"] for s in cluster],
                    "count": len(cluster),
                    "topic": cluster[0]["source"].get("title", "")[:60]
                })
        
        # Update corroboration scores
        for source_eval in evaluated_sources:
            # Count how many other sources discuss similar topic
            similar_count = sum(
                1 for cluster in clusters 
                for s in cluster 
                if s["citation_key"] == source_eval["citation_key"]
            )
            
            if similar_count > 1:
                # Boost corroboration score based on similar count
                source_eval["dimensions"]["corroboration"] = min(
                    1.0, 
                    0.5 + (similar_count - 1) * 0.15
                )
            else:
                source_eval["dimensions"]["corroboration"] = 0.3  # Not corroborated
        
        return {
            "corroborations": corroborations,
            "contradictions": contradictions,
            "cross_reference_count": len(corroborations)
        }
    
    def _cluster_similar_sources(self, sources: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Cluster sources by title similarity (simple heuristic)."""
        # Simple clustering by shared keywords
        clusters = []
        processed = set()
        
        for i, source in enumerate(sources):
            if i in processed:
                continue
            
            cluster = [source]
            title1 = source["source"].get("title", "").lower()
            words1 = set(re.findall(r'\w+', title1))
            
            for j, other in enumerate(sources[i+1:], start=i+1):
                if j in processed:
                    continue
                
                title2 = other["source"].get("title", "").lower()
                words2 = set(re.findall(r'\w+', title2))
                
                # If > 40% word overlap, consider similar
                overlap = len(words1 & words2)
                union = len(words1 | words2)
                
                if union > 0 and overlap / union > 0.4:
                    cluster.append(other)
                    processed.add(j)
            
            if len(cluster) > 0:
                clusters.append(cluster)
                processed.add(i)
        
        return clusters
    
    def _track_provenance(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """Track source provenance for citation purposes."""
        return {
            "url": source.get("url", ""),
            "title": source.get("title", ""),
            "source_type": source.get("_type", "unknown"),
            "retrieved_at": datetime.now().isoformat(),
            "authors": source.get("authors", ""),
            "publisher": self._extract_publisher(source.get("url", "")),
            "access_method": "direct_fetch"  # Could be: API, web_scrape, etc.
        }
    
    def _extract_publisher(self, url: str) -> str:
        """Extract publisher/domain from URL."""
        if not url:
            return "Unknown"
        
        # Extract domain
        match = re.search(r'https?://([^/]+)', url)
        if match:
            domain = match.group(1)
            # Remove www prefix
            domain = re.sub(r'^www\.', '', domain)
            return domain
        
        return "Unknown"
    
    def _generate_citation_key(self, source: Dict[str, Any]) -> str:
        """Generate unique citation key for source."""
        title = source.get("title", "")
        # Extract first author last name if available
        authors = source.get("authors", "")
        author_key = ""
        
        if authors:
            # Try to extract first last name
            match = re.search(r'(\w+)', authors)
            if match:
                author_key = match.group(1)[:10]
        
        # Generate key: AuthorYYYY or TitleYYYY
        year = datetime.now().year
        if author_key:
            return f"{author_key}{year}"
        else:
            # Use first significant word from title
            words = re.findall(r'\w+', title)
            title_key = next((w for w in words if len(w) > 3), "Source")
            return f"{title_key[:10]}{year}"
    
    def _calculate_aggregate_metrics(self, evaluated_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate aggregate metrics across all dimensions."""
        if not evaluated_sources:
            return {
                "average_composite": 0.5,
                "dimension_averages": {},
                "high_credibility_count": 0,
                "total_sources": 0
            }
        
        # Calculate average for each dimension
        dimension_averages = {}
        for dim in ["authority", "recency", "corroboration", "bias", "methodology"]:
            scores = [s["dimensions"][dim] for s in evaluated_sources]
            dimension_averages[dim] = round(sum(scores) / len(scores), 3)
        
        # Calculate overall metrics
        composite_scores = [s["composite_score"] for s in evaluated_sources]
        high_count = sum(1 for s in evaluated_sources if s["level"] == "High")
        medium_count = sum(1 for s in evaluated_sources if s["level"] == "Medium")
        low_count = sum(1 for s in evaluated_sources if s["level"] in ["Low", "Very Low"])
        
        return {
            "average_composite": round(sum(composite_scores) / len(composite_scores), 3),
            "dimension_averages": dimension_averages,
            "high_credibility_count": high_count,
            "medium_credibility_count": medium_count,
            "low_credibility_count": low_count,
            "total_sources": len(evaluated_sources),
            "credibility_distribution": {
                "high": high_count,
                "medium": medium_count,
                "low": low_count
            }
        }
