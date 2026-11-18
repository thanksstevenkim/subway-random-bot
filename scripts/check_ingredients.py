#!/usr/bin/env python3
"""Daily official ingredient comparison. Safe stop on source or parser anomalies."""
from __future__ import annotations
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

SOURCE_URL = "https://devm.subway.co.kr/more/freshInfo"
CATEGORIES = ("breads", "vegetables", "cheeses", "sauces", "extras")
SECTION_ANCHORS = ("화이트", "양상추", "아메리칸 치즈", "치미추리")
MAX_CHANGES = 8
KCAL = re.compile(r"^\d+(?:\.\d+)?\s*kcal$", re.I)
HANGUL = re.compile(r"[가-힣]")

class Headings(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[list] = []
        self.headings: list[str] = []
        self.ignored = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in {"script", "style", "noscript"}:
            self.ignored += 1
        if re.fullmatch(r"h[1-6]", tag):
            self.stack.append([tag, []])

    def handle_data(self, data: str) -> None:
        if not self.ignored:
            for _, chunks in self.stack:
                chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self.ignored:
            self.ignored -= 1
        if self.stack and self.stack[-1][0] == tag:
            _, chunks = self.stack.pop()
            heading = " ".join(" ".join(chunks).split())
            if heading:
                self.headings.append(heading)

def extract_items(page: str) -> list[str]:
    parser = Headings()
    parser.feed(page)
    seen: list[str] = []
    for preceding, current in zip(parser.headings, parser.headings[1:]):
        if KCAL.fullmatch(current) and HANGUL.search(preceding) and preceding not in seen:
            if len(preceding) > 80:
                raise ValueError("Unexpectedly long ingredient name")
            seen.append(preceding)
    if len(seen) < 25:
        raise ValueError(f"Too few ingredient names ({len(seen)}); source may have changed")
    if not all(anchor in seen for anchor in SECTION_ANCHORS):
        raise ValueError("Required category anchors missing; no changes proposed")
    positions = [seen.index(anchor) for anchor in SECTION_ANCHORS]
    if positions != sorted(positions):
        raise ValueError("Official ingredient section order changed")
    return seen

def classify(name: str, seen: list[str]) -> str | None:
    if name == "아보카도":
        return "extras"
    i = seen.index(name)
    bread, vegetable, cheese, sauce = (seen.index(a) for a in SECTION_ANCHORS)
    if i < bread:
        return None  # Ambiguous new name before the first category anchor.
    if i < vegetable:
        return "breads"
    if i < cheese:
        return "vegetables"
    if i < sauce:
        return "cheeses"
    return "sauces"

def proposal(menu: dict, seen: list[str]) -> tuple[dict, dict[str, dict[str, list[str]]]]:
    proposed = json.loads(json.dumps(menu, ensure_ascii=False))
    diff: dict[str, dict[str, list[str]]] = {}
    for category in CATEGORIES:
        old = menu.get(category)
        if not isinstance(old, list) or not old or not all(isinstance(n, str) for n in old):
            raise ValueError(f"Invalid menu category: {category}")
        observed = [n for n in seen if classify(n, seen) == category]
        if len(observed) < max(1, int(len(old) * 0.6)):
            raise ValueError(f"Suspiciously incomplete category: {category}")
        additions = [n for n in observed if n not in old]
        missing = [n for n in old if n not in observed]
        if additions or missing:
            proposed[category] = [n for n in old if n not in missing] + additions
            diff[category] = {"new_on_official_page": additions, "absent_from_official_page": missing}
    if sum(len(changes[k]) for changes in diff.values() for k in ("new_on_official_page", "absent_from_official_page")) > MAX_CHANGES:
        raise ValueError("Too many simultaneous changes; manual review required")
    return proposed, diff

def render_review(diff: dict[str, dict[str, list[str]]]) -> str:
    lines = [
        "# 써브웨이 공식 재료소개 변경 검토",
        "",
        f"원본: {SOURCE_URL}",
        "",
        "이 PR은 **검토용 제안**이며 자동 배포/단종 확정이 아닙니다. 확인한 다음 병합하세요.",
        "공식 페이지에서 일시적으로 보이지 않는 메뉴도 품절·사이트 변경일 수 있습니다.",
        "",
    ]
    labels = {"breads": "빵", "vegetables": "야채", "cheeses": "치즈", "sauces": "소스", "extras": "추가 토핑"}
    for category, changes in diff.items():
        lines += [f"## {labels[category]}", ""]
        for key, label in (("new_on_official_page", "신규 확인 (추가 제안)"),
                           ("absent_from_official_page", "미노출 (삭제 여부 검토)")):
            if changes[key]:
                lines.append(f"- {label}: {', '.join(changes[key])}")
        lines.append("")
    lines += ["샌드위치·사이드·음료는 **이 스캐너 범위 밖**입니다. 별도 공식 출처 확인 후 확장합니다.", ""]
    return "\n".join(lines)

def fetch_page() -> str:
    req = Request(SOURCE_URL, headers={
        "User-Agent": "SubwayRandomBotMenuMonitor/1.0 (+https://github.com/thanksstevenkim/subway-random-bot)",
        "Accept": "text/html",
    })
    with urlopen(req, timeout=20) as response:
        if response.status != 200 or urlsplit(response.url).hostname != "devm.subway.co.kr":
            raise ValueError("Unexpected official source response/redirect")
        if "html" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("Official source returned non-HTML")
        data = response.read(1_500_001)
        if len(data) > 1_500_000:
            raise ValueError("Unexpectedly large source response")
        return data.decode("utf-8")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--menu", default="data/menu.json")
    parser.add_argument("--report", default="reports/menu-ingredient-review.md")
    parser.add_argument("--fixture", help="Local HTML fixture instead of network")
    args = parser.parse_args()
    try:
        menu_path, report_path = Path(args.menu), Path(args.report)
        menu = json.loads(menu_path.read_text(encoding="utf-8"))
        page = Path(args.fixture).read_text(encoding="utf-8") if args.fixture else fetch_page()
        seen = extract_items(page)
        proposed, diff = proposal(menu, seen)
        if not diff:
            print(f"Matched {len(seen)} official ingredient names; no PR necessary")
            return 0
        menu_path.write_text(json.dumps(proposed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(render_review(diff), encoding="utf-8")
        print(f"Created a review-only proposal for {len(diff)} categories")
        return 0
    except (HTTPError, URLError, ValueError, OSError, KeyError, UnicodeError) as exc:
        print(f"SAFE STOP: official data unavailable or invalid; no deletion inferred: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
