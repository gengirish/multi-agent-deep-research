"""
Tests for parsing the insight stage's response.

These exist because of a silent, total failure in production: the parser
required a literal colon (`'INSIGHTS:' in line`), and the gpt-oss family writes
`**INSIGHTS**` instead. No section was ever entered, so a 4,500-character
response full of good insights was discarded in full and the run reported "the
model responded but no insights could be parsed from it". The model was fine;
the parser was matching one provider's formatting habit.

`PRODUCTION_GPT_OSS_RESPONSE` below is the real shape of that response, taken
from run 1e644543's `raw_insights`. Nothing here touches the network.

Run:  pytest tests/test_insight_parsing.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agents.insight_generator import InsightGenerationAgent, _section_of


class Parser(InsightGenerationAgent):
    """The parser alone — the real __init__ builds a model client."""

    def __init__(self):  # noqa: D107
        pass


@pytest.fixture
def parse():
    return Parser()._parse_insights


# The exact formatting that used to yield nothing: bold headings, no colons,
# `---` rules between sections, and an unbulleted `*Reasoning:*` continuation
# line under each hypothesis.
PRODUCTION_GPT_OSS_RESPONSE = """**INSIGHTS**
- **Retrieval-centric pipelines cut hallucinations** but only when the evidence is high-quality.
- **Second-stage contrastive re-ranking acts as a safety net** for noisy corpora.
- **Prompt-level safeguards** such as chain-of-verification reduce unsupported claims.
- **Hybrid extractive-generative designs** virtually eliminate hallucinations for clear answers.
- **Model scaling alone is insufficient**; larger models amplify both grounding and error.

---

**HYPOTHESES**
- **H1:** *Integrating a contrastive re-ranker that scores documents for factuality helps.*
*Reasoning:* Multiple high-credibility sources report consistent gains.

- **H2:** *A hybrid pipeline that extracts answers when retrieval confidence is high.*
*Reasoning:* The analysis notes it virtually eliminates hallucinations for those cases.

---

**TRENDS**
- **Trend 1 - Retrieval-centric fine-tuning:** Recent work aligns retrieval with generation.
- **Trend 2 - Prompt-driven self-verification:** Growing adoption of chain-of-verification.
- **Trend 3 - Data-centric governance:** Sources stress corpus curation.

---

**REASONING CHAINS**
- **Chain 1:** *If* retrieval quality is high *then* hallucination rates drop.
- **Chain 2:** *If* a re-ranker scores passages *then* unsupported claims fall.
- **Chain 3:** *If* prompts enforce cite-or-admit-unknown *then* fabrication drops.
"""


def test_the_production_response_that_parsed_to_nothing_now_parses(parse):
    """The regression, in the format that actually shipped."""
    out = parse(PRODUCTION_GPT_OSS_RESPONSE)

    assert len(out["insights"]) == 5
    assert len(out["hypotheses"]) == 2
    assert len(out["trends"]) == 3
    assert len(out["reasoning_chains"]) == 3


def test_a_continuation_line_attaches_to_its_item(parse):
    """gpt-oss puts `*Reasoning:* …` on its own unbulleted line. It belongs to
    the hypothesis above it — dropping it loses the justification, and promoting
    it to an item of its own would invent a hypothesis that does not exist."""
    out = parse(PRODUCTION_GPT_OSS_RESPONSE)

    assert len(out["hypotheses"]) == 2, "the Reasoning line must not become a third item"
    assert "Reasoning:" in out["hypotheses"][0]
    assert "contrastive re-ranker" in out["hypotheses"][0]


def test_horizontal_rules_are_not_collected(parse):
    """`---` starts with a bullet character and would otherwise become an item."""
    out = parse(PRODUCTION_GPT_OSS_RESPONSE)

    for section, items in out.items():
        for item in items:
            assert item.strip("-*_ ") != "", f"{section} collected a rule: {item!r}"


def test_a_bullet_mentioning_trends_does_not_reset_the_section(parse):
    """"- **Trend 1 - …:**" contains the word TREND. Treating it as the TRENDS
    heading would silently restart the section and drop what came before."""
    out = parse(PRODUCTION_GPT_OSS_RESPONSE)

    assert len(out["trends"]) == 3
    assert all("Trend" in t for t in out["trends"])


# -- heading formats ---------------------------------------------------------

@pytest.mark.parametrize(
    "heading",
    [
        "INSIGHTS:",            # what the prompt asks for, and Gemini obeys
        "**INSIGHTS**",         # gpt-oss
        "**Insights:**",
        "## Insights",          # markdown heading
        "### KEY INSIGHTS",
        "1. Insights",
        "Key Insights (3-5):",
        "insights",
    ],
)
def test_heading_variants_are_recognised(parse, heading):
    out = parse(f"{heading}\n- first\n- second\n")
    assert out["insights"] == ["first", "second"], heading


@pytest.mark.parametrize(
    "line",
    [
        "- **Trend 1 - Retrieval-centric fine-tuning:** recent work shows gains",
        "The analysis identified several trends across the retrieved sources.",
        "*Reasoning:* insights from multiple sources converge here",
        "- insights are useful",
    ],
)
def test_prose_and_bullets_are_not_mistaken_for_headings(line):
    assert _section_of(line) is None, line


@pytest.mark.parametrize(
    "marker", ["-", "*", "+", "•", "1.", "2)"]
)
def test_bullet_markers(parse, marker):
    out = parse(f"INSIGHTS:\n{marker} the item\n")
    assert out["insights"] == ["the item"], marker


def test_an_italic_start_is_prose_not_a_bullet(parse):
    """`*Reasoning:*` opens with an asterisk but is italic markup, not a bullet.
    Reading it as a bullet is what would make it a separate item."""
    out = parse("INSIGHTS:\n- the claim\n*Reasoning:* because of the evidence\n")

    assert out["insights"] == ["the claim *Reasoning:* because of the evidence"]


# -- degenerate input --------------------------------------------------------

def test_an_empty_response_yields_empty_lists(parse):
    out = parse("")
    assert out == {"insights": [], "hypotheses": [], "trends": [], "reasoning_chains": []}


def test_a_response_with_no_headings_yields_nothing(parse):
    """Better to report nothing parsed than to guess which section prose is."""
    out = parse("I'm afraid I can't help with that request.\n- a stray bullet\n")
    assert all(not v for v in out.values())


def test_preamble_before_the_first_heading_is_ignored(parse):
    out = parse("Sure! Here are the insights you asked for:\n\nINSIGHTS:\n- real one\n")
    assert out["insights"] == ["real one"]


def test_the_gemini_style_response_still_works(parse):
    """The format the prompt asks for must not regress while fixing the other."""
    out = parse(
        "INSIGHTS:\n- one\n- two\n\nHYPOTHESES:\n- h one\n\nTRENDS:\n"
        "- Trend 1: description\n\nREASONING CHAINS:\n- Chain 1: if x then y\n"
    )
    assert out["insights"] == ["one", "two"]
    assert out["hypotheses"] == ["h one"]
    assert out["trends"] == ["Trend 1: description"]
    assert out["reasoning_chains"] == ["Chain 1: if x then y"]
