"""
Streamlit UI for Multi-Agent AI Deep Researcher
Hackathon Demo Application
"""

from langchain_chroma import Chroma
import streamlit as st
import logging
from orchestration.coordinator import ResearchWorkflow
from utils.demo_cache import get_cached_result, cache_result
from streamlit_tts_component import text_to_speech_component
import time
from langchain_text_splitters import RecursiveCharacterTextSplitter
import tempfile, os
from langchain_community.document_loaders import PyPDFLoader, CSVLoader
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Page config
st.set_page_config(
    page_title="Multi-Agent Deep Researcher",
    page_icon="🤖",
    layout="wide"
)

def ingest_documents(uploaded_files):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    documents = []

    for uploaded_file in uploaded_files:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(uploaded_file.getvalue())
            file_path = tmp.name

        if uploaded_file.name.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
            docs = loader.load()
        elif uploaded_file.name.endswith(".csv"):
            loader = CSVLoader(file_path)
            docs = loader.load()
        else:
            st.warning(f"Unsupported file type: {uploaded_file.name}")
            continue

        for d in docs:
            for chunk in text_splitter.split_text(d.page_content):
                documents.append(Document(page_content=chunk))

    
    # Create embeddings and store in Chroma (local folder)
    embeddings = OpenAIEmbeddings(
         model=os.getenv("EMBEDDING_MODEL", "openrouter/text-embedding-3-large"),        # You can change to another embedding model
         openai_api_key=os.getenv("OPEN_ROUTER_KEY"),
         openai_api_base=os.getenv("OPENAI_BASE_URL") or "https://openrouter.ai/api/v1"
    )
    vectordb = Chroma.from_documents(documents, embeddings, persist_directory="./chroma_store")    
   
    
    return (len(documents),vectordb)

# Initialize session state
if "workflow" not in st.session_state:
    st.session_state.workflow = ResearchWorkflow()
if "results" not in st.session_state:
    st.session_state.results = None
if "current_query" not in st.session_state:
    st.session_state.current_query = ""

# Title and description
st.title("🤖 Multi-Agent AI Deep Researcher")
st.markdown("""
**An AI-powered research assistant using specialized agents for multi-source investigation.**

This system uses four specialized agents:
- 🔍 **Contextual Retriever** - Pulls data from web, papers, and news
- 📊 **Critical Analyzer** - Summarizes findings and validates sources
- 💡 **Insight Generator** - Suggests hypotheses and trends
- 📄 **Report Builder** - Compiles structured research reports
""")

# Sidebar for demo mode
with st.sidebar:
    st.header("⚙️ Settings")
    demo_mode = st.checkbox("Use Demo Mode (Cached Results)", value=False)
    
    st.markdown("---")
    st.markdown("### 📝 Demo Queries")
    demo_queries = {
        "quantum_computing": "Latest developments in quantum computing 2024",
        "ai_safety": "Current state of AI safety research and regulations",
        "climate_tech": "Emerging climate technology solutions 2024"
    }
    
    for key, query in demo_queries.items():
        if st.button(f"📌 {query[:40]}...", key=f"demo_{key}"):
            st.session_state.demo_query = query
            st.session_state.demo_key = key
            st.rerun()
            
uploaded_files = st.file_uploader("Upload Files", type=["csv", "pdf"], accept_multiple_files=True)

gvectordatabase = None

if uploaded_files:    
    count,vectordatabase = ingest_documents(uploaded_files)
    gvectordatabase=vectordatabase
    st.success(f"✅ {count} document chunks ingested and stored in vector database successfully!")
else:    
    st.info("ℹ️ Upload CSV or PDF files to enhance research with your own documents.")

            
# Main input
query = st.text_input(
    "What would you like to research?",
    value=st.session_state.get("demo_query", ""),
    placeholder="e.g., Latest developments in quantum computing 2024"
)

# Demo mode checkbox
if demo_mode:
    st.info("🎭 Demo Mode: Using cached results for faster demonstration")

# Research button
if st.button("🚀 Start Research", type="primary") or st.session_state.get("demo_query"):
    if not query:
        st.warning("Please enter a research query")
        st.stop()
    
    # Check demo mode
    if demo_mode:
        demo_key = st.session_state.get("demo_key", query.lower().replace(" ", "_"))
        cached_result = get_cached_result(demo_key)
        
        if cached_result:
            st.success("✅ Using cached results")
            st.session_state.results = cached_result
            st.session_state.current_query = query  # Store query for download filename
            st.rerun()
        else:
            st.warning(f"No cached result for '{demo_key}'. Running live research...")
            demo_mode = False
    
    if not demo_mode:
        # Progress tracking
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        # Step 1: Retrieval
        with st.spinner("🔍 **Retriever Agent**: Searching across web, papers, and news..."):
            status_text.info("🔍 **Step 1/4**: Retrieving sources...")
            progress_bar.progress(25)
            time.sleep(0.5)  # Visual feedback
        
        # Step 2: Analysis
        with st.spinner("📊 **Analyzer Agent**: Analyzing findings and validating sources..."):
            status_text.info("📊 **Step 2/4**: Analyzing sources...")
            progress_bar.progress(50)
            time.sleep(0.5)
        
        # Step 3: Insights
        with st.spinner("💡 **Insight Generator Agent**: Synthesizing trends and generating hypotheses..."):
            status_text.info("💡 **Step 3/4**: Generating insights...")
            progress_bar.progress(75)
            time.sleep(0.5)
        
        # Step 4: Report
        with st.spinner("📄 **Report Builder Agent**: Compiling final report..."):
            status_text.info("📄 **Step 4/4**: Building report...")
            progress_bar.progress(90)
        
        # Run workflow
        try:
            result = st.session_state.workflow.run(query,gvectordatabase)
            progress_bar.progress(100)
            status_text.success("✅ Research complete!")
            
            # Cache result for demo mode
            demo_key = query.lower().replace(" ", "_")[:50]
            cache_result(demo_key, result)
            
            st.session_state.results = result
            st.session_state.current_query = query  # Store query for download filename
            st.session_state.demo_query = None  # Clear demo query
            
        except Exception as e:
            st.error(f"❌ Error during research: {str(e)}")
            logger.error(f"Research failed: {e}")
            st.stop()

