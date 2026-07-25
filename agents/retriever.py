"""
Contextual Retriever Agent
Pulls data from research papers, news articles, reports, and APIs.
Uses Tavily Search API for AI-optimized web search.
"""

import logging
import os
import asyncio
from typing import Dict, List, Any, Optional, Tuple
try:
    import arxiv as arxiv_sdk
except ImportError:  # pragma: no cover - surfaced at runtime as a channel error
    arxiv_sdk = None
from tavily import TavilyClient
from dotenv import load_dotenv
import requests

load_dotenv()

logger = logging.getLogger(__name__)


class ContextualRetrieverAgent:
    """Retrieves information from multiple sources: web, papers, and news."""
    
    def __init__(self):
        """Initialize retrieval tools."""
        # Initialize Tavily client
        tavily_api_key = os.getenv("TAVILY_API_KEY")
        if tavily_api_key and tavily_api_key != "your_tavily_api_key_here":
            try:
                self.tavily = TavilyClient(api_key=tavily_api_key)
                logger.info("Tavily search initialized successfully")
            except Exception as e:
                logger.warning(f"Tavily search not available: {e}")
                self.tavily = None
        else:
            logger.warning("TAVILY_API_KEY not found. Web search will be limited.")
            self.tavily = None
        
        # ArXiv, via the SDK directly. LangChain's ArxivAPIWrapper calls
        # Search.results(), removed in arxiv 2.2+, so the wrapper raises
        # AttributeError against any current version — which is how the paper
        # channel came to return nothing at all in production. The native
        # client also gives us entry_id as a real URL, which the wrapper's
        # formatted-string output never included, so papers can now be cited.
        if arxiv_sdk is None:
            logger.warning("arxiv package not installed. Paper search disabled.")
            self.arxiv = None
        else:
            try:
                # delay_seconds is the SDK default of 3s between *paginated*
                # requests; a single-page query pays it only on retry. Setting
                # it to 0 gets the client 429'd by arXiv.
                self.arxiv = arxiv_sdk.Client(page_size=10, num_retries=2)
                logger.info("ArXiv client initialized successfully")
            except Exception as e:
                logger.warning(f"ArXiv client not available: {e}")
                self.arxiv = None
        
        # Initialize Perplexity client (fallback search)
        perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
        if perplexity_api_key and perplexity_api_key != "your_perplexity_key_here":
            self.perplexity_api_key = perplexity_api_key
            self.perplexity_base_url = "https://api.perplexity.ai/chat/completions"
            logger.info("Perplexity search initialized successfully")
        else:
            self.perplexity_api_key = None
            self.perplexity_base_url = None
            logger.warning("PERPLEXITY_API_KEY not found. Perplexity fallback will not be available.")
    
    def retrieve(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        Retrieve information from multiple sources (parallel execution).
        
        Args:
            query: Research query
            max_results: Maximum results per source type
            
        Returns:
            Dictionary with sources from web, papers, and news
        """
        logger.info(f"Retriever: Searching for '{query}' (parallel execution)")
        
        # Run all searches in parallel using asyncio
        try:
            results = asyncio.run(self._retrieve_parallel(query, max_results))
        except Exception as e:
            logger.error(f"Parallel retrieval failed, falling back to sequential: {e}")
            # Fallback to sequential if parallel fails
            results = self._retrieve_sequential(query, max_results)
        
        return results
    
    async def _retrieve_parallel(self, query: str, max_results: int) -> Dict[str, Any]:
        """Retrieve from all sources in parallel using asyncio."""
        results = {
            "web": [],
            "papers": [],
            "news": [],
            "query": query
        }
        
        # Create tasks for parallel execution
        tasks = []
        
        # Web search task
        if self.tavily or self.perplexity_api_key:
            tasks.append(self._retrieve_web_async(query, max_results))
        else:
            async def empty_web():
                return [], "no web search provider configured"
            tasks.append(empty_web())
        
        # Papers search task
        if self.arxiv:
            tasks.append(self._retrieve_papers_async(query, max_results))
        else:
            async def empty_papers():
                return [], "arXiv client not initialized"
            tasks.append(empty_papers())
        
        # News search task
        if self.tavily or self.perplexity_api_key:
            tasks.append(self._retrieve_news_async(query, max_results))
        else:
            async def empty_news():
                return [], "no news search provider configured"
            tasks.append(empty_news())
        
        # Execute all tasks in parallel
        web_results, papers_results, news_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle results. A channel can fail three ways — the task raised, the
        # channel returned an error string, or it returned nothing at all — and
        # only the last one is legitimately "no results". Record the reason so
        # a broken channel is distinguishable from an empty one downstream.
        errors: Dict[str, str] = {}
        for channel, outcome in (
            ("web", web_results),
            ("papers", papers_results),
            ("news", news_results),
        ):
            if isinstance(outcome, Exception):
                logger.error(f"{channel} search raised: {outcome}")
                results[channel] = []
                errors[channel] = f"{type(outcome).__name__}: {outcome}"
                continue
            items, error = outcome
            results[channel] = items
            if error:
                errors[channel] = error

        if errors:
            results["errors"] = errors
        
        logger.info(f"Retriever: Parallel search complete - Web: {len(results['web'])}, Papers: {len(results['papers'])}, News: {len(results['news'])}")
        
        return results
    
    async def _retrieve_web_async(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Retrieve web sources asynchronously."""
        return await asyncio.to_thread(self._retrieve_web_sync, query, max_results)
    
    async def _retrieve_papers_async(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Retrieve papers asynchronously."""
        return await asyncio.to_thread(self._retrieve_papers_sync, query, max_results)
    
    async def _retrieve_news_async(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Retrieve news sources asynchronously."""
        return await asyncio.to_thread(self._retrieve_news_sync, query, max_results)
    
    def _retrieve_web_sync(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Synchronous web search (runs in thread pool). Returns (results, error)."""
        if self.tavily:
            try:
                web_query = f"{query} recent"
                tavily_results = self.tavily.search(
                    query=web_query,
                    max_results=max_results,
                    search_depth="advanced",
                    include_answer=True,
                    include_raw_content=False
                )
                results = self._parse_tavily_results(tavily_results, max_results)
                logger.info(f"Retriever: Found {len(results)} web sources via Tavily")
                return results, None
            except Exception as e:
                logger.error(f"Tavily web search failed: {type(e).__name__}: {e}")
                # Fallback to Perplexity
                if self.perplexity_api_key:
                    try:
                        perplexity_results = self._search_perplexity(query, max_results)
                        logger.info(f"Retriever: Fallback to Perplexity - Found {len(perplexity_results)} sources")
                        return perplexity_results, None
                    except Exception as e2:
                        logger.error(f"Perplexity fallback also failed: {e2}")
                        return [], f"Tavily: {e}; Perplexity fallback: {e2}"
                return [], f"Tavily: {type(e).__name__}: {e}"
        elif self.perplexity_api_key:
            try:
                perplexity_results = self._search_perplexity(query, max_results)
                logger.info(f"Retriever: Using Perplexity - Found {len(perplexity_results)} sources")
                return perplexity_results, None
            except Exception as e:
                logger.error(f"Perplexity search failed: {e}")
                return [], f"Perplexity: {type(e).__name__}: {e}"
        return [], "no web search provider configured (TAVILY_API_KEY / PERPLEXITY_API_KEY)"
    
    def _retrieve_papers_sync(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Synchronous papers search (runs in thread pool).

        Returns (results, error). An empty list with no error means arXiv
        genuinely had nothing; an empty list with an error means the channel
        broke, which is a different thing and must not look the same.
        """
        if not self.arxiv:
            return [], "arXiv client not initialized"
        try:
            search = arxiv_sdk.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv_sdk.SortCriterion.Relevance,
            )
            results = [
                {
                    "title": paper.title,
                    "authors": ", ".join(a.name for a in paper.authors[:5]),
                    "summary": (paper.summary or "").replace("\n", " ").strip(),
                    "url": paper.entry_id,
                    "published_date": paper.published.isoformat() if paper.published else "",
                }
                for paper in self.arxiv.results(search)
            ]
            logger.info(f"Retriever: Found {len(results)} papers")
            return results, None
        except Exception as e:
            logger.error(f"ArXiv search failed: {type(e).__name__}: {e}", exc_info=True)
            return [], f"arXiv: {type(e).__name__}: {e}"
    
    def _retrieve_news_sync(self, query: str, max_results: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Synchronous news search (runs in thread pool). Returns (results, error)."""
        if self.tavily:
            try:
                news_query = f"{query} news 2024"
                tavily_news = self.tavily.search(
                    query=news_query,
                    max_results=max_results,
                    search_depth="advanced",
                    include_answer=True,
                    include_raw_content=False
                )
                results = self._parse_tavily_results(tavily_news, max_results)
                logger.info(f"Retriever: Found {len(results)} news sources via Tavily")
                return results, None
            except Exception as e:
                logger.error(f"Tavily news search failed: {type(e).__name__}: {e}")
                # Fallback to Perplexity for news
                if self.perplexity_api_key:
                    try:
                        news_query_perplexity = f"{query} news 2024"
                        perplexity_news = self._search_perplexity(news_query_perplexity, max_results)
                        logger.info(f"Retriever: Fallback to Perplexity for news - Found {len(perplexity_news)} sources")
                        return perplexity_news, None
                    except Exception as e2:
                        logger.error(f"Perplexity news fallback also failed: {e2}")
                        return [], f"Tavily news: {e}; Perplexity fallback: {e2}"
                return [], f"Tavily news: {type(e).__name__}: {e}"
        elif self.perplexity_api_key:
            try:
                news_query = f"{query} news 2024"
                perplexity_news = self._search_perplexity(news_query, max_results)
                logger.info(f"Retriever: Using Perplexity for news - Found {len(perplexity_news)} sources")
                return perplexity_news, None
            except Exception as e:
                logger.error(f"Perplexity news search failed: {e}")
                return [], f"Perplexity news: {type(e).__name__}: {e}"
        return [], "no news search provider configured (TAVILY_API_KEY / PERPLEXITY_API_KEY)"
    
    def _retrieve_sequential(self, query: str, max_results: int) -> Dict[str, Any]:
        """Fallback sequential retrieval (original implementation)."""
        logger.info(f"Retriever: Using sequential retrieval for '{query}'")
        
        results = {
            "web": [],
            "papers": [],
            "news": [],
            "query": query
        }
        
        errors: Dict[str, str] = {}
        for channel, fetch in (
            ("web", self._retrieve_web_sync),
            ("papers", self._retrieve_papers_sync),
            ("news", self._retrieve_news_sync),
        ):
            items, error = fetch(query, max_results)
            results[channel] = items
            if error:
                errors[channel] = error

        if errors:
            results["errors"] = errors

        return results
    
    def _parse_tavily_results(self, tavily_response: Dict[str, Any], max_results: int) -> List[Dict[str, Any]]:
        """
        Parse Tavily search results into structured format.
        Tavily provides pre-structured results perfect for AI agents.
        """
        parsed = []
        if not tavily_response:
            return parsed
        
        # Extract results from Tavily response
        results_list = tavily_response.get("results", [])
        
        for result in results_list[:max_results]:
            entry = {
                "title": result.get("title", "No title"),
                "url": result.get("url", ""),
                "snippet": result.get("content", ""),  # Tavily provides parsed content
                "score": result.get("score", 0.0),  # Relevance score
                "published_date": result.get("published_date", ""),
            }
            
            # Add raw content if available (for deeper analysis)
            if result.get("raw_content"):
                entry["raw_content"] = result.get("raw_content")[:500]  # Limit size
            
            parsed.append(entry)
        
        # Include AI-generated answer if available
        if tavily_response.get("answer"):
            parsed.insert(0, {
                "title": "AI-Generated Answer",
                "url": "",
                "snippet": tavily_response.get("answer"),
                "score": 1.0,
                "published_date": "",
                "is_answer": True
            })
        
        return parsed
    
    def _search_perplexity(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """
        Search using Perplexity API as fallback.
        
        Args:
            query: Search query
            max_results: Maximum number of results
            
        Returns:
            List of parsed search results
        """
        if not self.perplexity_api_key or not self.perplexity_base_url:
            return []
        
        try:
            headers = {
                "Authorization": f"Bearer {self.perplexity_api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": "llama-3.1-sonar-large-128k-online",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that provides web search results with citations."
                    },
                    {
                        "role": "user",
                        "content": f"Search the web for: {query}. Provide {max_results} relevant sources with URLs and summaries."
                    }
                ],
                "max_tokens": 2000,
                "temperature": 0.2
            }
            
            response = requests.post(
                self.perplexity_base_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            return self._parse_perplexity_results(data, max_results)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Perplexity API request failed: {e}")
            return []
        except Exception as e:
            logger.error(f"Perplexity search error: {e}")
            return []
    
    def _parse_perplexity_results(self, perplexity_response: Dict[str, Any], max_results: int) -> List[Dict[str, Any]]:
        """
        Parse Perplexity API response into structured format.
        
        Args:
            perplexity_response: Raw Perplexity API response
            max_results: Maximum number of results to return
            
        Returns:
            List of parsed results in same format as Tavily results
        """
        parsed = []
        if not perplexity_response:
            return parsed
        
        try:
            # Extract citations from Perplexity response
            citations = perplexity_response.get("citations", [])
            content = perplexity_response.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            # Parse citations
            for i, citation in enumerate(citations[:max_results]):
                entry = {
                    "title": citation.get("title", citation.get("name", "No title")),
                    "url": citation.get("url", citation.get("link", "")),
                    "snippet": citation.get("snippet", citation.get("description", ""))[:300],
                    "score": 1.0 - (i * 0.1),  # Decreasing relevance score
                    "published_date": citation.get("published_date", citation.get("date", "")),
                }
                parsed.append(entry)
            
            # If no citations but we have content, create a summary entry
            if not parsed and content:
                parsed.append({
                    "title": "Perplexity Search Result",
                    "url": "",
                    "snippet": content[:500],
                    "score": 1.0,
                    "published_date": "",
                    "is_answer": True
                })
            
        except Exception as e:
            logger.error(f"Error parsing Perplexity results: {e}")
            # Fallback: try to extract URLs from content if citations parsing failed
            if content:
                parsed.append({
                    "title": "Perplexity Search Result",
                    "url": "",
                    "snippet": content[:500],
                    "score": 1.0,
                    "published_date": "",
                    "is_answer": True
                })
        
        return parsed

