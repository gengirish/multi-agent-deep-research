"""
LangGraph Orchestration Coordinator
Manages the multi-agent workflow.
"""

import logging
import asyncio
import concurrent.futures
from typing import TypedDict, Dict, Any, List
from langgraph.graph import StateGraph, END
from agents.retriever import ContextualRetrieverAgent
from agents.enrichment import DataEnrichmentAgent
from agents.analyzer import CriticalAnalysisAgent
from agents.insight_generator import InsightGenerationAgent
from agents.report_builder import ReportBuilderAgent
from agents.credibility import SourceCredibilityAgent
from utils.agent_logger import get_agent_logger

logger = logging.getLogger(__name__)


class ResearchState(TypedDict):
    """State schema for the research workflow."""
    query: str
    sources: Dict[str, Any]
    analysis: Dict[str, Any]
    insights: Dict[str, Any]
    credibility: Dict[str, Any]  # Source credibility assessments
    report: str
    error: str


class ResearchWorkflow:
    """Orchestrates the multi-agent research workflow using LangGraph."""
    
    def __init__(self):
        """Initialize agents and build workflow graph."""
        logger.info("Initializing Research Workflow")
        
        # Initialize agent logger
        self.agent_logger = get_agent_logger()
        
        # Initialize agents
        self.retriever = ContextualRetrieverAgent()
        self.enricher = DataEnrichmentAgent()
        self.credibility_agent = SourceCredibilityAgent()
        self.analyzer = CriticalAnalysisAgent()
        self.insight_generator = InsightGenerationAgent()
        self.report_builder = ReportBuilderAgent()
        
        # Build workflow graph
        self.workflow = self._build_workflow()
        
        logger.info("Research Workflow initialized")
    
    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow with parallel execution."""
        # Create state graph
        graph = StateGraph(ResearchState)
        
        # Add nodes (agents)
        graph.add_node("retriever", self._retriever_node)
        graph.add_node("enricher", self._enricher_node)
        graph.add_node("parallel_analysis", self._parallel_analysis_node)  # Parallel credibility + analyzer
        graph.add_node("insight_generator", self._insight_generator_node)
        graph.add_node("report_builder", self._report_builder_node)
        
        # Define edges with parallel execution
        graph.set_entry_point("retriever")
        graph.add_edge("retriever", "enricher")
        
        # Parallel execution: credibility and analyzer run in parallel after enrichment
        graph.add_edge("enricher", "parallel_analysis")
        
        # Continue with sequential flow after parallel analysis
        graph.add_edge("parallel_analysis", "insight_generator")
        graph.add_edge("insight_generator", "report_builder")
        graph.add_edge("report_builder", END)
        
        # Compile workflow
        return graph.compile()
    
    def _retriever_node(self, state: ResearchState) -> ResearchState:
        """Retriever agent node."""
        try:
            logger.info(f"Workflow: Running Retriever for query: {state['query']}")
            self.agent_logger.log_agent_action(
                "retriever", "retrieve", 
                input_data={"query": state["query"]}
            )
            sources = self.retriever.retrieve(state["query"])
            state["sources"] = sources
            self.agent_logger.log_agent_action(
                "retriever", "retrieve",
                output_data={"sources_count": {
                    "web": len(sources.get("web", [])),
                    "papers": len(sources.get("papers", [])),
                    "news": len(sources.get("news", []))
                }}
            )
            logger.info("Workflow: Retriever completed")
        except Exception as e:
            logger.error(f"Retriever node failed: {e}")
            self.agent_logger.log_agent_error("retriever", "retrieve", e)
            state["error"] = f"Retrieval failed: {str(e)}"
            state["sources"] = {"web": [], "papers": [], "news": [], "query": state["query"]}
        return state
    
    def _enricher_node(self, state: ResearchState) -> ResearchState:
        """Enrichment agent node."""
        try:
            logger.info("Workflow: Running Enricher")
            self.agent_logger.log_agent_action("enricher", "enrich_sources")
            enriched_sources = self.enricher.enrich_sources(state["sources"])
            state["sources"] = enriched_sources
            self.agent_logger.log_agent_action("enricher", "enrich_sources", output_data={"status": "success"})
            logger.info("Workflow: Enricher completed")
        except Exception as e:
            logger.error(f"Enricher node failed: {e}")
            self.agent_logger.log_agent_error("enricher", "enrich_sources", e)
            # Continue with original sources if enrichment fails
            logger.warning("Continuing with original sources (enrichment failed)")
        return state
    
    def _parallel_analysis_node(self, state: ResearchState) -> ResearchState:
        """
        Parallel analysis node: runs credibility and analyzer in parallel using asyncio.
        This avoids LangGraph state conflicts while achieving parallel execution.
        """
        try:
            logger.info("Workflow: Running parallel analysis (credibility + analyzer)")
            
            # Run both operations in parallel using asyncio
            async def run_parallel():
                async def run_credibility():
                    try:
                        self.agent_logger.log_agent_action("credibility", "evaluate_credibility")
                        return await asyncio.to_thread(
                            self.credibility_agent.evaluate_credibility,
                            state["sources"]
                        )
                    except Exception as e:
                        logger.error(f"Credibility evaluation failed: {e}")
                        self.agent_logger.log_agent_error("credibility", "evaluate_credibility", e)
                        return {
                            "web": [],
                            "papers": [],
                            "news": [],
                            "overall_credibility": {}
                        }
                
                async def run_analyzer():
                    try:
                        self.agent_logger.log_agent_action("analyzer", "analyze")
                        return await asyncio.to_thread(
                            self.analyzer.analyze,
                            state["sources"]
                        )
                    except Exception as e:
                        logger.error(f"Analysis failed: {e}")
                        self.agent_logger.log_agent_error("analyzer", "analyze", e)
                        return {
                            "summary": [],
                            "contradictions": [],
                            "credibility": [],
                            "key_claims": []
                        }
                
                # Execute both in parallel
                credibility_results, analysis_results = await asyncio.gather(
                    run_credibility(),
                    run_analyzer()
                )
                
                return credibility_results, analysis_results
            
            # Run the async parallel execution
            # Check if there's already an event loop running
            try:
                loop = asyncio.get_running_loop()
                # If loop exists, we need to use a different approach
                # Create a new event loop in a thread
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(asyncio.run, run_parallel())
                    credibility_results, analysis_results = future.result()
            except RuntimeError:
                # No event loop running, safe to use asyncio.run
                credibility_results, analysis_results = asyncio.run(run_parallel())
            
            # Update state with results
            state["credibility"] = credibility_results
            state["analysis"] = analysis_results
            
            # Log completion
            self.agent_logger.log_agent_action(
                "credibility", "evaluate_credibility",
                output_data={
                    "total_sources": credibility_results.get("overall_credibility", {}).get("total_sources", 0),
                    "average_score": credibility_results.get("overall_credibility", {}).get("average_score", 0)
                }
            )
            self.agent_logger.log_agent_action(
                "analyzer", "analyze",
                output_data={
                    "contradictions_count": len(analysis_results.get("contradictions", [])),
                    "key_claims_count": len(analysis_results.get("key_claims", []))
                }
            )
            
            logger.info("Workflow: Parallel analysis completed (credibility + analyzer)")
            
        except Exception as e:
            logger.error(f"Parallel analysis node failed: {e}")
            # Set default values if parallel execution fails
            state["credibility"] = {
                "web": [],
                "papers": [],
                "news": [],
                "overall_credibility": {}
            }
            state["analysis"] = {
                "summary": [],
                "contradictions": [],
                "credibility": [],
                "key_claims": []
            }
            logger.warning("Continuing with default values after parallel analysis failure")
        
        return state
    
    def _insight_generator_node(self, state: ResearchState) -> ResearchState:
        """Insight generator agent node."""
        try:
            logger.info("Workflow: Running Insight Generator")
            self.agent_logger.log_agent_action("insight_generator", "generate")
            insights = self.insight_generator.generate(
                state["analysis"],
                state["query"]
            )
            state["insights"] = insights
            self.agent_logger.log_agent_action(
                "insight_generator", "generate",
                output_data={
                    "insights_count": len(insights.get("insights", [])),
                    "hypotheses_count": len(insights.get("hypotheses", []))
                }
            )
            logger.info("Workflow: Insight Generator completed")
        except Exception as e:
            logger.error(f"Insight generator node failed: {e}")
            self.agent_logger.log_agent_error("insight_generator", "generate", e)
            state["error"] = f"Insight generation failed: {str(e)}"
            state["insights"] = {
                "insights": [],
                "hypotheses": [],
                "trends": [],
                "reasoning_chains": []
            }
        return state
    
    def _report_builder_node(self, state: ResearchState) -> ResearchState:
        """Report builder agent node."""
        try:
            logger.info("Workflow: Running Report Builder")
            self.agent_logger.log_agent_action("report_builder", "compile")
            report = self.report_builder.compile(
                state["query"],
                state["sources"],
                state["analysis"],
                state["insights"]
            )
            state["report"] = report
            self.agent_logger.log_agent_action(
                "report_builder", "compile",
                output_data={"report_length": len(report)}
            )
            logger.info("Workflow: Report Builder completed")
        except Exception as e:
            logger.error(f"Report builder node failed: {e}")
            self.agent_logger.log_agent_error("report_builder", "compile", e)
            state["error"] = f"Report building failed: {str(e)}"
            state["report"] = f"# Error\n\nFailed to generate report: {str(e)}"
        return state
    
    def run(self, query: str) -> Dict[str, Any]:
        """
        Execute the research workflow.
        
        Args:
            query: Research query
            
        Returns:
            Complete research results with sources, analysis, insights, and report
        """
        logger.info(f"Starting research workflow for query: {query}")
        
        # Start conversation logging
        self.agent_logger.start_conversation(query)
        
        initial_state: ResearchState = {
            "query": query,
            "sources": {},
            "analysis": {},
            "insights": {},
            "credibility": {},
            "report": "",
            "error": ""
        }
        
        try:
            result = self.workflow.invoke(initial_state)
            logger.info("Research workflow completed successfully")
            
            # End conversation logging
            self.agent_logger.end_conversation(result)
            
            return result
        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            initial_state["error"] = str(e)
            initial_state["report"] = f"# Error\n\nWorkflow failed: {str(e)}"
            
            # End conversation logging with error
            self.agent_logger.end_conversation(initial_state)
            
            return initial_state

