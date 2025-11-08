"""
Contextual Retriever Agent
Pulls data from research papers, news articles, reports, and APIs.
Uses Tavily Search API for AI-optimized web search.
"""

import logging
import os
from typing import Dict, List, Any
from langchain_community.utilities import ArxivAPIWrapper
from tavily import TavilyClient
from dotenv import load_dotenv

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
    
    def retrieve(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """
        Retrieve information from multiple sources.
        
        Args:
            query: Research query
            max_results: Maximum results per source type
            
        Returns:
            Dictionary with sources from web, papers, and news
        """
        logger.info(f"Retriever: Searching for '{query}'")
        
        results = {
            "web": [],
            "papers": [],
            "news": [],
            "query": query
        }
        
        # Web search using Tavily
        if self.tavily:
            try:
                web_query = f"{query} recent"
                tavily_results = self.tavily.search(
                    query=web_query,
                    max_results=max_results,
                    search_depth="advanced",  # Use advanced search for better results
                    include_answer=True,  # Include AI-generated answer
                    include_raw_content=False  # Don't include full page content
                )
                results["web"] = self._parse_tavily_results(tavily_results, max_results)
                logger.info(f"Retriever: Found {len(results['web'])} web sources via Tavily")
            except Exception as e:
                logger.error(f"Tavily web search failed: {e}")
                results["web"] = []
        
        # ArXiv papers
        if self.arxiv:
            try:
                paper_results = self.arxiv.run(query)
                results["papers"] = self._parse_arxiv_results(paper_results, max_results)
                logger.info(f"Retriever: Found {len(results['papers'])} papers")
            except Exception as e:
                logger.error(f"ArXiv search failed: {e}")
                results["papers"] = []
        
        # News search using Tavily (with news filter)
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
                results["news"] = self._parse_tavily_results(tavily_news, max_results)
                logger.info(f"Retriever: Found {len(results['news'])} news sources via Tavily")
            except Exception as e:
                logger.error(f"Tavily news search failed: {e}")
                results["news"] = []
        
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

