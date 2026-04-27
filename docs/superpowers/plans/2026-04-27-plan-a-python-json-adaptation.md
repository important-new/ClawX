# Plan A: Python --json & Log Protocol Adaptation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--json` machine-readable output to all 5 quality-check scripts, and extend log protocol with `PHASE:`/`CAPTCHA:` signals, enabling ClawX to programmatically parse results.

**Architecture:** Each check script gets a `--json` argparse flag. When set, suppress human-readable console output and emit a single JSON object to stdout conforming to a shared schema. A new `qc_json.py` utility in `.agent/skills/common/` provides the output helper. Exit code 0 = pass, 1 = fail.

**Tech Stack:** Python 3.12+, argparse, json, pytest (new test file)

**Codebase:** `D:\Code\amazon`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `.agent/skills/common/qc_json.py` | Shared JSON output helper + schema |
| Create | `.agent/skills/tests/test_qc_json.py` | Unit tests for all --json outputs |
| Modify | `.agent/skills/amazon-keyword-research/scripts/check_keyword_research.py` | Add --json to keyword check |
| Modify | `.agent/skills/amazon-check-seller/scripts/check_product_small_seller.py` | Add --json to seller check |
| Modify | `.agent/skills/amazon-list-storefront/scripts/check_store_list.py` | Add --json to store check |
| Modify | `.agent/skills/amazon-get-product/scripts/check_product_potential.py` | Add --json to PDP check |
| Modify | `.agent/skills/sellersprite-search-products/scripts/check_product_base.py` | Add --json to category check |

---

### Task 1: Create shared QC JSON utility

**Files:**
- Create: `.agent/skills/common/qc_json.py`
- Create: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test file**

```python
# .agent/skills/tests/test_qc_json.py
"""Tests for qc_json shared utility."""
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "common"))
from qc_json import build_qc_result


def test_build_qc_result_pass():
    result = build_qc_result(
        phase="seller_verification",
        passed=True,
        metrics={"total": 312, "success": 310, "failed": 2, "success_rate": 0.9936},
        threshold=0.95,
    )
    assert result["phase"] == "seller_verification"
    assert result["pass"] is True
    assert result["metrics"]["total"] == 312
    assert result["threshold"] == 0.95
    assert "timestamp" in result


def test_build_qc_result_fail_with_recrawl():
    result = build_qc_result(
        phase="store_check",
        passed=False,
        metrics={"total": 100, "success": 80, "failed": 20, "success_rate": 0.8},
        threshold=0.90,
        recrawl_csv="recrawl_store.csv",
        recrawl_count=20,
    )
    assert result["pass"] is False
    assert result["recrawl_csv"] == "recrawl_store.csv"
    assert result["recrawl_count"] == 20


def test_build_qc_result_minimal():
    result = build_qc_result(
        phase="category_sampling",
        passed=True,
        metrics={"total_saved": 5000},
    )
    assert "threshold" not in result
    assert "recrawl_csv" not in result
    assert result["pass"] is True


def test_build_qc_result_with_details():
    result = build_qc_result(
        phase="keyword_research",
        passed=True,
        metrics={"total": 45, "p1_ok": 45, "p2_ok": 44},
        details={"p2_failed_asins": ["B0GFN1ZKSP"]},
    )
    assert result["details"]["p2_failed_asins"] == ["B0GFN1ZKSP"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py -v`
Expected: FAIL with "ModuleNotFoundError" or "cannot import name 'build_qc_result'"

- [ ] **Step 3: Write the utility**

```python
# .agent/skills/common/qc_json.py
"""Shared utility for quality-check JSON output.

All check_*.py scripts use this to produce machine-readable output
when invoked with --json, enabling ClawX to parse results programmatically.
"""
import json
import sys
from datetime import datetime, timezone


def build_qc_result(
    phase: str,
    passed: bool,
    metrics: dict,
    threshold: float | None = None,
    recrawl_csv: str | None = None,
    recrawl_count: int = 0,
    details: dict | None = None,
) -> dict:
    """Build a standardized quality-check result dict."""
    result: dict = {
        "phase": phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pass": passed,
        "metrics": metrics,
    }
    if threshold is not None:
        result["threshold"] = threshold
    if recrawl_csv:
        result["recrawl_csv"] = recrawl_csv
        result["recrawl_count"] = recrawl_count
    if details:
        result["details"] = details
    return result


def emit_qc_json(result: dict) -> None:
    """Print QC result as JSON to stdout and exit with appropriate code."""
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["pass"] else 1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd D:\Code\amazon
git add .agent/skills/common/qc_json.py .agent/skills/tests/test_qc_json.py
git commit -m "feat: add shared QC JSON utility for machine-readable check output"
```

