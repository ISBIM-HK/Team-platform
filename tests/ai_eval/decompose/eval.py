"""Decompose AI evaluation harness.

Runs every cases/*.yaml through the decomposition agent, applies hard
assertions (subtask count / confidence / estimate / keyword coverage) and an
LLM-as-judge quality score, then writes a run record to ../runs/ (gitignored).

Run from project root:
    python tests/ai_eval/decompose/eval.py
    PASS_SCORE=0.75 python tests/ai_eval/decompose/eval.py   # tune judge threshold
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from src.ai.decompose import decompose_goal  # noqa: E402
from src.ai.runtime import pi_completion  # noqa: E402
from src.ai.schemas import DecompositionPlan  # noqa: E402
from src.core.config import get_settings  # noqa: E402

CASES_DIR = Path(__file__).parent / "cases"
RUNS_DIR = Path(__file__).parent.parent / "runs"  # tests/ai_eval/runs (gitignored)
PASS_SCORE = float(os.getenv("PASS_SCORE", "0.7"))


class JudgeResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0, description="拆解质量综合评分")
    covers_all: bool = Field(description="是否覆盖目标的全部子需求")
    notes: str = Field(description="简短评语，指出缺失或亮点")


JUDGE_SYSTEM = (
    "你是严格的技术评审，按给定标准评估一份任务拆解的质量。"
    "宁可严格也不要放水；缺失关键子需求要明显扣分。只输出结构化评分。"
)


async def _judge(prompt: str) -> JudgeResult:
    schema = JudgeResult.model_json_schema()
    schema_instr = (
        "\n\n请严格按以下 JSON Schema 返回，不要包含任何其他文字：\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n```"
    )
    messages = [
        {"role": "system", "content": JUDGE_SYSTEM + schema_instr},
        {"role": "user", "content": prompt},
    ]
    content = await pi_completion(messages, model=get_settings().llm_model_strong)
    return JudgeResult.model_validate_json(content)


def hard_checks(plan: DecompositionPlan, expect: dict) -> list[str]:
    issues: list[str] = []
    n = len(plan.subtasks)
    if not (expect["min_subtasks"] <= n <= expect["max_subtasks"]):
        issues.append(f"子任务数 {n} 不在 [{expect['min_subtasks']},{expect['max_subtasks']}]")
    if plan.confidence < expect["min_confidence"]:
        issues.append(f"confidence {plan.confidence} < {expect['min_confidence']}")
    if expect.get("all_have_estimate") and any(st.estimated_hours is None for st in plan.subtasks):
        issues.append("有子任务缺 estimated_hours")
    blob = " ".join(f"{st.title} {st.description}" for st in plan.subtasks)
    for group in expect.get("coverage", []):
        if not any(kw in blob for kw in group):
            issues.append(f"未覆盖关键词组 {group}")
    return issues


async def run_case(path: Path) -> dict:
    case = yaml.safe_load(path.read_text(encoding="utf-8"))
    plan = await decompose_goal(case["goal"], case.get("team_context", ""))
    issues = hard_checks(plan, case["expect"])

    judge_input = (
        f"## 目标\n{case['goal']}\n\n## 评分标准\n{case.get('judge_rubric', '')}\n\n"
        f"## 待评拆解\n{json.dumps(plan.model_dump(), ensure_ascii=False, indent=2)}"
    )
    jr = await _judge(judge_input)

    hard_pass = not issues
    judge_pass = jr.score >= PASS_SCORE and jr.covers_all
    return {
        "name": case["name"],
        "subtasks": len(plan.subtasks),
        "confidence": plan.confidence,
        "hard_pass": hard_pass,
        "hard_issues": issues,
        "judge_score": jr.score,
        "judge_covers_all": jr.covers_all,
        "judge_notes": jr.notes,
        "pass": hard_pass and judge_pass,
        "plan": plan.model_dump(),
    }


async def main() -> int:
    cases = sorted(CASES_DIR.glob("*.yaml"))
    if not cases:
        print("没有用例。")
        return 1

    results = []
    for p in cases:
        print(f"\n▶ 跑用例 {p.name} ...")
        r = await run_case(p)
        results.append(r)
        mark = "✅" if r["pass"] else "❌"
        print(
            f"  {mark} {r['name']}: {r['subtasks']} 子任务 | conf={r['confidence']:.2f} | "
            f"judge={r['judge_score']:.2f} 覆盖全={r['judge_covers_all']}"
        )
        if r["hard_issues"]:
            print(f"    硬断言问题: {r['hard_issues']}")
        print(f"    评审: {r['judge_notes']}")

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out = RUNS_DIR / f"decompose_{ts}.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = sum(1 for r in results if r["pass"])
    print(f"\n=== {passed}/{len(results)} 通过 (阈值 judge≥{PASS_SCORE}) · 详情 {out} ===")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
