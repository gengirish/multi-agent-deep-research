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
import base64
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
)
# Split and strip whitespace from each origin
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

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

# Image text extraction with LLM enhancement
class ImageExtractionRequest(BaseModel):
    image: str  # Base64 encoded image
    ocr_text: Optional[str] = None  # Optional OCR extracted text for reference

class ImageExtractionResponse(BaseModel):
    extracted_text: str
    confidence: str
    status: str
    error: Optional[str] = None

@app.post("/api/extract-image-text", response_model=ImageExtractionResponse)
async def extract_image_text(req: ImageExtractionRequest):
    """
    Extract and clean text from image using LLM (GPT-4 Vision via OpenRouter)
    This combines OCR with AI vision for better accuracy
    """
    logger.info("Image text extraction request received")

    try:
        # Initialize OpenAI client with OpenRouter
        openrouter_api_key = os.getenv("OPEN_ROUTER_KEY")
        if not openrouter_api_key:
            raise HTTPException(status_code=500, detail="OpenRouter API key not configured")

        client = OpenAI(
            api_key=openrouter_api_key,
            base_url="https://openrouter.ai/api/v1"
        )

        # Prepare the prompt for GPT-4 Vision
        system_prompt = """You are an expert at extracting and cleaning text from images.
Your task is to:
1. Carefully read any text visible in the image
2. Extract the complete text accurately
3. Correct any obvious OCR errors if OCR text is provided
4. Format it as a clear, concise research query
5. If the text is unclear or multiple interpretations exist, choose the most logical one

Return ONLY the cleaned, corrected text - nothing else."""

        user_prompt = "Please extract and clean the text from this image."

        if req.ocr_text:
            user_prompt += f"\n\nFor reference, OCR detected: '{req.ocr_text}'\n\nPlease verify and correct this if needed based on what you see in the image."

        # Call GPT-4 Vision API
        response = client.chat.completions.create(
            model="gpt-4o",  # GPT-4 with vision capabilities
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": req.image,  # Base64 data URL
                                "detail": "high"  # Use high detail for better text recognition
                            }
                        }
                    ]
                }
            ],
            max_tokens=500,
            temperature=0.1  # Low temperature for more accurate extraction
        )

        # Extract the cleaned text
        extracted_text = response.choices[0].message.content.strip()

        # Determine confidence based on whether OCR was provided
        confidence = "high" if req.ocr_text and extracted_text.lower() != req.ocr_text.lower() else "verified"

        logger.info(f"Successfully extracted text: {extracted_text[:100]}...")

        return ImageExtractionResponse(
            extracted_text=extracted_text,
            confidence=confidence,
            status="success"
        )

    except Exception as e:
        logger.error(f"Image text extraction failed: {e}")
        return ImageExtractionResponse(
            extracted_text="",
            confidence="low",
            status="error",
            error=str(e)
        )

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
            "extract_image_text": "/api/extract-image-text"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    # Disable reload in production
    reload = os.getenv("ENVIRONMENT", "development") == "development"
    uvicorn.run(app, host="0.0.0.0", port=port, reload=reload)