---

### Task 2: Add --json to check_keyword_research.py

**Files:**
- Modify: `.agent/skills/amazon-keyword-research/scripts/check_keyword_research.py`
- Modify: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test**

Append to `.agent/skills/tests/test_qc_json.py`:

```python
import subprocess


def test_check_keyword_research_json_schema(tmp_path):
    """Verify --json output schema by running the actual script with mock data."""
    # Create minimal mock session structure
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    kw_dir = data_dir / "detail" / "keywords"
    kw_dir.mkdir(parents=True)
    thumbs_dir = kw_dir / "thumbs"
    thumbs_dir.mkdir()

    # Create product_potential.csv with 2 test ASINs
    csv_path = data_dir / "product_potential.csv"
    csv_path.write_text("asin\nB000TEST01\nB000TEST02\n", encoding="utf-8-sig")

    # Create raw keyword data for ASIN 1 (Phase 1 pass)
    raw1 = kw_dir / "B000TEST01_keywords_raw.json"
    raw1.write_text(json.dumps({"raw_http": {"data": [{"keyword": "test"}]}}), encoding="utf-8")

    # Create competitor data for ASIN 1 (Phase 2 pass)
    comp1 = kw_dir / "B000TEST01_low_review_competitors.json"
    comp1.write_text(json.dumps({
        "test keyword": [{"asin": "B000COMP01", "reviewCount": 50}],
        "test keyword 2": [{"asin": "B000COMP02", "reviewCount": 30}],
    }), encoding="utf-8")

    # Create thumb for comp1
    (thumbs_dir / "B000COMP01.jpg").write_bytes(b"\xff\xd8\xff\xe0fake_jpg")
    (thumbs_dir / "B000COMP02.jpg").write_bytes(b"\xff\xd8\xff\xe0fake_jpg")

    # ASIN 2: no data at all (Phase 1+2 fail)

    script = os.path.join(
        os.path.dirname(__file__), "..", "amazon-keyword-research", "scripts", "check_keyword_research.py"
    )
    result = subprocess.run(
        ["uv", "run", script, "--data-dir", str(data_dir), "--report-dir", str(tmp_path), "--check", "--json"],
        capture_output=True, text=True, cwd="D:\\Code\\amazon",
    )

    data = json.loads(result.stdout)
    assert data["phase"] == "keyword_research"
    assert "metrics" in data
    assert "total" in data["metrics"]
    assert "p1_success" in data["metrics"]
    assert "p2_success" in data["metrics"]
    assert isinstance(data["pass"], bool)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_keyword_research_json_schema -v`
Expected: FAIL (--json flag not recognized or output not JSON)

- [ ] **Step 3: Add --json flag to check_keyword_research.py**

In `check_keyword_research.py`, add argument at line 300 (after `--delete`):

```python
parser.add_argument("--json", action="store_true", dest="json_output", help="输出机器可读 JSON (供 ClawX 解析)")
```

Modify `cmd_check()` signature at line 126 to accept `json_output: bool = False`:

```python
def cmd_check(
    kw_dir: str, data_dir: str, report_dir: str | None = None,
    delete_files: bool = False, path_arg: str = "", json_output: bool = False
):
```

After line 210 (after thumbnail stats print), before the recrawl suggestions, add JSON output block:

