# Changelog

## Picture Input Feature + UI Improvements (Latest - 2025-11-11)

### 🎉 Major Features Added

#### 1. Picture Input Mode
- **New Tab**: Added "Picture" tab alongside "Type" and "Speak"
- **Camera Access**: Live webcam preview with paper detection indicator
- **Hybrid AI Processing**:
  - Stage 1 (0-45%): OCR text extraction using Tesseract.js
  - Stage 2 (45-100%): GPT-4 Vision enhancement via OpenRouter
- **Image Preprocessing**:
  - 2x image scaling for better resolution
  - Grayscale conversion with adaptive thresholding
  - Noise reduction using median filter
  - High contrast black/white conversion
- **Smart Corrections**: AI automatically fixes OCR mistakes
  - Example: "aaa L Tadia on dlekal STAGE" → "India on global STAGE"
- **Progress Tracking**: Two-stage progress bar with stage descriptions
- **User Guidance**: Tips for optimal capture results

#### 2. Analysis Findings Improvements
- **Before**: Repeated headings (SUMMARY, SUMMARY, CREDIBILITY, CREDIBILITY...)
- **After**: Single headings with organized bullet points
- **Grouping**: Related items consolidated under each heading
- **Visual Design**:
  - Green-themed bullet points
  - Underlined section headings
  - Subtle borders between items
  - Proper spacing and padding

#### 3. Scrollable Result Cards
- **Vertical Scrolling**: Added to all three result sections
  - 📚 Sources Retrieved
  - 📊 Analysis Findings
  - 💡 Emerging Trends
- **Max Height**: 400px per card with smooth scrolling
- **Custom Scrollbar**: Styled scrollbar for better UX
- **Independent Scrolling**: Each card scrolls separately
- **Smooth Animation**: Expand/collapse with fade-in effect

### 🔧 Technical Implementation

#### Frontend Changes
1. **New Component**: `PictureInput.tsx`
   - Camera access using MediaDevices API
   - Paper detection using edge detection algorithm
   - Image capture to canvas
   - Integration with backend API

2. **Updated Component**: `ResearchResults.tsx`
   - Changed analysis rendering from individual items to grouped format
   - Added `analysisGroups` data structure
   - Implemented bullet list rendering

3. **New Styles**: `PictureInput.css`
   - Camera interface styling
   - Progress indicators
   - Processing stages
   - AI badge and labels

4. **Updated Styles**: `ResearchResults.css`
   - Added `.card-content` scrolling (max-height: 400px)
   - Custom scrollbar styling
   - New `.analysis-group` styles
   - Bullet point formatting

#### Backend Changes
1. **New Endpoint**: `POST /api/extract-image-text`
   - Accepts base64 image + optional OCR text
   - Uses GPT-4o Vision via OpenRouter
   - Returns cleaned, corrected text
   - Includes confidence level

2. **Updated**: `backend/main.py`
   - Added `ImageExtractionRequest` model
   - Added `ImageExtractionResponse` model
   - Integrated OpenAI client with OpenRouter
   - Added image text extraction logic

#### Dependencies Added
- `tesseract.js` - OCR processing in browser
- No backend dependencies (reused existing OpenAI/OpenRouter setup)

### 📊 Impact

**User Experience**:
- ✅ Three input methods: Type, Speak, Picture
- ✅ Much better OCR accuracy with AI enhancement
- ✅ Cleaner, more organized analysis display
- ✅ Better content management with scrolling
- ✅ Professional, polished interface

**Performance**:
- OCR processing: ~3-5 seconds (client-side)
- AI enhancement: ~2-3 seconds (server-side)
- Total processing: ~5-8 seconds for image to query

**Code Quality**:
- Modular component design
- Proper error handling and fallbacks
- TypeScript type safety
- Responsive CSS with animations

### 🐛 Bug Fixes
- Fixed OCR text extraction accuracy issues
- Resolved repeated headings in analysis display
- Fixed content overflow in result cards

### 📝 Documentation Updates
- Created `PROJECT_CONTEXT.md` - Complete project overview
- Created `.clinerules` - Quick reference for Claude Code
- Updated `CHANGELOG.md` - This file!

---

## Model Selection Optimization

### Changes Made

