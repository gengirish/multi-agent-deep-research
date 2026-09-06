"""NVIDIA NIM judge for DeepEval.

DeepEval's metrics do not ask the judge for prose; they ask it for structured
JSON (a list of claims, a list of verdicts, a reason) and hand a Pydantic class
along with the prompt. The contract, from `deepeval.metrics.utils
.generate_with_schema_and_extract`, is:

    result = model.generate_with_schema(prompt, schema=SchemaCls)
    -> an instance of SchemaCls, or a JSON string it can parse

The failure mode with an OpenAI-compatible OSS endpoint is not wrong scores,
it is unparseable output: the judge writes a preamble, fences the JSON, or
emits a trailing comma, `trimAndLoadJson` raises, and the metric errors out.
So this wrapper negotiates the strongest output mode the endpoint and model
actually support, then repairs and retries what still comes back malformed,
and counts every one of those events so `validate_judge.py` can report a real
parse hit rate before anyone builds thresholds on top of it.

Negotiation order, cached per (model, mode) after the first success:

    json_schema  -> server-side constrained decoding, cannot emit bad JSON
    json_object  -> server guarantees valid JSON, not the right shape
    prompt       -> nothing guaranteed; schema described in the prompt

NVIDIA NIM is used because it is a genuinely separate model family from the
Gemini/Groq models the pipeline stages run on. A judge drawn from the same
family as the generator scores its own output generously; keeping them apart
is the point, not an accident of which key was free.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections import Counter
from typing import Any, Optional, Type

from pydantic import BaseModel, ValidationError

try:
    from deepeval.models.base_model import DeepEvalBaseLLM
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "deepeval is not installed. `pip install -r eval/semantic/requirements.txt`"
    ) from exc

logger = logging.getLogger(__name__)

NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
# Judge default. Deliberately not one of the pipeline's own models: the stages
# run Gemini Flash and Groq Llama, so the judge is a third family.
DEFAULT_JUDGE_MODEL = os.getenv("JUDGE_MODEL", "meta/llama-3.3-70b-instruct")

MODE_JSON_SCHEMA = "json_schema"
MODE_JSON_OBJECT = "json_object"
MODE_PROMPT = "prompt"
MODE_ORDER = (MODE_JSON_SCHEMA, MODE_JSON_OBJECT, MODE_PROMPT)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)
_TRAILING_COMMA_RE = re.compile(r",\s*([\]}])")


class JudgeUnavailable(RuntimeError):
    """No usable NVIDIA credentials."""


def _strict_schema(model_cls: Type[BaseModel]) -> dict:
    """JSON schema for OpenAI-style strict structured output.

    Strict decoding requires every object to close itself: no extra
    properties, and every declared property listed as required. Pydantic
    marks fields with defaults optional, which strict mode rejects, so we
    promote them here rather than losing the mode over a default.
    """
    schema = model_cls.model_json_schema()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                node["additionalProperties"] = False
                props = node.get("properties")
                if isinstance(props, dict):
                    node["required"] = list(props)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return schema


def _extract_json(text: str) -> Optional[dict]:
    """Pull the first JSON object out of a model reply.

    Mirrors deepeval's own `trimAndLoadJson` (outermost braces, then a
    trailing-comma retry) and adds fence stripping, because a fenced block
    whose prose contains a brace defeats the plain outermost-brace scan.
    """
    if not text:
        return None

    candidates = [m.group(1) for m in _FENCE_RE.finditer(text)]
    candidates.append(text)

    for candidate in candidates:
        start = candidate.find("{")
        end = candidate.rfind("}") + 1
        if start == -1 or end <= start:
            continue
        blob = candidate[start:end]
        try:
            return json.loads(blob)
        except json.JSONDecodeError:
            try:
                return json.loads(_TRAILING_COMMA_RE.sub(r"\1", blob))
            except json.JSONDecodeError:
                continue
    return None


def _schema_instruction(schema: Type[BaseModel]) -> str:
    return (
        "\n\nReturn ONLY a JSON object matching this schema. No prose, no "
        "markdown fences, no explanation outside the JSON.\n"
        f"{json.dumps(schema.model_json_schema(), indent=2)}"
    )


class NvidiaJudge(DeepEvalBaseLLM):
    """DeepEval judge backed by NVIDIA NIM's OpenAI-compatible endpoint."""

    def __init__(
        self,
        model: str = DEFAULT_JUDGE_MODEL,
        api_key: Optional[str] = None,
        base_url: str = NVIDIA_BASE_URL,
        temperature: float = 0.0,
        max_retries: int = 2,
        max_tokens: int = 2048,
    ):
        self.model_name = model
        self.base_url = base_url
        self.temperature = temperature
        self.max_retries = max_retries
        self.max_tokens = max_tokens

        key = api_key or os.getenv("NVIDIA_API_KEY")
        if not key or key == "your_nvidia_key_here":
            raise JudgeUnavailable(
                "NVIDIA_API_KEY is not set. Get one at https://build.nvidia.com "
                "and add it to .env."
            )
        self.api_key = key.strip().strip('"').strip("'")

        # Which output mode this model has been shown to accept. Starts at the
        # strongest and only ratchets down, so one 400 costs one retry for the
        # whole session rather than one per call.
        self._mode = MODE_ORDER[0]
        # Every event validate_judge.py reports on.
        self.stats: Counter = Counter()

        super().__init__(model)

    # -- DeepEvalBaseLLM ----------------------------------------------------

    def load_model(self):
        try:
            from openai import AsyncOpenAI, OpenAI
        except ImportError as exc:  # pragma: no cover
            raise ImportError("`pip install openai>=1.40.0`") from exc

        self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self._aclient = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    def get_model_name(self) -> str:
        return f"NVIDIA NIM / {self.model_name}"

    def supports_json_mode(self) -> bool:
        return self._mode in (MODE_JSON_SCHEMA, MODE_JSON_OBJECT)

    def supports_structured_outputs(self) -> bool:
        return self._mode == MODE_JSON_SCHEMA

    # -- request construction ----------------------------------------------

    def _kwargs(self, prompt: str, schema: Optional[Type[BaseModel]], mode: str) -> dict:
        content = prompt
        kwargs: dict[str, Any] = {
            "model": self.model_name,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        if schema is not None:
            if mode == MODE_JSON_SCHEMA:
                kwargs["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema.__name__,
                        "strict": True,
                        "schema": _strict_schema(schema),
                    },
                }
            elif mode == MODE_JSON_OBJECT:
                kwargs["response_format"] = {"type": "json_object"}
                content = prompt + _schema_instruction(schema)
            else:
                content = prompt + _schema_instruction(schema)

        kwargs["messages"] = [{"role": "user", "content": content}]
        return kwargs

    def _downgrade(self, reason: str) -> bool:
        """Step to the next weaker output mode. False when already weakest."""
        idx = MODE_ORDER.index(self._mode)
        if idx >= len(MODE_ORDER) - 1:
            return False
        self._mode = MODE_ORDER[idx + 1]
        self.stats[f"downgrade_to_{self._mode}"] += 1
        logger.warning(
            "Judge %s rejected %s (%s) - falling back to %s",
            self.model_name,
            MODE_ORDER[idx],
            reason,
            self._mode,
        )
        return True

    @staticmethod
    def _is_format_rejection(exc: Exception) -> bool:
        """A 400 about response_format means the mode is unsupported, not that
        the request was bad. Anything else (auth, rate limit, model not found)
        must surface rather than silently degrade the judge."""
        text = str(exc).lower()
        if "response_format" in text or "json_schema" in text:
            return True
        status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
        return status in (400, 422) and (
            "schema" in text or "format" in text or "not supported" in text
        )

    def _coerce(
        self, raw: str, schema: Optional[Type[BaseModel]]
    ) -> tuple[Optional[Any], Optional[str]]:
        """(value, failure_reason). value is a schema instance, or raw text
        when no schema was requested."""
        if schema is None:
            return raw, None

        data = _extract_json(raw)
        if data is None:
            self.stats["parse_failure"] += 1
            return None, "no JSON object found in reply"
        try:
            return schema.model_validate(data), None
        except ValidationError as exc:
            self.stats["schema_failure"] += 1
            return None, f"JSON did not match schema: {exc.errors()[:3]}"

    # -- generation ---------------------------------------------------------

    def generate(self, prompt: str, schema: Optional[Type[BaseModel]] = None) -> Any:
        self.stats["calls"] += 1
        repair: Optional[str] = None
        # Counts content failures only. A mode downgrade is a renegotiation,
        # not a failed attempt, so it must not spend the repair budget --
        # otherwise a model that rejects both JSON modes exhausts its retries
        # on the handshake and never gets a chance to answer.
        attempts = 0

        while True:
            body = self._kwargs(
                prompt if repair is None else f"{prompt}\n\n{repair}", schema, self._mode
            )
            try:
                resp = self._client.chat.completions.create(**body)
            except Exception as exc:
                if self._is_format_rejection(exc) and self._downgrade(type(exc).__name__):
                    continue
                self.stats["api_error"] += 1
                raise

            raw = (resp.choices[0].message.content or "").strip()
            value, failure = self._coerce(raw, schema)
            if failure is None:
                self.stats["ok"] += 1
                if attempts:
                    self.stats["ok_after_repair"] += 1
                return value

            attempts += 1
            if attempts > self.max_retries:
                break
            self.stats["retry"] += 1
            repair = (
                f"Your previous reply could not be used: {failure}. "
                "Reply with the JSON object only."
            )

        self.stats["exhausted"] += 1
        raise ValueError(
            f"{self.get_model_name()} did not return schema-valid JSON for "
            f"{getattr(schema, '__name__', 'text')} after "
            f"{self.max_retries + 1} attempts (mode={self._mode})."
        )

    async def a_generate(
        self, prompt: str, schema: Optional[Type[BaseModel]] = None
    ) -> Any:
        self.stats["calls"] += 1
        repair: Optional[str] = None
        attempts = 0  # content failures only; see generate()

        while True:
            body = self._kwargs(
                prompt if repair is None else f"{prompt}\n\n{repair}", schema, self._mode
            )
            try:
                resp = await self._aclient.chat.completions.create(**body)
            except Exception as exc:
                if self._is_format_rejection(exc) and self._downgrade(type(exc).__name__):
                    continue
                self.stats["api_error"] += 1
                raise

            raw = (resp.choices[0].message.content or "").strip()
            value, failure = self._coerce(raw, schema)
            if failure is None:
                self.stats["ok"] += 1
                if attempts:
                    self.stats["ok_after_repair"] += 1
                return value

            attempts += 1
            if attempts > self.max_retries:
                break
            self.stats["retry"] += 1
            repair = (
                f"Your previous reply could not be used: {failure}. "
                "Reply with the JSON object only."
            )

        self.stats["exhausted"] += 1
        raise ValueError(
            f"{self.get_model_name()} did not return schema-valid JSON for "
            f"{getattr(schema, '__name__', 'text')} after "
            f"{self.max_retries + 1} attempts (mode={self._mode})."
        )

    # -- reporting ----------------------------------------------------------

    def report(self) -> dict:
        calls = self.stats["calls"] or 1
        return {
            "model": self.get_model_name(),
            "final_mode": self._mode,
            "calls": self.stats["calls"],
            "first_try_ok": self.stats["ok"] - self.stats["ok_after_repair"],
            "ok_after_repair": self.stats["ok_after_repair"],
            "unrecoverable": self.stats["exhausted"],
            "parse_failures": self.stats["parse_failure"],
            "schema_failures": self.stats["schema_failure"],
            "api_errors": self.stats["api_error"],
            "hit_rate": round(self.stats["ok"] / calls, 4),
            "first_try_rate": round(
                (self.stats["ok"] - self.stats["ok_after_repair"]) / calls, 4
            ),
        }