```python
    if json_output:
        import sys as _sys
        _SCRIPTS_DIR_J = os.path.dirname(os.path.abspath(__file__))
        _sys.path.insert(0, os.path.join(_SCRIPTS_DIR_J, "..", "..", "common"))
        from qc_json import build_qc_result, emit_qc_json

        p1_rate = stats["p1_ok"] / total if total > 0 else 0
        p2_rate = stats["p2_ok"] / total if total > 0 else 0
        p1_threshold = 0.95
        p2_threshold = 0.90
        passed = p1_rate >= p1_threshold and p2_rate >= p2_threshold

        qc = build_qc_result(
            phase="keyword_research",
            passed=passed,
            metrics={
                "total": total,
                "p1_success": stats["p1_ok"],
                "p1_failed": len(p1_failed_asins),
                "p1_success_rate": round(p1_rate, 4),
                "p2_success": stats["p2_ok"],
                "p2_failed": len(p2_failed_asins),
                "p2_success_rate": round(p2_rate, 4),
                "missing_thumbs": total_missing_thumbs,
            },
            threshold=p2_threshold,
            recrawl_csv=os.path.basename(recrawl_study_file) if p2_failed_asins else None,
            recrawl_count=len(p2_failed_asins),
            details={
                "p1_failed_asins": p1_failed_asins,
                "p2_failed_asins": p2_failed_asins,
                "asins_with_missing_thumbs": asins_with_missing,
            },
        )
        emit_qc_json(qc)
```

Update the call site at line 315:

```python
    if args.check:
        cmd_check(kw_dir, data_dir, report_dir=report_dir, delete_files=args.delete,
                  path_arg=path_arg, json_output=args.json_output)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_keyword_research_json_schema -v`
Expected: PASS

- [ ] **Step 5: Manual verification**

Run: `cd D:\Code\amazon && uv run .agent/skills/amazon-keyword-research/scripts/check_keyword_research.py --session 20260426-1 --check --json`
Expected: JSON output with actual session data

- [ ] **Step 6: Commit**

```bash
git add .agent/skills/amazon-keyword-research/scripts/check_keyword_research.py .agent/skills/tests/test_qc_json.py
git commit -m "feat(keyword): add --json output to check_keyword_research.py"
```

---

### Task 3: Add --json to check_product_small_seller.py

**Files:**
- Modify: `.agent/skills/amazon-check-seller/scripts/check_product_small_seller.py`
- Modify: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test**

Append to `.agent/skills/tests/test_qc_json.py`:

```python
def test_check_product_small_seller_json_schema(tmp_path):
    """Verify seller check --json output schema."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    seller_dir = data_dir / "detail" / "seller"
    seller_dir.mkdir(parents=True)

    # Create product_base.csv with seller IDs
    csv_path = data_dir / "product_base.csv"
    csv_path.write_text("asin,sellerID\nB000TEST01,A1SELLER01\nB000TEST02,A1SELLER02\n", encoding="utf-8-sig")

    # Create valid seller JSON for seller 1
    seller1 = seller_dir / "seller_A1SELLER01.json"
    seller1.write_text(json.dumps({
        "seller_id": "A1SELLER01", "store_name": "TestStore",
        "ratings": {"lifetime": {"count": 50, "rating": 4.5}},
    }), encoding="utf-8")

    # Seller 2: missing file

    script = os.path.join(
        os.path.dirname(__file__), "..", "amazon-check-seller", "scripts", "check_product_small_seller.py"
    )
    result = subprocess.run(
        ["uv", "run", script, "--data-dir", str(data_dir), "--report-dir", str(tmp_path), "--check", "--json"],
        capture_output=True, text=True, cwd="D:\\Code\\amazon",
    )

    data = json.loads(result.stdout)
    assert data["phase"] == "seller_verification"
    assert "total" in data["metrics"]
    assert "success" in data["metrics"]
    assert "success_rate" in data["metrics"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_small_seller_json_schema -v`
Expected: FAIL

- [ ] **Step 3: Add --json to check_product_small_seller.py**

Add argparse argument (after `--delete`):
```python
parser.add_argument("--json", action="store_true", dest="json_output", help="输出机器可读 JSON")
```

Add `json_output` parameter to `cmd_check()` and insert JSON output block after the console summary, before recrawl suggestions:

