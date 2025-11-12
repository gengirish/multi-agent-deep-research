"""
RAG (Retrieval-Augmented Generation) Service
Manages vector store for semantic search and context retrieval.
"""

import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path
import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)


class RAGService:
    """
    Manages Chroma vector store for semantic search.
    
    Features:
    - Store enriched sources with metadata
    - Semantic search across stored content
    - Hybrid retrieval (keyword + vector)
    - Provenance tracking
    """
    
    def __init__(self, persist_directory: str = "chroma_store"):
        """Initialize RAG service with Chroma."""
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize Chroma client
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Get or create collection
        self.collection_name = "research_sources"
        try:
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Research sources with enrichment and credibility"}
            )
            logger.info(f"RAG Service initialized with collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Failed to initialize Chroma collection: {e}")
            raise
    
    def index_sources(
        self, 
        sources: List[Dict[str, Any]], 
        query_id: str,
        credibility_data: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Index sources into vector store.
        
        Args:
            sources: List of source documents
            query_id: Research session ID
            credibility_data: Optional credibility assessments
            
        Returns:
            Number of sources indexed
        """
        if not sources:
            logger.warning("No sources to index")
            return 0
        
        documents = []
        metadatas = []
        ids = []
        
        for idx, source in enumerate(sources):
            # Generate unique ID
            doc_id = f"{query_id}_{idx}"
            
            # Extract text content
            content = self._extract_content(source)
            if not content:
                continue
            
            # Build metadata
            metadata = {
                "query_id": query_id,
                "source_type": source.get("_type", "unknown"),
                "title": source.get("title", "")[:500],  # Limit title length
                "url": source.get("url", ""),
                "timestamp": source.get("retrieved_at", ""),
                "publisher": source.get("publisher", ""),
            }
            
            # Add credibility if available
            if credibility_data:
                cred_score = self._find_credibility_score(source, credibility_data)
                if cred_score is not None:
                    metadata["credibility_score"] = cred_score
            
            documents.append(content)
            metadatas.append(metadata)
            ids.append(doc_id)
        
        # Add to collection
        try:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            logger.info(f"Indexed {len(documents)} sources for query {query_id}")
            return len(documents)
        except Exception as e:
            logger.error(f"Failed to index sources: {e}")
            return 0
    
    def semantic_search(
        self, 
        query: str, 
        n_results: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search across indexed sources.
        
        Args:
            query: Search query
            n_results: Number of results to return
            filter_metadata: Optional metadata filters
            
        Returns:
            List of relevant sources with scores
        """
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results,
                where=filter_metadata
            )
            
            # Format results
            formatted_results = []
            if results and results["documents"] and len(results["documents"]) > 0:
                for i in range(len(results["documents"][0])):
                    formatted_results.append({
                        "content": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                        "distance": results["distances"][0][i] if results["distances"] else None,
                        "id": results["ids"][0][i] if results["ids"] else None
                    })
            
            logger.info(f"Semantic search returned {len(formatted_results)} results")
            return formatted_results
        
        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return []
    
    def hybrid_search(
        self,
        query: str,
        n_results: int = 10,
        credibility_threshold: float = 0.6
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining semantic similarity and credibility filtering.
        
        Args:
            query: Search query
            n_results: Number of results
            credibility_threshold: Minimum credibility score
            
        Returns:
            Ranked and filtered results
        """
        # Semantic search with more results than needed
        semantic_results = self.semantic_search(query, n_results=n_results * 2)
        
        # Filter by credibility if available
        filtered_results = []
        for result in semantic_results:
            cred_score = result["metadata"].get("credibility_score")
            if cred_score is None or cred_score >= credibility_threshold:
                filtered_results.append(result)
        
        # Sort by distance (lower is better) and limit
        filtered_results.sort(
            key=lambda x: x.get("distance", float('inf'))
        )
        
        return filtered_results[:n_results]
    
    def get_context_for_query(
        self,
        query: str,
        max_tokens: int = 4000
    ) -> str:
        """
        Get relevant context for a query from vector store.
        
        Args:
            query: Research query
            max_tokens: Maximum tokens in context (approximate)
            
        Returns:
            Concatenated context string
        """
        # Search for relevant sources
        results = self.hybrid_search(query, n_results=10)
        
        # Build context string
        context_parts = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough estimate: 4 chars per token
        
        for result in results:
            content = result["content"]
            metadata = result["metadata"]
            
            # Format with citation
            citation = f"[{metadata.get('title', 'Source')}]({metadata.get('url', '')})"
            formatted = f"{citation}\n{content}\n\n"
            
            if total_chars + len(formatted) > max_chars:
                break
            
            context_parts.append(formatted)
            total_chars += len(formatted)
        
        return "".join(context_parts)
    
    def clear_collection(self):
        """Clear all data from collection."""
        try:
            self.client.delete_collection(self.collection_name)
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "Research sources with enrichment and credibility"}
            )
            logger.info(f"Cleared collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Failed to clear collection: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics."""
        try:
            count = self.collection.count()
            return {
                "total_documents": count,
                "collection_name": self.collection_name,
                "persist_directory": str(self.persist_directory)
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {"total_documents": 0}
    
    def _extract_content(self, source: Dict[str, Any]) -> Optional[str]:
        """Extract searchable content from source."""
        # Priority: summary > snippet > title
        content = source.get("summary") or source.get("snippet") or source.get("title")
        
        if not content:
            return None
        
        # Limit content length
        if len(content) > 5000:
            content = content[:5000]
        
        return content
    
    def _find_credibility_score(
        self, 
        source: Dict[str, Any], 
        credibility_data: Dict[str, Any]
    ) -> Optional[float]:
        """Find credibility score for a source."""
        # Search through credibility results
        for source_type in ["web", "papers", "news"]:
            if source_type in credibility_data:
                for cred in credibility_data[source_type]:
                    if cred.get("source", {}).get("url") == source.get("url"):
                        return cred.get("score") or cred.get("composite_score")
        
        return None


# Global instance
_rag_service = None


def get_rag_service() -> RAGService:
    """Get global RAG service instance."""
    global _rag_service
    if _rag_service is None:
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "chroma_store")
        _rag_service = RAGService(persist_directory=persist_dir)
    return _rag_service
