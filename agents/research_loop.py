"""
Iterative research loop.

The retriever fires one query at three channels, takes five results each, and
hands the snippets downstream. Everything after it — credibility, analysis,
insight, report — is bounded by that single shot. If the first search misses
the angle a founder actually needed, no later stage can recover it.

This module wraps the retriever in the search/reflect/search-again loop from
LangChain's open_deep_research (MIT):

    retrieve -> reflect on what is missing -> follow-up queries -> retrieve
             -> merge and de-duplicate -> compress to a bounded source set

Two deliberate departures from the upstream design, both about cost. Chronicle
runs on provider free tiers where Google allows 20 requests per day *per
model*, so:

* **One model call per iteration.** Reflection is the only LLM step; upstream
  also summarizes each source with a model call, which would multiply token
  spend by the source count. Compression here is structural — de-duplicate,
  rank, cap — not generative.
* **Hard caps everywhere.** Iterations, follow-up queries per iteration, and
  final sources per channel are all bounded, so the worst case is knowable:
  `max_iterations` model calls and `max_iterations * follow_ups * 3` searches.

The loop is off by default. Set `RESEARCH_LOOP_ENABLED=true` to turn it on;
`ResearchWorkflow` reads the same flag, which is what makes an A/B against the
existing single-shot path possible on the eval fixtures.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

CHANNELS = ("web", "papers", "news")

# Distinguishes "build the default reflection model" (argument omitted) from
# "run without one" (llm=None passed deliberately). With None as the default,
# a caller that wanted a model-free loop would silently get a live client and,
# in tests, real network calls.
_UNSET = object()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        logger.warning(f"{name} is not an integer; using default {default}")
        return default


def is_enabled() -> bool:
    """Whether the workflow should route retrieval through this loop."""
    return os.getenv("RESEARCH_LOOP_ENABLED", "false").strip().lower() in (
        "true", "1", "yes", "on"
    )


# Query parameters that identify a campaign rather than a document, so two URLs
# differing only in these are the same source arriving twice.
_TRACKING_PARAMS = ("utm_", "fbclid", "gclid", "mc_cid", "mc_eid", "ref_", "ref=")

REFLECTION_PROMPT = """You are the research supervisor for a market-research \
report that must be defensible with citations.

ORIGINAL QUESTION:
{query}

SOURCES GATHERED SO FAR ({source_count} total):
{digest}

Decide whether these sources can support a credible, well-cited answer to the \
original question.

Judge coverage, not volume. Ask specifically: are the numbers in these sources \
sourced or asserted? Is any load-bearing claim supported by exactly one source? \
Are competitors, market size, and recent activity all represented if the \
question needs them?

Respond with ONLY a JSON object, no prose and no code fences:
{{
  "sufficient": true or false,
  "gaps": ["specific missing information, at most 3 items"],
  "follow_up_queries": ["search queries that would close those gaps, at most {max_follow_ups}"]
}}

