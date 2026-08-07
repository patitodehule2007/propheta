#!/usr/bin/env python3
"""Lines-of-code counter: per-language file/blank/comment/code stats,
distribution bar chart, complexity estimate, and bug estimate."""

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from collections import defaultdict
from pathlib import Path

VERSION = "3.0.0"

# ─── Terminal colors ───
RED = "\033[38;2;255;50;50m"
ORANGE = "\033[38;2;255;165;0m"
YELLOW = "\033[38;2;255;220;50m"
GREEN = "\033[38;2;50;205;50m"
CYAN = "\033[38;2;0;200;255m"
BLUE = "\033[38;2;50;100;255m"
VIOLET = "\033[38;2;180;50;255m"
WHITE = "\033[1;37m"
GRAY = "\033[38;2;140;140;140m"
DIM = "\033[2m"
NC = "\033[0m"
BOLD = "\033[1m"
CHECK = f"{GREEN}✔{NC}"
CROSS = f"{RED}✘{NC}"

# ─── Language palette for bar charts ───
LANG_COLOR = {
    "TypeScript": "\033[38;2;49;120;198m",
    "JavaScript": "\033[38;2;240;219;79m",
    "Python": "\033[38;2;53;114;165m",
    "Rust": "\033[38;2;222;165;132m",
    "Go": "\033[38;2;0;173;216m",
    "SQL": "\033[38;2;226;93;55m",
    "HTML": "\033[38;2;228;77;38m",
    "CSS": "\033[38;2;38;77;228m",
    "SCSS": "\033[38;2;206;100;155m",
    "PHP": "\033[38;2;79;93;149m",
    "Java": "\033[38;2;237;140;46m",
    "C": "\033[38;2;85;85;170m",
    "C++": "\033[38;2;246;142;164m",
    "C/C++ Header": "\033[38;2;120;120;200m",
    "Ruby": "\033[38;2;204;52;45m",
    "Vue": "\033[38;2;65;184;131m",
    "Svelte": "\033[38;2;255;62;0m",
    "Shell": "\033[38;2;78;170;65m",
    "Dockerfile": "\033[38;2;56;139;253m",
    "YAML": "\033[38;2;203;23;30m",
    "XML": "\033[38;2;220;130;30m",
    "JSON": "\033[38;2;160;160;160m",
    "Markdown": "\033[38;2;120;130;200m",
    "CMake": "\033[38;2;100;180;100m",
    "Makefile": "\033[38;2;100;180;100m",
    "INI": "\033[38;2;150;150;150m",
    "Text": "\033[38;2;150;180;150m",
    "CSV": "\033[38;2;100;160;100m",
    "SVG": "\033[38;2;200;150;50m",
    "Protocol Buffers": "\033[38;2;50;120;200m",
    "CoffeeScript": "\033[38;2;100;80;60m",
    "C#": "\033[38;2;100;180;220m",
    "Kotlin": "\033[38;2;170;130;255m",
    "Swift": "\033[38;2;240;110;80m",
    "Scala": "\033[38;2;200;50;50m",
    "Dart": "\033[38;2;0;180;220m",
    "Lua": "\033[38;2;50;70;150m",
    "Perl": "\033[38;2;60;90;160m",
    "PowerShell": "\033[38;2;0;110;190m",
}

