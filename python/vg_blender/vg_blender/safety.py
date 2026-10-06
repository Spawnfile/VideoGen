"""Static checks for agent-written product.py (spec §6.6, plan D10).

The builder agent writes scene/product.py; the worker executes it inside Blender. This allow-list is the first line of
defence (bubblewrap is the hard boundary): product.py may only import `math`, must define `build(vg)` and must not reach
interpreter internals.
"""
import ast

MAX_BYTES = 200_000
ALLOWED_IMPORTS = {"math"}
FORBIDDEN_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "globals", "locals", "vars", "getattr", "setattr", "delattr",
    "input", "breakpoint", "help", "memoryview", "type", "object", "super", "classmethod", "staticmethod", "property",
    "dir", "id", "hasattr", "exit", "quit",
}
FORBIDDEN_ATTRS = {"format", "format_map", "mro"}


def check_product_source(src: str) -> list:
    """Problems as Turkish one-liners with line numbers; [] when the source may run."""
    if len(src.encode("utf-8")) > MAX_BYTES:
        return [f"product.py en çok {MAX_BYTES // 1000} KB olabilir"]
    try:
        tree = ast.parse(src, filename="product.py")
    except SyntaxError as e:
        return [f"satır {e.lineno}: sözdizimi hatası: {e.msg}"]
    out = []

    def bad(node, msg):
        out.append(f"satır {getattr(node, 'lineno', '?')}: {msg}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name not in ALLOWED_IMPORTS:
                    bad(node, f"yalnızca 'math' içe aktarılabilir ({a.name} değil); geometri için vg API'sini kullan")
        elif isinstance(node, ast.ImportFrom):
            if node.module not in ALLOWED_IMPORTS or node.level:
                bad(node, f"yalnızca 'math' içe aktarılabilir ({node.module} değil)")
        elif isinstance(node, ast.Name):
            if node.id in FORBIDDEN_NAMES or node.id.startswith("__"):
                bad(node, f"'{node.id}' kullanılamaz")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("_") or node.attr in FORBIDDEN_ATTRS:
                bad(node, f"'.{node.attr}' özniteliği kullanılamaz")
        elif isinstance(node, (ast.ClassDef, ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await, ast.Yield, ast.YieldFrom)):
            bad(node, f"{type(node).__name__} kullanılamaz")
    has_build = any(isinstance(n, ast.FunctionDef) and n.name == "build" and len(n.args.args) == 1 for n in tree.body)
    if not has_build:
        out.append("product.py tek parametreli bir build(vg) fonksiyonu tanımlamalı")
    return out


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level == 0 and name in ALLOWED_IMPORTS:
        return __import__(name, globals, locals, fromlist, level)
    raise ImportError(f"yalnızca 'math' içe aktarılabilir ({name} değil)")


_SAFE = (
    "abs", "all", "any", "bool", "dict", "enumerate", "filter", "float", "int", "len", "list", "map", "max", "min",
    "pow", "range", "reversed", "round", "set", "sorted", "str", "sum", "tuple", "zip", "isinstance", "print",
    "ValueError", "TypeError", "IndexError", "KeyError", "ZeroDivisionError", "Exception", "True", "False", "None",
)


def safe_globals() -> dict:
    import builtins

    b = {k: getattr(builtins, k) for k in _SAFE if hasattr(builtins, k)}
    b["__import__"] = _safe_import
    return {"__builtins__": b, "__name__": "product"}


def run_product(src: str, vg) -> None:
    """Checks, then executes product.py with restricted builtins and calls build(vg)."""
    problems = check_product_source(src)
    if problems:
        raise ProductError(problems)
    g = safe_globals()
    exec(compile(src, "product.py", "exec"), g)  # noqa: S102 — checked source, restricted builtins, sandboxed process
    g["build"](vg)


class ProductError(Exception):
    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = list(problems)
