"""Lightweight web search via DuckDuckGo — no API key required."""

import httpx

_HEADERS = {"User-Agent": "TeamPlatform/1.0"}
_TIMEOUT = 10


async def search(query: str, max_results: int = 5) -> list[dict]:
    """Search DuckDuckGo and return [{title, url, snippet}, ...]."""
    url = "https://html.duckduckgo.com/html/"
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        resp = await client.post(url, data={"q": query})
    if resp.status_code != 200:
        return []
    return _parse_results(resp.text, max_results)


def _parse_results(html: str, max_results: int) -> list[dict]:
    results = []
    pos = 0
    while len(results) < max_results:
        marker = 'class="result__a"'
        idx = html.find(marker, pos)
        if idx == -1:
            break
        href_start = html.rfind('href="', max(0, idx - 200), idx)
        if href_start == -1:
            pos = idx + len(marker)
            continue
        href_start += 6
        href_end = html.find('"', href_start)
        raw_url = html[href_start:href_end]

        tag_end = html.find(">", idx)
        close_tag = html.find("</a>", tag_end)
        title = html[tag_end + 1 : close_tag].strip() if close_tag > tag_end else ""
        title = _strip_tags(title)

        snippet = ""
        snip_marker = 'class="result__snippet"'
        snip_idx = html.find(snip_marker, close_tag if close_tag > 0 else idx)
        if snip_idx != -1 and snip_idx < idx + 2000:
            snip_start = html.find(">", snip_idx) + 1
            snip_end = html.find("</", snip_start)
            snippet = _strip_tags(html[snip_start:snip_end]).strip()

        if title and raw_url:
            clean_url = raw_url
            if "uddg=" in clean_url:
                import urllib.parse

                clean_url = urllib.parse.unquote(clean_url.split("uddg=")[-1].split("&")[0])
            results.append({"title": title, "url": clean_url, "snippet": snippet})
        pos = idx + len(marker)
    return results


def _strip_tags(s: str) -> str:
    import re

    text = re.sub(r"<[^>]+>", "", s)
    for old, new in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')]:
        text = text.replace(old, new)
    return text