# ─── Per-language comment syntax (used for blank/comment/code classification) ───
# "line": prefixes that start a line comment.
# "block": (start, end) marker pairs for block comments (checked at line start).
LANGUAGE_DEFS = {
    "TypeScript": {"line": ["//"], "block": [("/*", "*/")]},
    "JavaScript": {"line": ["//"], "block": [("/*", "*/")]},
    "Python": {"line": ["#"], "block": [('"""', '"""'), ("'''", "'''")]},
    "Rust": {"line": ["//"], "block": [("/*", "*/")]},
    "Go": {"line": ["//"], "block": [("/*", "*/")]},
    "SQL": {"line": ["--"], "block": [("/*", "*/")]},
    "HTML": {"line": [], "block": [("<!--", "-->")]},
    "CSS": {"line": [], "block": [("/*", "*/")]},
    "SCSS": {"line": ["//"], "block": [("/*", "*/")]},
    "PHP": {"line": ["//", "#"], "block": [("/*", "*/")]},
    "Java": {"line": ["//"], "block": [("/*", "*/")]},
    "C": {"line": ["//"], "block": [("/*", "*/")]},
    "C++": {"line": ["//"], "block": [("/*", "*/")]},
    "C/C++ Header": {"line": ["//"], "block": [("/*", "*/")]},
    "Ruby": {"line": ["#"], "block": [("=begin", "=end")]},
    "Vue": {"line": ["//"], "block": [("<!--", "-->"), ("/*", "*/")]},
    "Svelte": {"line": ["//"], "block": [("<!--", "-->"), ("/*", "*/")]},
    "Shell": {"line": ["#"], "block": []},
    "Dockerfile": {"line": ["#"], "block": []},
    "YAML": {"line": ["#"], "block": []},
    "XML": {"line": [], "block": [("<!--", "-->")]},
    "JSON": {"line": [], "block": []},
    "Markdown": {"line": [], "block": [("<!--", "-->")]},
    "CMake": {"line": ["#"], "block": []},
    "Makefile": {"line": ["#"], "block": []},
    "INI": {"line": ["#", ";"], "block": []},
    "Text": {"line": [], "block": []},
    "CSV": {"line": [], "block": []},
    "SVG": {"line": [], "block": [("<!--", "-->")]},
    "Protocol Buffers": {"line": ["//"], "block": [("/*", "*/")]},
    "CoffeeScript": {"line": ["#"], "block": [("###", "###")]},
    "C#": {"line": ["//"], "block": [("/*", "*/")]},
    "Kotlin": {"line": ["//"], "block": [("/*", "*/")]},
    "Swift": {"line": ["//"], "block": [("/*", "*/")]},
    "Scala": {"line": ["//"], "block": [("/*", "*/")]},
    "Dart": {"line": ["//"], "block": [("/*", "*/")]},
    "Lua": {"line": ["--"], "block": [("--[[", "]]")]},
    "Perl": {"line": ["#"], "block": [("=pod", "=cut")]},
    "PowerShell": {"line": ["#"], "block": [("<#", "#>")]},
}

# ─── Extension → language ───
EXT_MAP = {
    "py": "Python",
    "js": "JavaScript", "mjs": "JavaScript", "cjs": "JavaScript", "jsx": "JavaScript",
    "ts": "TypeScript", "tsx": "TypeScript",
    "rs": "Rust",
    "go": "Go",
    "sql": "SQL",
    "html": "HTML", "htm": "HTML",
    "css": "CSS",
    "scss": "SCSS",
    "php": "PHP",
    "java": "Java",
    "c": "C",
    "h": "C/C++ Header", "hpp": "C/C++ Header", "hh": "C/C++ Header", "hxx": "C/C++ Header",
    "cpp": "C++", "cc": "C++", "cxx": "C++",
    "rb": "Ruby",
    "vue": "Vue",
    "svelte": "Svelte",
    "sh": "Shell", "bash": "Shell", "zsh": "Shell",
    "yaml": "YAML", "yml": "YAML",
    "xml": "XML",
    "json": "JSON",
    "md": "Markdown", "markdown": "Markdown",
    "cmake": "CMake",
    "ini": "INI", "cfg": "INI", "conf": "INI",
    "txt": "Text",
    "csv": "CSV",
    "svg": "SVG",
    "proto": "Protocol Buffers",
    "coffee": "CoffeeScript",
    "cs": "C#",
    "kt": "Kotlin", "kts": "Kotlin",
    "swift": "Swift",
    "scala": "Scala",
    "dart": "Dart",
    "lua": "Lua",
    "pl": "Perl", "pm": "Perl",
    "ps1": "PowerShell",
}

# ─── Exact-filename → language (extension-less files) ───
FILENAME_MAP = {
    "Makefile": "Makefile", "makefile": "Makefile", "GNUmakefile": "Makefile",
    "Dockerfile": "Dockerfile",
    "CMakeLists.txt": "CMake",
}

EXCLUDE_DIRS = {
    "node_modules", ".git", "venv", "dist", "build", "__pycache__", ".next",
    "target", "coverage", ".svn", ".hg", "vendor", "bower_components", ".cache",
    ".idea", ".vscode", ".turbo", ".nuxt", ".output", ".svelte-kit",
}

MAX_FILE_SIZE = 5 * 1024 * 1024  # skip generated/minified files over 5MB

BUG_RATE = 15  # bugs per 1000 lines of code (industry rule of thumb)
COMPLEXITY_RE = re.compile(r"\b(if|for|while|do|switch|case|catch)\b|&&|\|\||\?\s*$")

HISTORY_FILE = os.path.join(os.path.expanduser("~"), ".code-stats-history.jsonl")


# ─── Utilities ───

