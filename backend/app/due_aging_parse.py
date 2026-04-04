"""
Parse Due desk aging workbooks (.xlsx): company header, location sections (CLT / Kochi / TN),
and tabular rows with Particulars, SAFE, WARNING, DANGER, DOUBTFUL, TOTAL.

Location rows: first-column text mentioning Calicut/CLT, Kochi, or Tamil Nadu/TN (case-insensitive).
Header row: any cell contains 'particulars' and row mentions zone column names (safe, warning, etc.).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from openpyxl import load_workbook

DATE_RANGE_RE = re.compile(
    r"\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}\s+to\s+\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}",
    re.I,
)


@dataclass
class ParsedAgingRow:
    location_group: str
    location_sort: int
    location_label: str
    particulars: str
    safe: float
    warning: float
    danger: float
    doubtful: float
    total: float


@dataclass
class ParsedWorkbook:
    company_title: str
    date_range_label: str
    rows: list[ParsedAgingRow]


def _cell_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _norm_key(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _parse_number(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    t = _cell_str(v).replace(",", "")
    if not t or t == "-":
        return 0.0
    try:
        return float(t)
    except ValueError:
        return 0.0


def _classify_location(text: str) -> tuple[str, int, str]:
    """Return (group_code, sort_key, display_label)."""
    raw = " ".join(text.split())
    low = raw.lower()
    if re.search(r"\bcalicut\b|\bclt\b", low):
        return ("CLT", 0, raw or "CLT / Calicut")
    if re.search(r"\bkochi\b|\bkottayam\b", low):
        return ("KOCHI", 1, raw or "Kochi")
    if re.search(r"\btamil\b|\btn\b|tamilnadu|tamil nadu|\bchennai\b|\bcoimbatore\b", low):
        return ("TN", 2, raw or "Tamil Nadu")
    return ("OTHER", 9, raw or "Other")


def _row_values(row: tuple[Any, ...]) -> list[str]:
    return [_cell_str(c) for c in row]


def _is_grand_total(particulars: str) -> bool:
    t = _norm_key(particulars)
    return "grand" in t and "total" in t


def _is_location_row(cells: list[str]) -> bool:
    joined = " ".join(c for c in cells if c).strip()
    if not joined:
        return False
    low = joined.lower()
    if "particular" in low and "safe" in low:
        return False
    return bool(
        re.search(
            r"\bcalicut\b|\bclt\b|\bkochi\b|\bkottayam\b|\btamil\b|\btn\b|tamilnadu|tamil nadu|\bchennai\b|\bcoimbatore\b",
            low,
        ),
    )


def _is_header_row(cells: list[str]) -> bool:
    joined = " ".join(_norm_key(c) for c in cells)
    if "particular" not in joined:
        return False
    return ("safe" in joined or "warning" in joined or "danger" in joined or "doubtful" in joined)


def _map_header_indices(cells: list[str]) -> dict[str, int]:
    """Map bucket keys to 0-based column index."""
    idx: dict[str, int] = {}
    for i, c in enumerate(cells):
        k = _norm_key(c)
        if not k:
            continue
        if "particular" in k:
            idx.setdefault("particulars", i)
        if k == "safe" or k.startswith("safe "):
            idx.setdefault("safe", i)
        if "warning" in k:
            idx.setdefault("warning", i)
        if "danger" in k:
            idx.setdefault("danger", i)
        if "doubtful" in k:
            idx.setdefault("doubtful", i)
        if k == "total" or k.startswith("total "):
            idx.setdefault("total", i)
    return idx


def parse_due_aging_xlsx(file_bytes: bytes) -> ParsedWorkbook:
    wb = load_workbook(BytesIO(file_bytes), data_only=True, read_only=True)
    try:
        ws = wb.active
        title_guess = ""
        date_range = ""
        preamble_done = False

        current_group = "OTHER"
        current_sort = 9
        current_label = "General"

        col_map: dict[str, int] = {}
        in_table = False
        out_rows: list[ParsedAgingRow] = []

        for row in ws.iter_rows(values_only=True):
            cells = _row_values(row)
            if not any(x for x in cells):
                continue

            joined_display = " ".join(cells).strip()
            low_line = joined_display.lower()

            m_dates = DATE_RANGE_RE.search(joined_display)
            if m_dates:
                date_range = m_dates.group(0).strip()

            if not preamble_done and not _is_location_row(cells) and not _is_header_row(cells):
                if not title_guess and cells[0]:
                    title_guess = cells[0]
                elif cells[0] and len(cells[0]) > 5 and "particular" not in low_line:
                    title_guess = title_guess or cells[0]

            if _is_location_row(cells):
                preamble_done = True
                grp, srt, lab = _classify_location(joined_display)
                current_group, current_sort, current_label = grp, srt, lab
                in_table = False
                col_map = {}
                continue

            if _is_header_row(cells):
                preamble_done = True
                col_map = _map_header_indices(cells)
                if "particulars" not in col_map:
                    col_map["particulars"] = 0
                in_table = True
                continue

            if not in_table or not col_map:
                continue

            pi = col_map.get("particulars", 0)
            particulars = cells[pi] if pi < len(cells) else ""
            if not particulars or not particulars.strip():
                continue
            if _is_grand_total(particulars):
                continue

            def col(name: str, default: int = 0) -> float:
                j = col_map.get(name)
                if j is None or j >= len(cells):
                    return 0.0
                return _parse_number(cells[j])

            s = col("safe")
            w = col("warning")
            dg = col("danger")
            db = col("doubtful")
            tot = col("total")
            if tot == 0.0 and (s or w or dg or db):
                tot = s + w + dg + db

            out_rows.append(
                ParsedAgingRow(
                    location_group=current_group,
                    location_sort=current_sort,
                    location_label=current_label,
                    particulars=particulars.strip(),
                    safe=s,
                    warning=w,
                    danger=dg,
                    doubtful=db,
                    total=tot,
                ),
            )

        if not title_guess:
            title_guess = ""

        return ParsedWorkbook(
            company_title=title_guess.strip(),
            date_range_label=date_range.strip(),
            rows=out_rows,
        )
    finally:
        wb.close()
