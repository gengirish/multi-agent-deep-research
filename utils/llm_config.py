"""
LLM Configuration Utility
Handles OpenRouter API setup for all agents
"""

import os
import logging
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# OpenRouter API endpoint
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPEN_ROUTER_KEY")

# Default models (OpenRouter format)
DEFAULT_MODEL = "openai/gpt-4-turbo-preview"
ANALYZER_MODEL = "openai/gpt-4-turbo-preview"
INSIGHT_MODEL = "openai/gpt-4-turbo-preview"
REPORT_MODEL = "openai/gpt-4-turbo-preview"


def create_llm(model: str = None, temperature: float = 0.3, base_url: str = None) -> ChatOpenAI:
    """
    Create a ChatOpenAI instance configured for OpenRouter.
    
    Args:
        model: Model name (OpenRouter format, e.g., "openai/gpt-4-turbo-preview")
        temperature: Temperature setting
        base_url: Optional custom base URL (defaults to OpenRouter)
        
    Returns:
        ChatOpenAI instance or None if API key not configured
    """
    api_key = OPENROUTER_API_KEY
    
    # Validate API key
    if not api_key or api_key == "your_openrouter_key_here":
        logger.warning("OPEN_ROUTER_KEY not found. LLM will not be available.")
        logger.warning("Please set OPEN_ROUTER_KEY in your .env file. Get your key from: https://openrouter.ai/keys")
        return None
    
    # Clean API key (remove quotes and whitespace)
    api_key = api_key.strip().strip('"').strip("'")
    
    # Validate API key format (OpenRouter keys start with 'sk-or-')
    if not api_key.startswith('sk-or-'):
        logger.warning(f"OPEN_ROUTER_KEY format appears invalid. OpenRouter keys should start with 'sk-or-'")
        logger.warning(f"Current key starts with: {api_key[:10]}...")
        logger.warning("Please verify your API key at: https://openrouter.ai/keys")
        # Continue anyway in case format changes
    
    # Use provided model or default
    model_name = model or DEFAULT_MODEL
    
    # Use OpenRouter base URL if not specified
    base_url = base_url or OPENROUTER_BASE_URL
    
    try:
        llm = ChatOpenAI(
            model=model_name,
            temperature=temperature,
            openai_api_key=api_key,
            openai_api_base=base_url,
            default_headers={
                "HTTP-Referer": "https://github.com/yourusername/multi-agent-researcher",  # Optional
                "X-Title": "Multi-Agent AI Deep Researcher"  # Optional
            }
        )
        logger.info(f"LLM initialized with model: {model_name}")
        return llm
    except Exception as e:
        logger.error(f"Failed to initialize LLM: {e}")
        logger.error("Please check:")
        logger.error("1. OPEN_ROUTER_KEY is set correctly in .env file")
        logger.error("2. API key is valid and active at https://openrouter.ai/keys")
        logger.error("3. API key has sufficient credits")
        return None


def is_llm_available() -> bool:
    """Check if LLM is available (API key configured)."""
    return OPENROUTER_API_KEY is not None and OPENROUTER_API_KEY != "your_openrouter_key_here"

