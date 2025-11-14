# Multi-Agent Deep Research System - Project Context

## 🎯 Project Overview
A multi-agent AI research system that uses specialized AI agents to perform deep research on any topic. Built with React (frontend) and FastAPI (backend).

## 🏗️ Architecture

### Backend (Python/FastAPI)
- **Location**: `backend/main.py`
- **Port**: 8000
- **Key Features**:
  - Multi-agent research workflow (Retriever, Analyzer, Insight Generator, Report Builder)
  - LLM-enhanced image text extraction using GPT-4 Vision
  - Streaming research progress updates
  - Uses OpenRouter for LLM access (Claude, GPT-4)

### Frontend (React/TypeScript/Vite)
- **Location**: `frontend/src/`
- **Port**: 5173
- **Key Features**:
  - Three input modes: Type, Speak (voice), Picture (camera + OCR + AI)
  - Real-time research progress tracking
  - Metrics visualization with charts
  - Text-to-speech for research reports
  - Scrollable results with grouped analysis findings

## 🔑 Key Components

### Input Methods
1. **Type** (`ResearchForm.tsx`): Traditional text input
2. **Speak** (`VoiceInput.tsx`): Web Speech API for voice input
3. **Picture** (`PictureInput.tsx`):
   - Camera access with paper detection
   - Hybrid OCR (Tesseract.js) + GPT-4 Vision
   - Image preprocessing for better accuracy
   - Two-stage processing with progress indicators

### Research Flow
```
User Query → Multi-Agent System → Results
             ├─ Retriever Agent (sources)
             ├─ Data Enrichment Agent
             ├─ Analyzer Agent (findings)
             ├─ Insight Generator (trends)
             └─ Report Builder (final report)
```

### Results Display (`ResearchResults.tsx`)
- **Scrollable Cards**: Max 400px height with custom scrollbar
- **Grouped Analysis**: Consolidated headings with bullet points
- **Three Sections**:
  - 📚 Sources Retrieved
  - 📊 Analysis Findings (grouped by category)
  - 💡 Emerging Trends
- **Full Report**: Markdown-rendered with TTS support

## 🛠️ Recent Major Features Added

### Picture Input Feature (Latest)
- **Webcam Integration**: Live camera feed with paper detection
- **Hybrid AI Processing**:
  1. OCR extraction using Tesseract.js (45% of progress)
  2. GPT-4 Vision enhancement for accuracy (50-100%)
- **Smart Corrections**: AI automatically fixes OCR mistakes
- **Example**: "aaa L Tadia on dlekal STAGE" → "India on global STAGE"

### Analysis Findings Improvements
- **Before**: Repeated headings (SUMMARY, SUMMARY, CREDIBILITY, CREDIBILITY...)
- **After**: Single headings with bullet points
- **Scrollable**: Each section scrolls independently

## 🔧 Tech Stack
- **Frontend**: React, TypeScript, Vite, Axios, Tesseract.js, ReactMarkdown
- **Backend**: FastAPI, LangChain, LangGraph, OpenRouter, OpenAI
- **AI Models**:
  - Claude 3.5 Sonnet (analysis)
  - GPT-4o (vision, insights)
  - Claude 3.5 Haiku (reports)
  - Tesseract.js (OCR)

## 🔐 Environment Variables
- `OPEN_ROUTER_KEY`: OpenRouter API key (required)
- `TAVILY_API_KEY`: Optional for web search
- `PERPLEXITY_API_KEY`: Optional fallback

## 🚀 How to Run
```bash
# Backend
source venv/Scripts/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm run dev
```

## 📝 Important Implementation Details

### Picture Input Processing Flow
1. Camera capture → Canvas preprocessing
2. Image scaling (2x) + grayscale conversion
3. Adaptive thresholding + noise reduction
4. OCR extraction (Tesseract.js)
5. Backend API call to `/api/extract-image-text`
6. GPT-4 Vision analyzes image + OCR text
7. Returns cleaned, corrected query

### Analysis Findings Data Structure
```typescript
analysisGroups: {
  summary: ["point 1", "point 2", ...],
  credibility: ["source 1", "source 2", ...],
  key_claims: ["claim 1", "claim 2", ...],
  contradictions: ["item 1", ...]
}
```

### Card Content Scrolling
- Max height: 400px
- Custom scrollbar styling
- Smooth animation on expand/collapse
- All three cards (Sources, Analysis, Insights) are independently scrollable

## 🎨 Design Patterns
- **Color Coding**: Blue (sources), Green (analysis), Purple (insights)
- **Grouped Content**: Related items under single headings
- **Inline Scrolling**: Vertical scroll within cards
- **Progress Tracking**: Stage-based with percentage indicators

## 🐛 Known Issues/Notes
- OCR accuracy depends on lighting and text clarity
- Voice input works best in Chrome/Edge
- Camera requires HTTPS in production
- Backend uses OpenRouter (no separate OpenAI key needed)

## 📚 Key Files to Know
- `frontend/src/components/ResearchForm.tsx` - Main input form with three modes
- `frontend/src/components/PictureInput.tsx` - Camera + OCR + AI vision
- `frontend/src/components/ResearchResults.tsx` - Results display with scrolling
- `backend/main.py` - FastAPI server with all endpoints
- `orchestration/coordinator.py` - Multi-agent workflow orchestration
- `agents/` - Individual agent implementations

## 🔄 Recent Changes Log
1. ✅ Added Picture input tab with camera access
2. ✅ Implemented hybrid OCR + GPT-4 Vision processing
3. ✅ Added vertical scrolling to result cards (400px max)
4. ✅ Consolidated Analysis Findings with bullet points
5. ✅ Added custom scrollbar styling
6. ✅ Two-stage processing with progress indicators

---
**Last Updated**: 2025-11-11
**Version**: 1.0.0
**Status**: Production-ready with recent enhancements
