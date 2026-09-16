"""Planner に渡すカタログ（答え無し）が、先生の説明と食い違わないこと。"""

from __future__ import annotations

from server.agent.answers import MODEL_ANSWERS
from server.agent.catalog import CATALOG, candidates_for


def test_every_experiment_has_a_model_answer_and_nothing_else_does():
    ids = {v.id for theme in CATALOG.values() for v in theme.variants}

    assert ids == set(MODEL_ANSWERS)


def test_catalog_holds_no_answers():
    text = " ".join(
        f"{t.title} {t.question} "
        + " ".join(f"{v.title} {v.changes} {v.holds}" for v in t.variants)
        for t in CATALOG.values()
    )

    for answer in MODEL_ANSWERS.values():
        assert answer.explanation not in text


def test_candidates_put_undone_experiments_first_and_never_run_out():
    assert [v.id for v in candidates_for("sound", ())] == [
        "sound_pluck_strength",
        "sound_string_length",
    ]
    assert [v.id for v in candidates_for("sound", ("sound_pluck_strength",))] == [
        "sound_string_length"
    ]
    assert [
        v.id for v in candidates_for("sound", ("sound_pluck_strength", "sound_string_length"))
    ] == [
        "sound_pluck_strength",
        "sound_string_length",
    ]