def compact_number(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    return f"{n:,}"


def render_bar(value: float, max_value: float, width: int = 50, fill: str = "█") -> str:
    if max_value <= 0:
        return ""
    ratio = value / max_value * width
    full = int(ratio)
    if full >= width:
        return fill * width
    frac_chars = " ▏▎▍▌▋▊▉"
    frac_index = int((ratio - full) * 8)
    bar = fill * full
    if 0 < frac_index <= 7:
        bar += frac_chars[frac_index]
    return bar


def section_header(title: str) -> None:
    print()
    print(f"  {BOLD}{WHITE}{title}{NC}")
    print(f"  {DIM}{'-' * 60}{NC}")


def print_banner() -> None:
    banner = [
        f"  {RED} ██████╗ {ORANGE} ██████╗ {YELLOW}██████╗ {GREEN}███████╗{NC}",
        f"  {RED}██╔════╝ {ORANGE}██╔═══██╗{YELLOW}██╔══██╗{GREEN}██╔════╝{NC}",
        f"  {RED}██║     {ORANGE} ██║   ██║{YELLOW}██║  ██║{GREEN}█████╗  {NC}",
        f"  {RED}██║     {ORANGE} ██║   ██║{YELLOW}██║  ██║{GREEN}██╔══╝  {NC}",
        f"  {RED}╚██████╗{ORANGE} ╚██████╔╝{YELLOW}██████╔╝{GREEN}███████╗{NC}",
        f"  {RED} ╚═════╝{ORANGE}  ╚═════╝ {YELLOW}╚═════╝ {GREEN}╚══════╝{NC}",
        "",
        f"  {CYAN}███████╗{BLUE}████████╗{VIOLET} █████╗ {WHITE}████████╗{CYAN}███████╗{NC}",
        f"  {CYAN}██╔════╝{BLUE}╚══██╔══╝{VIOLET}██╔══██╗{WHITE}╚══██╔══╝{CYAN}██╔════╝{NC}",
        f"  {CYAN}███████╗{BLUE}   ██║   {VIOLET}███████║{WHITE}   ██║   {CYAN}███████╗{NC}",
        f"  {CYAN}╚════██║{BLUE}   ██║   {VIOLET}██╔══██║{WHITE}   ██║   {CYAN}╚════██║{NC}",
        f"  {CYAN}███████║{BLUE}   ██║   {VIOLET}██║  ██║{WHITE}   ██║   {CYAN}███████║{NC}",
        f"  {CYAN}╚══════╝{BLUE}   ╚═╝   {VIOLET}╚═╝  ╚═╝{WHITE}   ╚═╝   {CYAN}╚══════╝{NC}",
    ]
    print()
    for line in banner:
        print(line)
    print(f"  {DIM}Lines of Code Counter v{VERSION} — Scan, analyze, estimate{NC}")
    print()


def run_with_spinner(message: str, func, *args, **kwargs):
    result = {}

    def target():
        result["value"] = func(*args, **kwargs)

    thread = threading.Thread(target=target)
    thread.start()

    if sys.stdout.isatty():
        chars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
        i = 0
        while thread.is_alive():
            sys.stdout.write(f"\r  {CYAN}{chars[i % len(chars)]}{NC} {message}...")
            sys.stdout.flush()
            time.sleep(0.08)
            i += 1
        thread.join()
        sys.stdout.write(f"\r  {CHECK} {message} complete       \n")
    else:
        print(f"  {message}...")
        thread.join()

    return result.get("value")


# ─── Language detection ───

def detect_language(filename: str):
    if filename in FILENAME_MAP:
        return FILENAME_MAP[filename]
    if filename.startswith("Dockerfile."):
        return "Dockerfile"
    ext = Path(filename).suffix.lower().lstrip(".")
    return EXT_MAP.get(ext)


# ─── File classification: blank / comment / code / branching points ───

def classify_file(path: Path, lang: str):
    cfg = LANGUAGE_DEFS[lang]
    blank = comment = code = branch = 0
    in_block_end = None
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for raw in f:
                line = raw.strip()
                if not line:
                    blank += 1
                    continue
                if in_block_end is not None:
                    comment += 1
                    if in_block_end in line:
                        in_block_end = None
                    continue
                if any(line.startswith(prefix) for prefix in cfg["line"]):
                    comment += 1
                    continue
                matched = False
                for start, end in cfg["block"]:
                    if line.startswith(start):
                        comment += 1
                        rest = line[len(start):]
                        in_block_end = None if end in rest else end
                        matched = True
                        break
                if matched:
                    continue
                code += 1
                if COMPLEXITY_RE.search(line):
                    branch += 1
    except OSError:
        return None
    return blank, comment, code, branch


def scan_directory(root: str, exclude_langs: set):
    stats = defaultdict(lambda: {"files": 0, "blank": 0, "comment": 0, "code": 0})
    top_files = []
    branching_points = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            lang = detect_language(filename)
            if lang is None or lang.lower() in exclude_langs:
                continue
            path = Path(dirpath) / filename
            try:
                if path.stat().st_size > MAX_FILE_SIZE:
                    continue
            except OSError:
                continue
            result = classify_file(path, lang)
            if result is None:
                continue
            blank, comment, code, branch = result
            s = stats[lang]
            s["files"] += 1
            s["blank"] += blank
            s["comment"] += comment
            s["code"] += code
            branching_points += branch
            if code > 0:
                top_files.append((code, str(path), lang))

    top_files.sort(key=lambda t: t[0], reverse=True)
    return dict(stats), top_files[:10], branching_points


# ─── Display ───

def display_table(stats: dict, languages: list, totals: dict) -> None:
    sep = f"  {DIM}{'-' * 81}{NC}"
    print(sep)
    print(f"  {BOLD}{WHITE}{'Language':<28} {'files':>6} {'blank':>7} {'comment':>8} {'code':>8}{NC}")
    print(sep)
    for lang in languages:
        s = stats[lang]
        print(f"  {CYAN}{lang:<28}{NC}{WHITE} {s['files']:>6} {s['blank']:>7} {s['comment']:>8} {s['code']:>8}{NC}")
    print(sep)
    print(
        f"  {BOLD}{YELLOW}SUM: {'':<23} {totals['files']:>6} {totals['blank']:>7} "
        f"{totals['comment']:>8} {totals['code']:>8}{NC}"
    )
    print(sep)


def display_bars(stats: dict, languages: list, total_code: int) -> None:
    section_header("\U0001F4CA Language Distribution (by lines of code)")
    max_code = max((stats[lang]["code"] for lang in languages), default=0) or 1
    for lang in languages:
        code = stats[lang]["code"]
        pct = (code / total_code * 100) if total_code else 0.0
        bar = render_bar(code, max_code)
        color = LANG_COLOR.get(lang, WHITE)
        print(f"  {color}{lang:<16}{NC} {WHITE}{pct:5.1f}%{NC} {color}{bar}{NC} {DIM}{compact_number(code)}{NC}")
    print(f"  {DIM}{'-' * 60}{NC}")
    print(f"   {len(languages)} languages  |  {compact_number(total_code)} total loc")


def display_top_files(top_files: list, target_dir: str) -> None:
    if not top_files:
        return
    section_header("Top 10 Largest Files")
    print(f"  {DIM}{'#':<4} {'File':<44} {'Language':<14} {'Lines'}{NC}")
    print(f"  {DIM}{'-' * 81}{NC}")
    for rank, (code, path, lang) in enumerate(top_files, start=1):
        display_path = path
        if display_path.startswith(target_dir + os.sep):
            display_path = display_path[len(target_dir) + 1:]
        if len(display_path) > 42:
            display_path = "..." + display_path[-39:]
        color = LANG_COLOR.get(lang, WHITE)
        print(f"  {DIM}{rank:>2}{NC}  {color}{display_path:<42}{NC} {lang:<14} {WHITE}{code}{NC}")


def display_complexity(branching_points: int, total_code: int) -> None:
    section_header("Complexity Estimation")
    per_100 = (branching_points / total_code * 100) if total_code else 0.0

    if per_100 > 25:
        rating, color = "Very High", RED
    elif per_100 > 18:
        rating, color = "High", ORANGE
    elif per_100 > 12:
        rating, color = "Medium", YELLOW
    else:
        rating, color = "Low", GREEN

    print(f"  {WHITE}{'Total branching points:':<26}{NC} {compact_number(branching_points)}")
    print(f"  {WHITE}{'Branching density:':<26}{NC} {CYAN}{per_100:.1f}{NC} per 100 LOC")
    print(f"  {WHITE}{'Complexity rating:':<26}{NC} {color}{rating}{NC}")


def display_bugs(total_code: int) -> None:
    section_header("Bug Estimation")
    bugs = round(total_code / 1000 * BUG_RATE)
    lo = round(total_code / 1000 * 10)
    hi = round(total_code / 1000 * 25)
    print(f"  {WHITE}{'Estimated bugs:':<26}{NC} {YELLOW}~{bugs}{NC} (at {BUG_RATE} bugs/KLOC)")
    print(f"  {WHITE}{'Likely range:':<26}{NC} {DIM}{lo} — {hi}{NC} (industry range 10-25/KLOC)")


# ─── History ───

def load_history() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    entries = []
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def save_history(target_dir: str, stats: dict, languages: list, totals: dict) -> None:
    entries = load_history()
    entry = {
        "ts": int(time.time()),
        "dir": target_dir,
        "totalFiles": totals["files"],
        "totalBlank": totals["blank"],
        "totalComment": totals["comment"],
        "totalCode": totals["code"],
        "languages": [
            {"lang": lang, "files": stats[lang]["files"], "blank": stats[lang]["blank"],
             "comment": stats[lang]["comment"], "code": stats[lang]["code"]}
            for lang in languages
        ],
    }
    entries.append(entry)
    entries = entries[-50:]
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def display_diff(totals: dict) -> None:
    entries = load_history()
    if not entries:
        print()
        print(f"  {DIM}No previous run to compare — first scan.{NC}")
        return

    prev = entries[-1]
    section_header("\U0001F501 Delta vs Previous Run")

    for label, key, total_key in (("Code lines:", "totalCode", "code"), ("Files:", "totalFiles", "files")):
        prev_value = prev.get(key, 0)
        current_value = totals[total_key]
        delta = current_value - prev_value
        sign = "+" if delta >= 0 else "-"
        color = GREEN if delta >= 0 else RED
        print(
            f"  {WHITE}{label:<20}{NC} {color}{sign}{abs(delta):,}{NC}  "
            f"{DIM}({prev_value:,} → {current_value:,}){NC}"
        )


# ─── Main ───

def resolve_target_dir(cli_arg: str | None) -> str:
    if cli_arg:
        return cli_arg
    if not sys.stdin.isatty():
        line = sys.stdin.readline().strip()
        if not line:
            print(f"  {YELLOW}No path provided via stdin.{NC}")
            sys.exit(1)
        return line
    try:
        toplevel = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return toplevel or os.getcwd()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return os.getcwd()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="code-stats",
        description="Count lines of code per language: file/blank/comment/code, "
                     "distribution bar chart, complexity and bug estimates.",
    )
    parser.add_argument("directory", nargs="?", help="Directory to scan (default: git root or cwd)")
    parser.add_argument("-b", "--brief", action="store_true", help="Table only (skip analysis sections)")
    parser.add_argument("-d", "--diff", action="store_true", help="Compare with previous run")
    parser.add_argument("--no-bars", action="store_true", help="Skip language distribution bars")
    parser.add_argument("--no-top", action="store_true", help="Skip top files list")
    parser.add_argument("--no-complexity", action="store_true", help="Skip complexity estimation")
    parser.add_argument("--no-bugs", action="store_true", help="Skip bug estimation")
    parser.add_argument("--no-history", action="store_true", help="Don't save to history")
    parser.add_argument(
        "--exclude-lang", action="append", default=[], metavar="LANG",
        help="Disable line counting for a language (repeatable, or comma-separated), "
             "e.g. --exclude-lang JSON,Markdown",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()

    exclude_langs = {
        name.strip().lower()
        for item in args.exclude_lang
        for name in item.split(",")
        if name.strip()
    }

    no_bars = args.no_bars or args.brief
    no_top = args.no_top or args.brief
    no_complexity = args.no_complexity or args.brief
    no_bugs = args.no_bugs or args.brief

    if not args.brief:
        print_banner()
    else:
        print()

    target_dir = resolve_target_dir(args.directory)
    if not os.path.isdir(target_dir):
        print(f"  {CROSS} Invalid directory: {DIM}{target_dir}{NC}")
        sys.exit(1)
    target_dir = os.path.abspath(target_dir)

    stats, top_files, branching_points = run_with_spinner(
        "Scanning", scan_directory, target_dir, exclude_langs
    ) # type: ignore

    if not stats:
        print(f"  {YELLOW}No recognized source files found.{NC}")
        sys.exit(0)

    languages = sorted(stats.keys(), key=lambda lang: stats[lang]["code"], reverse=True)
    totals = {
        "files": sum(s["files"] for s in stats.values()),
        "blank": sum(s["blank"] for s in stats.values()),
        "comment": sum(s["comment"] for s in stats.values()),
        "code": sum(s["code"] for s in stats.values()),
    }

    display_table(stats, languages, totals)
    if not no_bars:
        display_bars(stats, languages, totals["code"])
    if not no_top:
        display_top_files(top_files, target_dir)
    if not no_complexity:
        display_complexity(branching_points, totals["code"])
    if not no_bugs:
        display_bugs(totals["code"])
    if args.diff:
        display_diff(totals)

    if not args.no_history:
        save_history(target_dir, stats, languages, totals)
        print(f"  {DIM}History saved to{NC} {GRAY}{HISTORY_FILE}{NC}")

    print()


if __name__ == "__main__":
    main()
