"""
FastAPI Backend Server
Multi-Agent AI Deep Researcher API
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import sys
import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from orchestration.coordinator import ResearchWorkflow
from utils.agent_logger import get_agent_logger

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    # Startup
    logger.info("FastAPI app starting up...")
    logger.info("App is ready to accept requests")
    # Don't initialize workflow here - let it initialize lazily on first use
    yield
    # Shutdown (if needed)
    logger.info("FastAPI app shutting down...")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Multi-Agent AI Deep Researcher API",
    description="API for multi-agent research system",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for React frontend
# Get allowed origins from environment or use defaults
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
)
# Split and strip whitespace and trailing slashes from each origin
allowed_origins = [origin.strip().rstrip('/') for origin in allowed_origins_str.split(",") if origin.strip()]

# Add Vercel production URL if provided
vercel_url = os.getenv("VERCEL_URL")
if vercel_url:
    vercel_url = vercel_url.strip()
    allowed_origins.append(f"https://{vercel_url}")
    allowed_origins.append(f"http://{vercel_url}")

# Log allowed origins for debugging
logger.info(f"CORS allowed origins: {allowed_origins}")

# Configure CORS middleware
# Use allow_origin_regex to handle all Vercel preview and production deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Matches all Vercel deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize workflow lazily to prevent crashes on startup
# Workflow will be initialized on first use
_workflow_instance = None

def get_workflow(use_enhanced_credibility: bool = False, enable_rag: bool = False):
    """Get or create workflow instance (lazy initialization).
    
    Args:
        use_enhanced_credibility: Use multi-dimensional credibility scoring
        enable_rag: Enable RAG for semantic search
    """
    global _workflow_instance
    if _workflow_instance is None:
        try:
            _workflow_instance = ResearchWorkflow(
                use_enhanced_credibility=use_enhanced_credibility,
                enable_rag=enable_rag
            )
        except Exception as e:
            logger.error(f"Failed to initialize workflow: {e}")
            raise
    return _workflow_instance

# Request/Response models
class ResearchRequest(BaseModel):
    query: str

class ResearchResponse(BaseModel):
    sources: Dict[str, Any]
    analysis: Dict[str, Any]
    insights: Dict[str, Any]
    credibility: Dict[str, Any]  # Source credibility assessments
    report: str
    status: str
    error: Optional[str] = None
    conversation: Optional[Dict[str, Any]] = None  # Agent conversation log

class HealthResponse(BaseModel):
    status: str
    message: str

class ConversationListItem(BaseModel):
    id: str
    timestamp: str
    query: Optional[str] = None
    file_name: str
    file_size: int

class ConversationDetail(BaseModel):
    id: str
    data: Dict[str, Any]

# Helper function to get log directory
def get_log_dir() -> Path:
    """Get the agent conversation log directory."""
    return Path(os.getenv("AGENT_LOG_DIR", "logs/agent_conversations"))

# Health check endpoint
@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return HealthResponse(status="ok", message="API is running")

# Demo queries endpoint
@app.get("/api/demo-queries")
async def demo_queries():
    """Return pre-cached demo queries"""
    return {
        "queries": [
            "Latest developments in quantum computing 2024",
            "Current state of AI safety research and regulations",
            "Emerging climate technology solutions 2024"
        ]
    }

# Main research endpoint
@app.post("/api/research", response_model=ResearchResponse)
async def research(req: ResearchRequest):
    """
    Main research endpoint - processes query through multi-agent workflow
    """
    logger.info(f"Research request received: {req.query}")
    
    try:
        # Run workflow (lazy initialization)
        result = get_workflow().run(req.query)
        
        # Format response (conversation data is already included in result)
        return ResearchResponse(
            sources=result.get("sources", {}),
            analysis=result.get("analysis", {}),
            insights=result.get("insights", {}),
            credibility=result.get("credibility", {}),
            report=result.get("report", ""),
            status="success" if not result.get("error") else "error",
            error=result.get("error", ""),
            conversation=result.get("conversation")
        )
    
    except Exception as e:
        logger.error(f"Research failed: {e}")
        return ResearchResponse(
            sources={},
            analysis={},
            insights={},
            credibility={},
            report=f"Error: {str(e)}",
            status="error",
            error=str(e)
        )

# Streaming endpoint for real-time progress
@app.post("/api/research-stream")
async def research_stream(req: ResearchRequest):
    """
    Streaming endpoint for real-time progress updates
    Uses Server-Sent Events (SSE)
    """
    logger.info(f"Streaming research request: {req.query}")
    
    async def event_generator():
        try:
            # Stage 1: Retrieval
            yield f"data: {json.dumps({'stage': 'retrieval', 'message': '🔍 Retrieving sources from web, papers, and news...', 'progress': 20})}\n\n"
            await asyncio.sleep(0.5)
            
            # Stage 2: Enrichment
            yield f"data: {json.dumps({'stage': 'enrichment', 'message': '📊 Enriching sources with metadata and sentiment...', 'progress': 40})}\n\n"
            await asyncio.sleep(0.3)
            
            # Run full workflow in background
            # We'll simulate stages but run the full workflow
            full_result = await asyncio.to_thread(
                lambda: get_workflow().run(req.query)
            )
            
            # Extract results
            retrieval_result = full_result.get("sources", {})
            analysis_result = full_result.get("analysis", {})
            insights_result = full_result.get("insights", {})
            credibility_result = full_result.get("credibility", {})
            report_result = full_result.get("report", "")
            
            # Final result (conversation data is already included in full_result)
            final_result = {
                "sources": retrieval_result,
                "analysis": analysis_result,
                "insights": insights_result,
                "credibility": credibility_result,
                "report": report_result,
                "status": "success",
                "conversation": full_result.get("conversation")
            }
            
            yield f"data: {json.dumps({'stage': 'complete', 'message': '✅ Research complete!', 'progress': 100, 'data': final_result})}\n\n"
        
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"data: {json.dumps({'stage': 'error', 'message': f'Error: {str(e)}', 'progress': 0})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Conversation history endpoints
@app.get("/api/conversations", response_model=List[ConversationListItem])
async def list_conversations(limit: int = 50, offset: int = 0):
    """
    List saved research conversation logs.
    Returns conversations sorted by most recent first.
    """
    log_dir = get_log_dir()
    if not log_dir.exists():
        logger.warning(f"Log directory does not exist: {log_dir}")
        return []
    
    try:
        # Get all conversation files sorted by modification time (newest first)
        files = sorted(
            [p for p in log_dir.glob("conversation_*.json") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        
        items: List[ConversationListItem] = []
        for p in files[offset: offset + limit]:
            try:
                # Read minimal data to extract summary
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Extract query from first entry
                query_text = None
                conv = data.get("conversation", [])
                if conv and isinstance(conv, list) and len(conv) > 0:
                    first = conv[0]
                    # First entry created by AgentLogger.start_conversation
                    if first.get("type") == "query":
                        query_text = first.get("content")
                
                # Extract ID and timestamp
                query_id = data.get("query_id") or p.stem.replace("conversation_", "")
                
                items.append(ConversationListItem(
                    id=query_id,
                    timestamp=query_id,  # timestamp is embedded in the ID
                    query=query_text,
                    file_name=p.name,
                    file_size=p.stat().st_size
                ))
            except Exception as e:
                logger.warning(f"Failed to summarize log {p.name}: {e}")
                continue
        
        logger.info(f"Retrieved {len(items)} conversation(s) from {len(files)} total")
        return items
    
    except Exception as e:
        logger.error(f"Failed to list conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to list conversations")


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str):
    """
    Get detailed conversation log by ID.
    Returns the full conversation data including all agent interactions.
    """
    log_dir = get_log_dir()
    
    # Allow both raw ID and full filename
    candidates = [
        log_dir / f"conversation_{conversation_id}.json",
        log_dir / conversation_id  # in case full filename was passed
    ]
    
    file_path = next((p for p in candidates if p.exists()), None)
    if not file_path:
        logger.warning(f"Conversation not found: {conversation_id}")
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        logger.info(f"Retrieved conversation: {conversation_id}")
        return ConversationDetail(
            id=data.get("query_id") or conversation_id,
            data=data
        )
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse conversation data")
    except Exception as e:
        logger.error(f"Failed to read conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load conversation")


# Export endpoint
@app.get("/api/export/{conversation_id}/markdown")
async def export_markdown(conversation_id: str):
    """
    Export conversation report as Markdown file
    """
    log_dir = get_log_dir()
    
    # Find the conversation file
    candidates = [
        log_dir / f"conversation_{conversation_id}.json",
        log_dir / conversation_id
    ]
    
    file_path = next((p for p in candidates if p.exists()), None)
    if not file_path:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Extract conversation details
        conv = data.get("conversation", [])
        query_entry = next((e for e in conv if e.get("type") == "query"), None)
        query_text = query_entry.get("content", "N/A") if query_entry else "N/A"
        
        # Find final result
        final_entry = next((e for e in conv if e.get("type") == "final_result"), None)
        report_content = ""
        
        if final_entry and final_entry.get("content"):
            content = final_entry["content"]
            if isinstance(content, dict):
                report_content = content.get("report", "No report available")
            else:
                report_content = str(content)
        
        # Build markdown
        markdown = f"""# Research Report

