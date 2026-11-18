#!/usr/bin/env python3
"""Read-only, best-effort availability check for official Subway Korea menu catalogs.

This does not update data/menu.json, infer discontinued items, or create PRs.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SOURCES = (
    ("sandwiches", "https://www.subway.co.kr/menuList/sandwich"),
    ("sides_drinks", "https://www.subway.co.kr/menuList/sidedrink"),
)
MAX_READ_BYTES = 1_000_000


class MenuHeadings(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.headings: list[str] = []
        self._active: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if re.fullmatch(r"h[1-6]", tag):
            self._active = []

    def handle_data(self, data: str) -> None:
        if self._active is not None:
            self._active.append(data)

    def handle_endtag(self, tag: str) -> None:
        if re.fullmatch(r"h[1-6]", tag) and self._active is not None:
            name = " ".join(" ".join(self._active).split())
            if name:
                self.headings.append(name)
            self._active = None


def probe(category: str, url: str) -> None:
    req = Request(
        url,
        headers={
            "User-Agent": "SubwayRandomBotMenuMonitor/1.0 (+https://github.com/thanksstevenkim/subway-random-bot)",
            "Accept": "text/html",
        },
    )
    try:
        with urlopen(req, timeout=15) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            data = response.read(MAX_READ_BYTES + 1)
            if (
                status != 200
                or not response.url.startswith("https://www.subway.co.kr/")
                or "text/html" not in content_type.lower()
                or len(data) > MAX_READ_BYTES
            ):
                print(f"{category}: UNUSABLE (unexpected HTTP response/content type/size)")
                return
            page = data.decode("utf-8")
            headings = MenuHeadings()
            headings.feed(page)
            print(
                f"{category}: ACCESSIBLE HTTP 200 HTML; "
                f"{len(headings.headings)} headings extracted; "
                "catalog completeness NOT verified"
            )
    except HTTPError as error:
        print(f"{category}: UNAVAILABLE HTTP {error.code} (not evidence of discontinuation)")
    except (URLError, TimeoutError, UnicodeError, ValueError, OSError) as error:
        print(f"{category}: UNAVAILABLE {type(error).__name__} (not evidence of discontinuation)")


if __name__ == "__main__":
    for category, url in SOURCES:
        probe(category, url)