```python
    if json_output:
        import sys as _sys
        _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "common"))
        from qc_json import build_qc_result, emit_qc_json

        success_rate = ok / total if total > 0 else 0
        threshold = 0.95
        passed = success_rate >= threshold

        qc = build_qc_result(
            phase="seller_verification",
            passed=passed,
            metrics={
                "total": total,
                "success": ok,
                "failed": len(results),
                "success_rate": round(success_rate, 4),
                "need_recrawl": need_recrawl,
                "normal_miss": normal_miss,
            },
            threshold=threshold,
            recrawl_csv="recrawl_seller.csv" if need_recrawl > 0 else None,
            recrawl_count=need_recrawl,
        )
        emit_qc_json(qc)
```

Pass `json_output=args.json_output` at call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_small_seller_json_schema -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .agent/skills/amazon-check-seller/scripts/check_product_small_seller.py .agent/skills/tests/test_qc_json.py
git commit -m "feat(seller): add --json output to check_product_small_seller.py"
```

---

### Task 4: Add --json to check_store_list.py

**Files:**
- Modify: `.agent/skills/amazon-list-storefront/scripts/check_store_list.py`
- Modify: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test**

Append to test file:

```python
def test_check_store_list_json_schema(tmp_path):
    """Verify store check --json output schema."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    store_dir = data_dir / "detail" / "store"
    store_dir.mkdir(parents=True)

    # Create seller_list.csv
    csv_path = data_dir / "seller_list.csv"
    csv_path.write_text("sellerID\nA1SELLER01\n", encoding="utf-8-sig")

    # Create valid store JSON
    store1 = store_dir / "store_A1SELLER01.json"
    store1.write_text(json.dumps({
        "seller_id": "A1SELLER01",
        "products": [{"asin": "B000T01", "title": "Test", "price": 29.99}],
    }), encoding="utf-8")

    script = os.path.join(
        os.path.dirname(__file__), "..", "amazon-list-storefront", "scripts", "check_store_list.py"
    )
    result = subprocess.run(
        ["uv", "run", script, "--data-dir", str(data_dir), "--report-dir", str(tmp_path), "--check", "--json"],
        capture_output=True, text=True, cwd="D:\\Code\\amazon",
    )

    data = json.loads(result.stdout)
    assert data["phase"] == "store_check"
    assert "total" in data["metrics"]
    assert "success" in data["metrics"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_store_list_json_schema -v`

- [ ] **Step 3: Add --json to check_store_list.py**

Add argparse argument:
```python
parser.add_argument("--json", action="store_true", dest="json_output", help="输出机器可读 JSON")
```

Add `json_output` parameter to `cmd_check()`. Insert JSON output after stats summary:

```python
    if json_output:
        import sys as _sys
        _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "common"))
        from qc_json import build_qc_result, emit_qc_json

        success_rate = stats["ok"] / stats["total"] if stats["total"] > 0 else 0
        threshold = 0.90
        passed = success_rate >= threshold
        need_recrawl = stats["struct_err"] + stats["data_miss"]

        qc = build_qc_result(
            phase="store_check",
            passed=passed,
            metrics={
                "total": stats["total"],
                "success": stats["ok"],
                "failed": stats["total"] - stats["ok"],
                "success_rate": round(success_rate, 4),
                "struct_err": stats["struct_err"],
                "data_miss": stats["data_miss"],
                "thumb_miss": stats["thumb_miss"],
            },
            threshold=threshold,
            recrawl_csv="recrawl_store.csv" if need_recrawl > 0 else None,
            recrawl_count=need_recrawl,
        )
        emit_qc_json(qc)
```

Pass `json_output=args.json_output` at call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_store_list_json_schema -v`

- [ ] **Step 5: Commit**

```bash
git add .agent/skills/amazon-list-storefront/scripts/check_store_list.py .agent/skills/tests/test_qc_json.py
git commit -m "feat(store): add --json output to check_store_list.py"
```

---

### Task 5: Add --json to check_product_potential.py

**Files:**
- Modify: `.agent/skills/amazon-get-product/scripts/check_product_potential.py`
- Modify: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test**

Append to test file:

```python
def test_check_product_potential_json_schema(tmp_path):
    """Verify PDP check --json output schema."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    detail_dir = data_dir / "detail" / "pdp"
    detail_dir.mkdir(parents=True)

    # Create product_potential.csv (used when --csv not provided, script reads from data_dir)
    csv_path = data_dir / "product_potential_store.csv"
    csv_path.write_text("asin,categories\nB000TEST01,TestCat\n", encoding="utf-8-sig")

    # Create PDP JSON with required fields
    pdp = detail_dir / "B000TEST01.json"
    pdp.write_text(json.dumps({
        "asin": "B000TEST01",
        "quick_view": {"title": "Test Product"},
        "keepa_data": {"csv": [0, 100]},
    }), encoding="utf-8")

    script = os.path.join(
        os.path.dirname(__file__), "..", "amazon-get-product", "scripts", "check_product_potential.py"
    )
    result = subprocess.run(
        ["uv", "run", script, "--data-dir", str(data_dir), "--report-dir", str(tmp_path),
         "--check", "--json", "--csv", str(csv_path)],
        capture_output=True, text=True, cwd="D:\\Code\\amazon",
    )

    data = json.loads(result.stdout)
    assert data["phase"] == "product_detail"
    assert "total" in data["metrics"]
    assert "success" in data["metrics"]
    assert "miss_keepa_data" in data["metrics"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_potential_json_schema -v`

- [ ] **Step 3: Add --json to check_product_potential.py**

Add argparse argument:
```python
parser.add_argument("--json", action="store_true", dest="json_output", help="输出机器可读 JSON")
```

Add `json_output` parameter to `cmd_check()`. Insert JSON output after stats summary:

```python
    if json_output:
        import sys as _sys
        _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "common"))
        from qc_json import build_qc_result, emit_qc_json

        success_rate = stats["ok"] / stats["total"] if stats["total"] > 0 else 0
        threshold = 0.90
        passed = success_rate >= threshold

        qc = build_qc_result(
            phase="product_detail",
            passed=passed,
            metrics={
                "total": stats["total"],
                "success": stats["ok"],
                "failed": stats["total"] - stats["ok"],
                "success_rate": round(success_rate, 4),
                "miss_qv": stats["miss_qv"],
                "miss_keepa_data": stats["miss_keepa_data"],
                "miss_keepa_png": stats["miss_keepa_png"],
                "miss_main_img": stats["miss_main_img"],
            },
            threshold=threshold,
            recrawl_csv="recrawl_pdp.csv" if data_miss_asins else None,
            recrawl_count=len(data_miss_asins),
            details={
                "data_miss_asins": [a for a, _ in data_miss_asins],
                "media_miss_asins": [a for a, _ in media_miss_asins],
            },
        )
        emit_qc_json(qc)