## Query
{query_text}

## Session ID
{conversation_id}

## Generated On
{data.get("query_id", "N/A")}

---

## Report

{report_content}

---

*Generated by Multi-Agent AI Deep Researcher*
"""
        
        from fastapi.responses import Response
        return Response(
            content=markdown,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="research_{conversation_id}.md"'
            }
        )
    
    except Exception as e:
        logger.error(f"Failed to export conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export conversation")


# Semantic search endpoint (RAG)
class SearchRequest(BaseModel):
    query: str
    n_results: int = 10
    credibility_threshold: float = 0.6

@app.post("/api/search")
async def semantic_search(req: SearchRequest):
    """
    Semantic search across indexed research sources using RAG.
    Requires RAG to be enabled in workflow.
    """
    try:
        from utils.rag_service import get_rag_service
        rag = get_rag_service()
        
        results = rag.hybrid_search(
            query=req.query,
            n_results=req.n_results,
            credibility_threshold=req.credibility_threshold
        )
        
        return {
            "query": req.query,
            "results": results,
            "total_indexed": rag.get_stats().get("total_documents", 0),
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(e)}"
        )


# RAG stats endpoint
@app.get("/api/rag/stats")
async def rag_stats():
    """Get RAG vector store statistics."""
    try:
        from utils.rag_service import get_rag_service
        rag = get_rag_service()
        return rag.get_stats()
    except Exception as e:
        logger.error(f"Failed to get RAG stats: {e}")
        return {"total_documents": 0, "error": str(e)}


# Voice input endpoint (for future Wispr Flow integration)
@app.post("/api/research-voice")
async def research_voice(audio_data: bytes = None):
    """
    Accept voice input and convert to text query.
    Currently a placeholder for future Wispr Flow integration.
    
    In production, this would:
    1. Accept audio data from frontend
    2. Use Wispr Flow API or Web Speech API to convert to text
    3. Return the transcribed query
    """
    logger.info("Voice endpoint called (placeholder)")
    return {
        "message": "Voice endpoint ready for Wispr Flow integration",
        "status": "success",
        "note": "Currently using Web Speech API in frontend. Backend integration pending."
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Multi-Agent AI Deep Researcher API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/health",
            "research": "/api/research",
            "research_stream": "/api/research-stream",
            "research_voice": "/api/research-voice",
            "demo_queries": "/api/demo-queries",
            "conversations_list": "/api/conversations",
            "conversation_detail": "/api/conversations/{conversation_id}",
            "export_markdown": "/api/export/{conversation_id}/markdown",
            "semantic_search": "/api/search",
            "rag_stats": "/api/rag/stats"
        }
    }

# Removed if __name__ == "__main__" block
# Railway should use Procfile: uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
# This prevents Railway from using python main.py which causes the uvicorn warning
