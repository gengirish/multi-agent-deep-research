"""
Contextual Retriever Agent
Pulls data from research papers, news articles, reports, and APIs.
Uses Tavily Search API for AI-optimized web search.
"""

import logging
import os
import asyncio
from typing import Dict, List, Any
from langchain_community.utilities import ArxivAPIWrapper
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
        
        # Initialize ArXiv wrapper
        try:
            self.arxiv = ArxivAPIWrapper()
            logger.info("ArXiv wrapper initialized successfully")
        except Exception as e:
            logger.warning(f"Arxiv wrapper not available: {e}")
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
                return []
            tasks.append(empty_web())
        
        # Papers search task
        if self.arxiv:
            tasks.append(self._retrieve_papers_async(query, max_results))
        else:
            async def empty_papers():
                return []
            tasks.append(empty_papers())
        
        # News search task
        if self.tavily or self.perplexity_api_key:
            tasks.append(self._retrieve_news_async(query, max_results))
        else:
            async def empty_news():
                return []
            tasks.append(empty_news())
        
        # Execute all tasks in parallel
        web_results, papers_results, news_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle results (with error handling)
        if isinstance(web_results, Exception):
            logger.error(f"Web search failed: {web_results}")
            results["web"] = []
        else:
            results["web"] = web_results
        
        if isinstance(papers_results, Exception):
            logger.error(f"Papers search failed: {papers_results}")
            results["papers"] = []
        else:
            results["papers"] = papers_results
        
        if isinstance(news_results, Exception):
            logger.error(f"News search failed: {news_results}")
            results["news"] = []
        else:
            results["news"] = news_results
        
        logger.info(f"Retriever: Parallel search complete - Web: {len(results['web'])}, Papers: {len(results['papers'])}, News: {len(results['news'])}")
        
        return results
    
    async def _retrieve_web_async(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Retrieve web sources asynchronously."""
        return await asyncio.to_thread(self._retrieve_web_sync, query, max_results)
    
    async def _retrieve_papers_async(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Retrieve papers asynchronously."""
        return await asyncio.to_thread(self._retrieve_papers_sync, query, max_results)
    
    async def _retrieve_news_async(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Retrieve news sources asynchronously."""
        return await asyncio.to_thread(self._retrieve_news_sync, query, max_results)
    
    def _retrieve_web_sync(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Synchronous web search (runs in thread pool)."""
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
                return results
            except Exception as e:
                logger.error(f"Tavily web search failed: {e}")
                # Fallback to Perplexity
                if self.perplexity_api_key:
                    try:
                        perplexity_results = self._search_perplexity(query, max_results)
                        logger.info(f"Retriever: Fallback to Perplexity - Found {len(perplexity_results)} sources")
                        return perplexity_results
                    except Exception as e2:
                        logger.error(f"Perplexity fallback also failed: {e2}")
                        return []
                return []
        elif self.perplexity_api_key:
            try:
                perplexity_results = self._search_perplexity(query, max_results)
                logger.info(f"Retriever: Using Perplexity - Found {len(perplexity_results)} sources")
                return perplexity_results
            except Exception as e:
                logger.error(f"Perplexity search failed: {e}")
                return []
        return []
    
    def _retrieve_papers_sync(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Synchronous papers search (runs in thread pool)."""
        if self.arxiv:
            try:
                paper_results = self.arxiv.run(query)
                results = self._parse_arxiv_results(paper_results, max_results)
                logger.info(f"Retriever: Found {len(results)} papers")
                return results
            except Exception as e:
                logger.error(f"ArXiv search failed: {e}")
                return []
        return []
    
    def _retrieve_news_sync(self, query: str, max_results: int) -> List[Dict[str, Any]]:
        """Synchronous news search (runs in thread pool)."""
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
                return results
            except Exception as e:
                logger.error(f"Tavily news search failed: {e}")
                # Fallback to Perplexity for news
                if self.perplexity_api_key:
                    try:
                        news_query_perplexity = f"{query} news 2024"
                        perplexity_news = self._search_perplexity(news_query_perplexity, max_results)
                        logger.info(f"Retriever: Fallback to Perplexity for news - Found {len(perplexity_news)} sources")
                        return perplexity_news
                    except Exception as e2:
                        logger.error(f"Perplexity news fallback also failed: {e2}")
                        return []
                return []
        elif self.perplexity_api_key:
            try:
                news_query = f"{query} news 2024"
                perplexity_news = self._search_perplexity(news_query, max_results)
                logger.info(f"Retriever: Using Perplexity for news - Found {len(perplexity_news)} sources")
                return perplexity_news
            except Exception as e:
                logger.error(f"Perplexity news search failed: {e}")
                return []
        return []
    
    def _retrieve_sequential(self, query: str, max_results: int) -> Dict[str, Any]:
        """Fallback sequential retrieval (original implementation)."""
        logger.info(f"Retriever: Using sequential retrieval for '{query}'")
        
        results = {
            "web": [],
            "papers": [],
            "news": [],
            "query": query
        }
        
        # Web search
        results["web"] = self._retrieve_web_sync(query, max_results)
        
        # Papers search
        results["papers"] = self._retrieve_papers_sync(query, max_results)
        
        # News search
        results["news"] = self._retrieve_news_sync(query, max_results)
        
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
    
    def _parse_arxiv_results(self, results: str, max_results: int) -> List[Dict[str, str]]:
        """Parse ArXiv results into structured format."""
        parsed = []
        if not results:
            return parsed
        
        # ArXiv wrapper returns formatted string
        entries = results.split('\n\n')[:max_results]
        
        for entry in entries:
            lines = entry.split('\n')
            paper_entry = {
                'title': '',
                'authors': '',
                'summary': '',
                'url': ''
            }
            
            for line in lines:
                if 'Title:' in line:
                    paper_entry['title'] = line.replace('Title:', '').strip()
                elif 'Authors:' in line:
                    paper_entry['authors'] = line.replace('Authors:', '').strip()
                elif 'Summary:' in line:
                    paper_entry['summary'] = line.replace('Summary:', '').strip()
                elif 'arxiv.org' in line:
                    paper_entry['url'] = line.strip()
            
            if paper_entry['title']:
                parsed.append(paper_entry)
        
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