Set "sufficient" to true and return empty lists if the sources already cover \
the question. Follow-up queries must be genuinely different from the original \
question — searching the same thing again wastes a request."""


class IterativeResearchLoop:
    """Runs the retriever repeatedly, guided by model reflection on gaps."""

    def __init__(
        self,
        retriever: Any,
        llm: Any = _UNSET,
        max_iterations: Optional[int] = None,
        per_query_results: Optional[int] = None,
        max_follow_ups: Optional[int] = None,
        max_sources_per_channel: Optional[int] = None,
        on_event: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ) -> None:
        """
        Args:
            retriever: anything with `.retrieve(query, max_results) -> dict`.
            llm: chat model for reflection. Built lazily from
                `create_retriever_llm()` when omitted; when it cannot be built,
                or when None is passed explicitly, the loop degrades to a
                single retrieval pass.
            on_event: optional `(event_name, payload)` hook, used by the
                coordinator to write iterations into the visible agent trace.
        """
        self.retriever = retriever
        self.max_iterations = max_iterations if max_iterations is not None else _env_int(
            "RESEARCH_LOOP_MAX_ITERATIONS", 2
        )
        self.per_query_results = (
            per_query_results
            if per_query_results is not None
            else _env_int("RESEARCH_LOOP_RESULTS_PER_QUERY", 5)
        )
        self.max_follow_ups = (
            max_follow_ups
            if max_follow_ups is not None
            else _env_int("RESEARCH_LOOP_FOLLOW_UPS", 2)
        )
        self.max_sources_per_channel = (
            max_sources_per_channel
            if max_sources_per_channel is not None
            else _env_int("RESEARCH_LOOP_MAX_SOURCES", 12)
        )
        self.on_event = on_event

        if llm is not _UNSET:
            self.llm = llm
        else:
            # Imported lazily: the loop is constructed in environments (tests,
            # eval fixtures) where no provider key exists, and a module-level
            # import would make llm_config a hard dependency of the module.
            try:
                from utils.llm_config import create_retriever_llm

                self.llm = create_retriever_llm()
            except Exception as e:
                logger.warning(f"Research loop could not build a reflection LLM: {e}")
                self.llm = None

        if self.llm is None:
            logger.warning(
                "Research loop has no reflection model — it will perform a "
                "single retrieval pass, matching the non-loop behaviour."
            )

    # -- public ------------------------------------------------------------

    def run(self, query: str) -> Dict[str, Any]:
        """Retrieve, reflect and re-retrieve until sufficient or capped.

        Returns the same source dict shape the retriever returns, plus a
        `research_loop` key describing what the loop did. Downstream agents
        read only the channel lists, so they are unaffected by its presence.
        """
        logger.info(f"Research loop: starting for '{query}'")

        sources = self._retrieve(query, iteration=0)
        trace: Dict[str, Any] = {
            "iterations": 0,
            "queries": [query],
            "gaps": [],
            "sufficient": None,
            "initial_source_count": self._count(sources),
            "stopped_because": "max_iterations",
        }
        self._emit("iteration", {"iteration": 0, "query": query,
                                 "sources": trace["initial_source_count"]})

        for iteration in range(1, self.max_iterations + 1):
            if self.llm is None:
                trace["stopped_because"] = "no reflection model"
                break

            reflection = self._reflect(query, sources)
            if reflection is None:
                # Unparseable reflection. Stopping is the honest response —
                # inventing follow-up queries would spend real search budget on
                # a guess about what a broken response meant.
                trace["stopped_because"] = "reflection unavailable"
                break

            sufficient, gaps, follow_ups = reflection
            trace["gaps"].extend(gaps)
            trace["sufficient"] = sufficient

            if sufficient or not follow_ups:
                trace["stopped_because"] = "sufficient" if sufficient else "no follow-up queries"
                break

            for follow_up in follow_ups:
                new_sources = self._retrieve(follow_up, iteration=iteration)
                sources = self._merge(sources, new_sources)
                trace["queries"].append(follow_up)

            trace["iterations"] = iteration
            self._emit(
                "iteration",
                {
                    "iteration": iteration,
                    "queries": follow_ups,
                    "gaps": gaps,
                    "sources": self._count(sources),
                },
            )

        merged_count = self._count(sources)
        sources = self._compress(sources)
        trace["merged_source_count"] = merged_count
        trace["final_source_count"] = self._count(sources)
        sources["research_loop"] = trace
        sources["query"] = query

        logger.info(
            f"Research loop: {trace['iterations']} iteration(s), "
            f"{len(trace['queries'])} quer(ies), "
            f"{trace['initial_source_count']} -> {merged_count} -> "
            f"{trace['final_source_count']} sources "
            f"(stopped: {trace['stopped_because']})"
        )
        return sources

    # -- steps -------------------------------------------------------------

    def _retrieve(self, query: str, iteration: int) -> Dict[str, Any]:
        """One retrieval pass, tagged with the query that produced it."""
        try:
            results = self.retriever.retrieve(query, max_results=self.per_query_results)
        except Exception as e:
            logger.error(f"Research loop: retrieval failed for '{query}': {e}")
            return {"web": [], "papers": [], "news": [], "errors": {"retriever": str(e)}}

        if not isinstance(results, dict):
            logger.error(f"Research loop: retriever returned {type(results).__name__}")
            return {"web": [], "papers": [], "news": []}

        # Provenance: the report and the eval harness both benefit from knowing
        # which question surfaced a given source, and it is impossible to
        # reconstruct after the merge.
        for channel in CHANNELS:
            for source in results.get(channel) or []:
                if isinstance(source, dict):
                    source.setdefault("_query", query)
                    source.setdefault("_iteration", iteration)
        return results

    def _reflect(
        self, query: str, sources: Dict[str, Any]
    ) -> Optional[Tuple[bool, List[str], List[str]]]:
        """Ask the model what is missing. Returns None if it cannot be read."""
        digest = self._digest(sources)
        if not digest:
            # Nothing was retrieved at all. Re-searching the same query would
            # just re-hit whatever is broken.
            return None

        prompt = REFLECTION_PROMPT.format(
            query=query,
            source_count=self._count(sources),
            digest=digest,
            max_follow_ups=self.max_follow_ups,
        )

        try:
            response = self.llm.invoke(prompt)
        except Exception as e:
            logger.warning(f"Research loop: reflection call failed: {e}")
            return None

        text = self._message_text(response)
        parsed = self._parse_reflection(text)
        if parsed is None:
            logger.warning(
                f"Research loop: could not parse reflection response: {text[:200]!r}"
            )
            return None

        sufficient, gaps, follow_ups = parsed
        # Cap follow-ups here rather than trusting the model to obey the prompt;
        # each one costs three searches.
        return sufficient, gaps[:3], follow_ups[: self.max_follow_ups]

    def _digest(self, sources: Dict[str, Any], per_channel: int = 8) -> str:
        """Compact view of what has been gathered, for the reflection prompt.

        Titles plus a short snippet: enough for the model to judge coverage,
        small enough that reflection stays cheap as the source set grows.
        """
        lines: List[str] = []
        for channel in CHANNELS:
            items = sources.get(channel) or []
            if not items:
                continue
            lines.append(f"\n{channel.upper()}:")
            for source in items[:per_channel]:
                if not isinstance(source, dict):
                    continue
                title = (source.get("title") or "untitled").strip()
                body = (source.get("snippet") or source.get("summary") or "").strip()
                body = re.sub(r"\s+", " ", body)[:180]
                lines.append(f"- {title}" + (f" — {body}" if body else ""))
        return "\n".join(lines).strip()

    def _merge(self, base: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
        """Union two source dicts, dropping duplicates the loop just re-found."""
        merged: Dict[str, Any] = dict(base)
        for channel in CHANNELS:
            existing = list(base.get(channel) or [])
            seen = {self._dedup_key(s) for s in existing if isinstance(s, dict)}
            for source in new.get(channel) or []:
                if not isinstance(source, dict):
                    continue
                key = self._dedup_key(source)
                if key in seen:
                    continue
                seen.add(key)
                existing.append(source)
            merged[channel] = existing

        # Channel errors accumulate: a channel that broke on iteration 1 and
        # worked on iteration 2 should not still look broken.
        base_errors = dict(base.get("errors") or {})
        new_errors = dict(new.get("errors") or {})
        for channel in CHANNELS:
            if merged.get(channel):
                base_errors.pop(channel, None)
                new_errors.pop(channel, None)
        combined = {**base_errors, **new_errors}
        if combined:
            merged["errors"] = combined
        else:
            merged.pop("errors", None)
        return merged

    def _compress(self, sources: Dict[str, Any]) -> Dict[str, Any]:
        """Bound the source set handed downstream.

        Structural, not generative: every later stage iterates the full list —
        credibility makes a model call per source — so an unbounded merge would
        multiply cost by the number of iterations. Highest-scoring sources
        survive, and the original query's results outrank follow-up results at
        equal score because they answer what was actually asked.
        """
        compressed = dict(sources)
        for channel in CHANNELS:
            items = [s for s in (sources.get(channel) or []) if isinstance(s, dict)]
            if len(items) <= self.max_sources_per_channel:
                compressed[channel] = items
                continue
            ranked = sorted(
                items,
                key=lambda s: (
                    # Tavily's synthesized answer entry is not a citable source
                    # but is useful framing, so it is kept rather than ranked.
                    1 if s.get("is_answer") else 0,
                    float(s.get("score") or 0.0),
                    -int(s.get("_iteration") or 0),
                ),
                reverse=True,
            )
            compressed[channel] = ranked[: self.max_sources_per_channel]
        return compressed

    # -- helpers -----------------------------------------------------------

    @staticmethod
    def _dedup_key(source: Dict[str, Any]) -> str:
        """Identity of a source for de-duplication.

        URL when there is one, normalized so that http/https, a www prefix, a
        trailing slash and tracking parameters do not create phantom sources.
        Falls back to the title, which is what Tavily's answer entries and any
        URL-less result have.
        """
        url = (source.get("url") or "").strip()
        if not url:
            return "title:" + re.sub(r"\s+", " ", (source.get("title") or "")).strip().lower()
        try:
            parsed = urlparse(url.lower())
            netloc = parsed.netloc.removeprefix("www.")
            path = parsed.path.rstrip("/") or "/"
            query = "&".join(
                part
                for part in parsed.query.split("&")
                if part and not any(part.startswith(t) for t in _TRACKING_PARAMS)
            )
            return urlunparse(("", netloc, path, "", query, ""))
        except Exception:
            return url.lower()

    @staticmethod
    def _count(sources: Dict[str, Any]) -> int:
        return sum(len(sources.get(channel) or []) for channel in CHANNELS)

    @staticmethod
    def _message_text(response: Any) -> str:
        """Text of a chat response, without importing llm_config."""
        content = getattr(response, "content", response)
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            # Anthropic-style content blocks.
            parts = [
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            return "".join(parts) or str(content)
        return str(content)

    @staticmethod
    def _parse_reflection(text: str) -> Optional[Tuple[bool, List[str], List[str]]]:
        """Read the reflection JSON out of a model response.

        Models wrap JSON in code fences and prose no matter how the prompt is
        worded, so the object is located rather than assumed to be the whole
        response.
        """
        if not text:
            return None
        candidate = text.strip()
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", candidate, re.DOTALL)
        if fenced:
            candidate = fenced.group(1)
        else:
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start == -1 or end <= start:
                return None
            candidate = candidate[start : end + 1]

        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            return None
        if not isinstance(data, dict):
            return None

        def _string_list(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []
            return [item.strip() for item in value if isinstance(item, str) and item.strip()]

        return (
            bool(data.get("sufficient")),
            _string_list(data.get("gaps")),
            _string_list(data.get("follow_up_queries")),
        )

    def _emit(self, event: str, payload: Dict[str, Any]) -> None:
        if self.on_event is None:
            return
        try:
            self.on_event(event, payload)
        except Exception as e:
            logger.debug(f"Research loop event hook failed: {e}")
