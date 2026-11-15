import re
from collections.abc import Iterator

TAG_RE = re.compile(
    r"<!--.*?-->"
    r"|<!\[CDATA\[.*?\]\]>"
    r"|<![^>]*>"
    r"|<\?.*?\?>"
    r"|<\s*(?P<close>/?)\s*(?P<name>[A-Za-z][\w:.-]*)"
    r"(?P<attrs>(?:[^>\"']|\"[^\"]*\"|'[^']*')*)>",
    re.DOTALL,
)

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

RAW_TEXT_TAGS = {"script", "style"}

Tag = tuple[bool, str, str, bool, int, int]


def iter_tags(text: str) -> Iterator[Tag]:
    """
    Lặp qua tag HTML/XML: (closing, tag, attrs, self_closing, start, end).

    Comment, khai báo DOCTYPE/PI bị bỏ qua; nội dung script/style không bị
    hiểu nhầm thành thẻ con.
    """
    position = 0
    length = len(text)
    close_patterns: dict[str, re.Pattern[str]] = {}

    while position < length:
        match = TAG_RE.search(text, position)
        if not match:
            return

        name = match.group("name")
        if not name:
            position = match.end()
            continue

        tag = name.lower()
        attrs = match.group("attrs") or ""
        self_closing = attrs.rstrip().endswith("/")
        if self_closing:
            attrs = attrs.rstrip()[:-1]

        yield match.group("close") == "/", tag, attrs, self_closing, match.start(), match.end()
        position = match.end()

        if not self_closing and tag in RAW_TEXT_TAGS:
            pattern = close_patterns.get(tag)
            if pattern is None:
                pattern = re.compile(r"</\s*" + re.escape(tag) + r"\s*>", re.IGNORECASE)
                close_patterns[tag] = pattern
            close_match = pattern.search(text, position)
            if not close_match:
                return
            yield True, tag, "", False, close_match.start(), close_match.end()
            position = close_match.end()


def attr_value(pattern: re.Pattern[str], attrs: str) -> str:
    match = pattern.search(attrs)
    if not match:
        return ""
    return next((group for group in match.groups() if group is not None), "").strip()