# Display results
if st.session_state.results:
    result = st.session_state.results
    
    # Tabs for different views
    tab1, tab2, tab3, tab4 = st.tabs(["📄 Report", "🔍 Sources", "📊 Analysis", "💡 Insights"])
    
    with tab1:
        st.markdown("## Research Report")
        
        # Text-to-Speech Component
        report_text = result.get("report", "No report generated")
        if report_text and report_text != "No report generated":
            st.markdown("### 🔊 Listen to Report")
            text_to_speech_component(report_text, "Listen to Report")
            st.markdown("---")
        
        st.markdown(report_text)
        
        # Download button
        # Get query from session state or use default
        current_query = st.session_state.get("current_query", "research")
        # Sanitize filename
        safe_query = current_query[:30].replace(' ', '_').replace('/', '_').replace('\\', '_') if current_query else "research"
        file_name = f"research_report_{safe_query}.md"
        
        st.download_button(
            label="📥 Download Report (Markdown)",
            data=result.get("report", ""),
            file_name=file_name,
            mime="text/markdown"
        )
    
    with tab2:
        st.markdown("## Retrieved Sources")
        
        sources = result.get("sources", {})
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.subheader("🌐 Web Sources")
            if sources.get("web"):
                for i, web in enumerate(sources["web"][:5], 1):
                    with st.expander(f"{i}. {web.get('title', 'No title')[:60]}..."):
                        st.write(f"**URL:** {web.get('url', 'No URL')}")
                        st.write(f"**Snippet:** {web.get('snippet', 'No snippet')}")
            else:
                st.info("No web sources found")
        
        with col2:
            st.subheader("📚 Research Papers")
            if sources.get("papers"):
                for i, paper in enumerate(sources["papers"][:5], 1):
                    with st.expander(f"{i}. {paper.get('title', 'No title')[:60]}..."):
                        st.write(f"**Authors:** {paper.get('authors', 'Unknown')}")
                        st.write(f"**URL:** {paper.get('url', 'No URL')}")
                        st.write(f"**Summary:** {paper.get('summary', 'No summary')[:200]}...")
            else:
                st.info("No papers found")
        
        with col3:
            st.subheader("📰 News Sources")
            if sources.get("news"):
                for i, news in enumerate(sources["news"][:5], 1):
                    with st.expander(f"{i}. {news.get('title', 'No title')[:60]}..."):
                        st.write(f"**URL:** {news.get('url', 'No URL')}")
                        st.write(f"**Snippet:** {news.get('snippet', 'No snippet')}")
            else:
                st.info("No news sources found")
        
        with col4:
            st.subheader("📄 RAG Context Documents")
            if sources.get("rag_context"):
                st.text_area("RAG Context", value=sources["rag_context"][:5000], height=300)
            else:
                st.info("No RAG context available")
    
    with tab3:
        st.markdown("## Analysis Results")
        
        analysis = result.get("analysis", {})
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("📋 Summary")
            if analysis.get("summary"):
                for point in analysis["summary"]:
                    st.markdown(f"- {point}")
            else:
                st.info("No summary available")
            
            st.subheader("⚠️ Contradictions")
            if analysis.get("contradictions"):
                for contradiction in analysis["contradictions"]:
                    st.warning(f"⚠️ {contradiction}")
            else:
                st.success("No contradictions identified")
        
        with col2:
            st.subheader("✅ Credibility Assessment")
            if analysis.get("credibility"):
                for cred in analysis["credibility"]:
                    st.markdown(f"- {cred}")
            else:
                st.info("No credibility assessment available")
            
            st.subheader("🔑 Key Claims")
            if analysis.get("key_claims"):
                for claim in analysis["key_claims"]:
                    st.markdown(f"- {claim}")
            else:
                st.info("No key claims extracted")
    
    with tab4:
        st.markdown("## Generated Insights")
        
        insights = result.get("insights", {})
        
        st.subheader("💡 Key Insights")
        if insights.get("insights"):
            for insight in insights["insights"]:
                st.info(f"💡 {insight}")
        else:
            st.info("No insights generated")
        
        st.subheader("🔬 Hypotheses")
        if insights.get("hypotheses"):
            for hypothesis in insights["hypotheses"]:
                st.markdown(f"- {hypothesis}")
        else:
            st.info("No hypotheses generated")
        
        st.subheader("📈 Trends")
        if insights.get("trends"):
            for trend in insights["trends"]:
                st.markdown(f"- {trend}")
        else:
            st.info("No trends identified")
        
        st.subheader("🔗 Reasoning Chains")
        if insights.get("reasoning_chains"):
            for chain in insights["reasoning_chains"]:
                st.markdown(f"- {chain}")
        else:
            st.info("No reasoning chains generated")
    
    # Error display
    if result.get("error"):
        st.error(f"⚠️ Warning: {result['error']}")

# Footer
st.markdown("---")
st.markdown("""
<div style='text-align: center; color: gray;'>
    <p>Multi-Agent AI Deep Researcher | Built with LangChain, LangGraph, and Streamlit</p>
</div>
""", unsafe_allow_html=True)