1. **Optimized Model Configuration**
   - **Retriever Agent**: Changed from GPT-4-Turbo to GPT-4o Mini (96% cost savings)
   - **Analyzer Agent**: Changed from GPT-4-Turbo to Claude 3.5 Sonnet (better reasoning, 50% cost savings)
   - **Insight Agent**: Changed from GPT-4-Turbo to GPT-4o (faster, cheaper)
   - **Report Agent**: Changed from GPT-4-Turbo to Claude 3.5 Haiku (98% cost savings)

2. **Temperature Optimization**
   - Retriever: 0.1 (low creativity, consistent formatting)
   - Analyzer: 0.5 (balanced reasoning)
   - Insight: 0.7 (high creativity for pattern matching)
   - Report: 0.2 (low creativity, consistent formatting)

3. **Code Updates**
   - Updated `utils/llm_config.py` with optimized model configurations
   - Added helper functions: `create_retriever_llm()`, `create_analyzer_llm()`, `create_insight_llm()`, `create_report_llm()`
   - Updated all agent files to use optimized models and temperatures
   - Added environment variable support for model and temperature overrides

### Benefits

- **84% Cost Reduction**: From ~$2.80 to ~$0.46 per research query (10 queries demo)
- **Better Quality**: Claude 3.5 Sonnet provides superior reasoning for analysis tasks
- **Faster Execution**: Smaller models are faster, improving user experience
- **Intelligent Selection**: Matches model capability to task cognitive load requirements

### Model Configuration

**New Default Models (OpenRouter format):**
```python
RETRIEVER_MODEL = "openai/gpt-4o-mini"
ANALYZER_MODEL = "anthropic/claude-3-5-sonnet"
INSIGHT_MODEL = "openai/gpt-4o"
REPORT_MODEL = "anthropic/claude-3-5-haiku"
```

**Note:** If specific model versions are needed, check available models at https://openrouter.ai/models

### Cost Comparison

**Before (All GPT-4-Turbo):**
- 10 queries × ~$0.28 = $2.80

**After (Optimized Models):**
- Retriever (GPT-4o Mini): 10 × $0.005 = $0.05
- Analyzer (Claude Sonnet): 10 × $0.03 = $0.30
- Insight (GPT-4o): 10 × $0.01 = $0.10
- Report (Haiku): 10 × $0.001 = $0.01
- **Total: $0.46 (84% savings)**

---

## OpenRouter Integration Update

### Changes Made

1. **LLM Configuration**
   - Created `utils/llm_config.py` for centralized LLM configuration
   - Switched from direct OpenAI API to OpenRouter API
   - Supports multiple LLM providers through unified interface

2. **Agent Updates**
   - Updated `agents/analyzer.py` to use OpenRouter
   - Updated `agents/insight_generator.py` to use OpenRouter
   - Updated `agents/report_builder.py` to use OpenRouter
   - All agents now use `create_llm()` utility function

3. **Configuration Files**
   - Changed `.env.example` to `env.example` (OpenRouter format)
   - Updated API key from `OPENAI_API_KEY` to `OPEN_ROUTER_KEY`
   - Added model configuration in `utils/llm_config.py`

4. **Documentation**
   - Updated `README.md` with OpenRouter setup instructions
   - Updated `QUICK_START.md` with OpenRouter API key steps
   - Created `OPENROUTER_SETUP.md` with detailed setup guide
   - Updated `setup.py` to use OpenRouter
   - Updated `test_system.py` to check for OpenRouter key

### Benefits

- **Unified API**: Single API key for multiple LLM providers
- **Flexibility**: Easy to switch between models (OpenAI, Anthropic, Google, etc.)
- **Cost Effective**: OpenRouter often has better pricing
- **Reliability**: Multiple provider fallbacks
- **Access**: Some models available without waitlists

### Migration Guide

**Before:**
```bash
OPENAI_API_KEY=sk-your-key-here
```

**After:**
```bash
OPEN_ROUTER_KEY=sk-or-your-key-here
```

Get your key from: https://openrouter.ai/keys

### Model Format

**Before:**
```python
model = "gpt-4-turbo-preview"
```

**After:**
```python
model = "openai/gpt-4-turbo-preview"  # OpenRouter format
```

### Configuration

Edit `utils/llm_config.py` to change models:
- `DEFAULT_MODEL` - Default for all agents
- `ANALYZER_MODEL` - Analysis agent
- `INSIGHT_MODEL` - Insight generation
- `REPORT_MODEL` - Report building

---

**Updated**: System now uses OpenRouter for LLM access

