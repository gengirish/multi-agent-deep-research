"""
Agent Conversation Logger
Captures and stores agent interactions for debugging and transparency.
"""

import logging
import json
import os
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class AgentLogger:
    """Logs agent conversations and interactions."""
    
    def __init__(self, log_dir: str = "logs/agent_conversations"):
        """Initialize the agent logger.
        
        Args:
            log_dir: Directory to store conversation logs
        """
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.current_conversation: List[Dict[str, Any]] = []
        self.query_id: Optional[str] = None
    
    def start_conversation(self, query: str) -> str:
        """Start a new conversation log.
        
        Args:
            query: The research query
            
        Returns:
            Conversation ID
        """
        self.query_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        self.current_conversation = [{
            "timestamp": datetime.now().isoformat(),
            "type": "query",
            "content": query
        }]
        logger.info(f"Started conversation log: {self.query_id}")
        return self.query_id
    
    def log_agent_action(self, agent_name: str, action: str, 
                        input_data: Any = None, output_data: Any = None,
                        metadata: Dict[str, Any] = None):
        """Log an agent action.
        
        Args:
            agent_name: Name of the agent (e.g., "retriever", "analyzer")
            action: Action performed (e.g., "retrieve", "analyze")
            input_data: Input to the agent
            output_data: Output from the agent
            metadata: Additional metadata
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": agent_name,
            "action": action,
            "input": self._serialize_data(input_data),
            "output": self._serialize_data(output_data),
            "metadata": metadata or {}
        }
        
        self.current_conversation.append(log_entry)
        logger.debug(f"Logged {agent_name}.{action}")
    
    def log_agent_error(self, agent_name: str, action: str, error: Exception):
        """Log an agent error.
        
        Args:
            agent_name: Name of the agent
            action: Action that failed
            error: Exception that occurred
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "agent": agent_name,
            "action": action,
            "type": "error",
            "error": str(error),
            "error_type": type(error).__name__
        }
        
        self.current_conversation.append(log_entry)
        logger.error(f"Logged error for {agent_name}.{action}: {error}")
    
    def end_conversation(self, final_result: Dict[str, Any] = None):
        """End the conversation and save to file.
        
        Args:
            final_result: Final workflow result
        """
        if not self.query_id:
            logger.warning("No active conversation to end")
            return
        
        # Add final result
        if final_result:
            self.current_conversation.append({
                "timestamp": datetime.now().isoformat(),
                "type": "final_result",
                "content": self._serialize_data(final_result)
            })
        
        # Save to file
        log_file = self.log_dir / f"conversation_{self.query_id}.json"
        try:
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "query_id": self.query_id,
                    "conversation": self.current_conversation,
                    "total_entries": len(self.current_conversation)
                }, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved conversation log to {log_file}")
        except Exception as e:
            logger.error(f"Failed to save conversation log: {e}")
        
        # Reset for next conversation
        self.current_conversation = []
        self.query_id = None
    
    def _serialize_data(self, data: Any) -> Any:
        """Serialize data for JSON storage.
        
        Args:
            data: Data to serialize
            
        Returns:
            Serializable data
        """
        if data is None:
            return None
        
        # Handle dictionaries
        if isinstance(data, dict):
            # Limit size of large dictionaries
            if len(str(data)) > 10000:
                return {
                    "_truncated": True,
                    "_size": len(str(data)),
                    "_keys": list(data.keys())[:10]
                }
            return {k: self._serialize_data(v) for k, v in data.items()}
        
        # Handle lists
        if isinstance(data, list):
            if len(data) > 50:
                return {
                    "_truncated": True,
                    "_count": len(data),
                    "_items": [self._serialize_data(item) for item in data[:10]]
                }
            return [self._serialize_data(item) for item in data]
        
        # Handle strings
        if isinstance(data, str):
            if len(data) > 5000:
                return data[:5000] + "... [truncated]"
            return data
        
        # Handle other types
        try:
            json.dumps(data)
            return data
        except (TypeError, ValueError):
            return str(data)
    
    def get_conversation_summary(self) -> Dict[str, Any]:
        """Get a summary of the current conversation.
        
        Returns:
            Conversation summary
        """
        if not self.current_conversation:
            return {"status": "no_active_conversation"}
        
        agent_actions = {}
        for entry in self.current_conversation:
            if "agent" in entry:
                agent = entry["agent"]
                action = entry["action"]
                if agent not in agent_actions:
                    agent_actions[agent] = []
                agent_actions[agent].append(action)
        
        return {
            "query_id": self.query_id,
            "total_entries": len(self.current_conversation),
            "agent_actions": agent_actions,
            "has_errors": any(entry.get("type") == "error" for entry in self.current_conversation)
        }


# Global instance
_agent_logger = None

def get_agent_logger() -> AgentLogger:
    """Get the global agent logger instance.
    
    Returns:
        AgentLogger instance
    """
    global _agent_logger
    if _agent_logger is None:
        log_dir = os.getenv("AGENT_LOG_DIR", "logs/agent_conversations")
        _agent_logger = AgentLogger(log_dir=log_dir)
    return _agent_logger

