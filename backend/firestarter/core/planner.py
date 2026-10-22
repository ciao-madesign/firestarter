"""Planner: unisce le attivita' dei workflow, verifica le dipendenze, calcola ordine e parallelismo."""

from __future__ import annotations

import hashlib
import json
from typing import Iterable

from .types import TaskSpec


class PlanError(ValueError):
    pass


def qualify(workflow_id: str, specs: Iterable[TaskSpec]) -> list[TaskSpec]:
    """Prefissa chiavi e dipendenze locali con l'id del workflow (progetti misti).

    Una dipendenza che contiene gia' un '.' e' considerata gia' qualificata
    e puo' puntare a un task di un altro workflow.
    """
    out = []
    for s in specs:
        s = s.model_copy(deep=True)
        s.key = f"{workflow_id}.{s.key}"
        s.depends_on = [d if "." in d else f"{workflow_id}.{d}" for d in s.depends_on]
        out.append(s)
    return out


def topological_order(specs: list[TaskSpec]) -> list[TaskSpec]:
    by_key = {s.key: s for s in specs}
    if len(by_key) != len(specs):
        raise PlanError("chiavi di attivita' duplicate")
    for s in specs:
        for d in s.depends_on:
            if d not in by_key:
                raise PlanError(f"{s.key} dipende da un'attivita' inesistente: {d}")
    order: list[TaskSpec] = []
    state: dict[str, int] = {}

    def visit(key: str, trail: list[str]) -> None:
        if state.get(key) == 2:
            return
        if state.get(key) == 1:
            raise PlanError("dipendenza circolare: " + " -> ".join([*trail, key]))
        state[key] = 1
        for d in by_key[key].depends_on:
            visit(d, [*trail, key])
        state[key] = 2
        order.append(by_key[key])

    for s in specs:
        visit(s.key, [])
    return order


def parallel_levels(specs: list[TaskSpec]) -> list[list[str]]:
    """Gruppi di attivita' indipendenti tra loro (utile alla UI; l'esecuzione resta seriale, RF-17)."""
    level: dict[str, int] = {}
    for s in topological_order(specs):
        level[s.key] = 1 + max((level[d] for d in s.depends_on), default=-1)
    groups: dict[int, list[str]] = {}
    for k, lv in level.items():
        groups.setdefault(lv, []).append(k)
    return [groups[i] for i in sorted(groups)]


def dependents_of(keys: Iterable[str], tasks: list[dict]) -> set[str]:
    """Chiavi di tutti i task che dipendono, direttamente o no, da quelli indicati."""
    result: set[str] = set()
    frontier = set(keys)
    while frontier:
        nxt = {t["key"] for t in tasks if set(t["depends_on"]) & frontier} - result
        result |= nxt
        frontier = nxt
    return result


def spec_hash(spec: TaskSpec, rendered_params: dict) -> str:
    payload = {
        "connector": spec.connector,
        "operation": spec.operation,
        "params": rendered_params,
        "depends_on": spec.depends_on,
        "outputs": spec.outputs,
        "validations": [v.model_dump() for v in spec.validations],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