```

Pass `json_output=args.json_output` at call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_potential_json_schema -v`

- [ ] **Step 5: Commit**

```bash
git add .agent/skills/amazon-get-product/scripts/check_product_potential.py .agent/skills/tests/test_qc_json.py
git commit -m "feat(pdp): add --json output to check_product_potential.py"
```

---

### Task 6: Add --json to check_product_base.py

**Files:**
- Modify: `.agent/skills/sellersprite-search-products/scripts/check_product_base.py`
- Modify: `.agent/skills/tests/test_qc_json.py`

- [ ] **Step 1: Write the test**

Append to test file:

```python
def test_check_product_base_json_schema(tmp_path):
    """Verify category check --json output schema."""
    data_dir = tmp_path / "data"
    report_dir = data_dir / "categories"
    cat_dir = report_dir / "TestCategory"
    cat_dir.mkdir(parents=True)

    # Create a valid page JSON
    page = cat_dir / "page_001.json"
    page.write_text(json.dumps({
        "products": [
            {"asin": "B000T01", "sellerID": "S01"},
            {"asin": "B000T02", "sellerID": "S02"},
        ],
        "total": 2,
    }), encoding="utf-8")

    script = os.path.join(
        os.path.dirname(__file__), "..", "sellersprite-search-products", "scripts", "check_product_base.py"
    )
    result = subprocess.run(
        ["uv", "run", script, "--data-dir", str(data_dir), "--report-dir", str(tmp_path), "--check", "--json"],
        capture_output=True, text=True, cwd="D:\\Code\\amazon",
    )

    data = json.loads(result.stdout)
    assert data["phase"] == "category_sampling"
    assert "total_saved" in data["metrics"]
    assert "categories_count" in data["metrics"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_base_json_schema -v`

- [ ] **Step 3: Add --json to check_product_base.py**

