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

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from orchestration.coordinator import ResearchWorkflow

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Multi-Agent AI Deep Researcher API",
    description="API for multi-agent research system",
    version="1.0.0"
)

# Enable CORS for React frontend
# Get allowed origins from environment or use defaults
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
).split(",")

# Add Vercel production URL if provided
vercel_url = os.getenv("VERCEL_URL")
if vercel_url:
    allowed_origins.append(f"https://{vercel_url}")
    allowed_origins.append(f"http://{vercel_url}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize workflow
workflow = ResearchWorkflow()

# Request/Response models
class ResearchRequest(BaseModel):
    query: str

class ResearchResponse(BaseModel):
    sources: Dict[str, Any]
    analysis: Dict[str, Any]
    insights: Dict[str, Any]
    report: str
    status: str
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    message: str

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
        # Run workflow
        result = workflow.run(req.query)
        
        # Format response
        return ResearchResponse(
            sources=result.get("sources", {}),
            analysis=result.get("analysis", {}),
            insights=result.get("insights", {}),
            report=result.get("report", ""),
            status="success" if not result.get("error") else "error",
            error=result.get("error", "")
        )
    
    except Exception as e:
        logger.error(f"Research failed: {e}")
        return ResearchResponse(
            sources={},
            analysis={},
            insights={},
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
                lambda: workflow.run(req.query)
            )
            
            # Extract results
            retrieval_result = full_result.get("sources", {})
            analysis_result = full_result.get("analysis", {})
            insights_result = full_result.get("insights", {})
            report_result = full_result.get("report", "")
            
            # Final result
            final_result = {
                "sources": retrieval_result,
                "analysis": analysis_result,
                "insights": insights_result,
                "report": report_result,
                "status": "success"
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
            "demo_queries": "/api/demo-queries"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    # Disable reload in production
    reload = os.getenv("ENVIRONMENT", "development") == "development"
    uvicorn.run(app, host="0.0.0.0", port=port, reload=reload)

