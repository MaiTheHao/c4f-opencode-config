import json

from .common import CodeChunk, line_starts, make_chunk


def chunk(text: str) -> list[CodeChunk]:
    starts = line_starts(text)
    members, root_end = members_of(text)
    chunks: list[CodeChunk] = []

    for position, (offset, key) in enumerate(members):
        end = members[position + 1][0] if position + 1 < len(members) else root_end
        while end > offset and text[end - 1] in " \t\r\n,":
            end -= 1
        result = make_chunk(text, starts, key, "json_member", offset, end)
        if result:
            chunks.append(result)
    return chunks


def members_of(text: str) -> tuple[list[tuple[int, str]], int]:
    """Trả về (member cấp cao nhất, offset kết thúc của root) trong JSON."""
    root_index = -1
    for index, char in enumerate(text):
        if char in "{[":
            root_index = index
            break
    if root_index == -1:
        return [], len(text)

    if text[root_index] == "{":
        return object_members(text, root_index)
    return array_members(text, root_index)


def object_members(text: str, root_index: int) -> tuple[list[tuple[int, str]], int]:
    members: list[tuple[int, str]] = []
    length = len(text)
    depth = 1
    index = root_index + 1
    in_string = False
    escape = False

    while index < length:
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            # Đọc trọn chuỗi rồi kiểm tra xem nó có phải key cấp 1 không.
            key_start = index
            cursor = index + 1
            raw_key: list[str] = []
            while cursor < length:
                current = text[cursor]
                if current == "\\":
                    raw_key.append(text[cursor:cursor + 2])
                    cursor += 2
                    continue
                if current == '"':
                    break
                raw_key.append(current)
                cursor += 1
            after = cursor + 1
            while after < length and text[after] in " \t\r\n":
                after += 1
            if depth == 1 and after < length and text[after] == ":":
                members.append((key_start, unescape("".join(raw_key))))
                index = after + 1
                continue
            index = cursor + 1
            continue
        if char in "{[":
            depth += 1
        elif char in "}]":
            depth -= 1
            if depth == 0:
                return members, index
        index += 1
    return members, length


def array_members(text: str, root_index: int) -> tuple[list[tuple[int, str]], int]:
    members: list[tuple[int, str]] = []
    length = len(text)
    depth = 1
    index = root_index + 1
    item_start = -1
    in_string = False
    escape = False

    while index < length:
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            if depth == 1 and item_start == -1:
                item_start = index
            in_string = True
            index += 1
            continue
        if char in "{[":
            if depth == 1 and item_start == -1:
                item_start = index
            depth += 1
            index += 1
            continue
        if char in "}]":
            depth -= 1
            if depth == 0:
                if item_start != -1:
                    members.append((item_start, f"item_{len(members) + 1}"))
                return members, index
            index += 1
            continue
        if depth == 1:
            if char == ",":
                if item_start != -1:
                    members.append((item_start, f"item_{len(members) + 1}"))
                    item_start = -1
            elif not char.isspace() and item_start == -1:
                item_start = index
        index += 1
    return members, length


def unescape(raw: str) -> str:
    try:
        return str(json.loads(f'"{raw}"'))
    except (ValueError, json.JSONDecodeError):
        return raw