Add argparse argument:
```python
parser.add_argument("--json", action="store_true", dest="json_output", help="输出机器可读 JSON")
```

Phase 1 (category sampling) is special: no fixed threshold, always requires user confirmation. Set `pass=True` always and provide metrics for user to review.

```python
    if json_output:
        import sys as _sys
        _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "common"))
        from qc_json import build_qc_result, emit_qc_json

        total_saved = sum(r["saved"] for r in rows)
        total_avail = sum(r["total_avail"] for r in rows)
        bad_cats = [r for r in rows if r.get("truncated") or r.get("parse_errors", 0) > 0]

        qc = build_qc_result(
            phase="category_sampling",
            passed=True,  # Phase 1: always pass, user confirms
            metrics={
                "total_saved": total_saved,
                "total_available": total_avail,
                "categories_count": len(rows),
                "categories_with_issues": len(bad_cats),
                "requires_user_confirmation": True,
            },
            details={
                "categories": [
                    {"name": r["cat"], "saved": r["saved"], "available": r["total_avail"],
                     "truncated": r.get("truncated", False)}
                    for r in rows
                ],
            },
        )
        emit_qc_json(qc)
```

Pass `json_output=args.json_output` at call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py::test_check_product_base_json_schema -v`

- [ ] **Step 5: Run all tests**

Run: `cd D:\Code\amazon && uv run pytest .agent/skills/tests/test_qc_json.py -v`
Expected: All 8 tests pass (4 unit + 4 integration)

- [ ] **Step 6: Commit**

```bash
git add .agent/skills/sellersprite-search-products/scripts/check_product_base.py .agent/skills/tests/test_qc_json.py
git commit -m "feat(category): add --json output to check_product_base.py"
```

---

### Task 7: Add PHASE: and CAPTCHA: log protocol to scraping scripts

**Files:**
- Modify: `.agent/skills/amazon-keyword-research/scripts/keyword_research.py` (CAPTCHA signal)
- Modify: `.agent/skills/common/logger.py` (optional: add phase_signal helper)

- [ ] **Step 1: Add phase_signal helper to logger.py**

```python
# Append to .agent/skills/common/logger.py

def phase_signal(phase: str, step: str) -> None:
    """Emit a PHASE: signal for ClawX executor to parse."""
    print(f"PHASE: {phase} {step}", flush=True)


def captcha_signal() -> None:
    """Emit a CAPTCHA: signal for ClawX executor to parse."""
    print("CAPTCHA: waiting", flush=True)
```

- [ ] **Step 2: Verify keyword_research.py CAPTCHA detection location**

Read the script to find where CAPTCHA is currently detected (look for existing `PROGRESS: PAUSED` patterns). Add `captcha_signal()` call alongside the existing CAPTCHA detection so both old and new protocols work.

- [ ] **Step 3: Commit**

```bash
git add .agent/skills/common/logger.py
git commit -m "feat: add PHASE/CAPTCHA log protocol signals for ClawX integration"
```

---

### Task 8: Final integration test with real session

- [ ] **Step 1: Run all check scripts with --json against real session 20260426-1**

```bash
cd D:\Code\amazon
uv run .agent/skills/sellersprite-search-products/scripts/check_product_base.py --session 20260426-1 --check --json
uv run .agent/skills/amazon-check-seller/scripts/check_product_small_seller.py --session 20260426-1 --check --json
uv run .agent/skills/amazon-list-storefront/scripts/check_store_list.py --session 20260426-1 --check --json
uv run .agent/skills/amazon-get-product/scripts/check_product_potential.py --session 20260426-1 --check --json
uv run .agent/skills/amazon-keyword-research/scripts/check_keyword_research.py --session 20260426-1 --check --json
```

Expected: Each outputs valid JSON with `phase`, `pass`, `metrics` fields.

- [ ] **Step 2: Verify backward compatibility (no --json)**

```bash
uv run .agent/skills/amazon-keyword-research/scripts/check_keyword_research.py --session 20260426-1 --check
```

Expected: Normal human-readable output unchanged.

- [ ] **Step 3: Run full test suite**

```bash
cd D:\Code\amazon && uv run pytest .agent/skills/tests/ -v
```

Expected: All tests pass.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: integration test fixes for --json output"
```
