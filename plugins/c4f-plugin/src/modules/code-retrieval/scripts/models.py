from dataclasses import dataclass


@dataclass(frozen=True)
class CodeChunk:
    symbol_name: str
    node_type: str
    start_line: int
    end_line: int
    content: str
