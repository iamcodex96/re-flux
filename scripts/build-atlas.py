#!/usr/bin/env python3
"""Build the Re;Flux "atlas": a search index of Markdown notes for an Obsidian vault.

The repository stays the source of truth. The atlas holds only .md files: one note per
module, one summary note per repository document, tag notes, and a small entry index.

Usage:
    python3 scripts/build-atlas.py <output-dir>

The output directory must be new or empty (or hold a previous atlas with the same index
name). Generate into a NEW temporary directory, review it, then copy it to the vault:

    TMP="$(mktemp -d)"
    python3 scripts/build-atlas.py "$TMP"
    rsync -a --delete --include='*/' --include='*.md' --exclude='*' "$TMP/" "$VAULT/Projects/Re-Flux/"

Only the Python standard library is used (works on Python 3.8+). Files are listed with
`git ls-files`. Dependencies between modules come from static imports in the code.
"""
from __future__ import annotations

import os
import posixpath
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# --------------------------------------------------------------------------------------
# Constants and manual assignments (review these: they are the judgement calls)
# --------------------------------------------------------------------------------------

PROJECT = "reflux"
PROJECT_TITLE = "Re;Flux"
INDEX_NAME = "_reflux-atlas"
MODULES_NAME = "_reflux-modulos"
MAP_NAME = "_reflux-mapa-dependencias"
PHASES_NAME = "_reflux-fases"
MODULE_PREFIX = "flux-"
SUMMARY_CHARS = 650
HUB_SIZE_LIMIT = 6500  # bytes; a tag note above this is split into parts
HUB_DETAIL_LIMIT = 30  # tags with more notes than this list titles only

CODE_EXT = (".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".vue")

LAYERS = [
    ("foundation", "Shared types and small helpers with no engine logic."),
    ("engine", "Headless animation engine: timelines, values, physics, operators."),
    ("adapters", "Optional bridges from the engine to DOM, SVG, Canvas 2D and Three.js."),
    ("simulation", "Autonomous-agent steering and flow fields, separate from the animation engine."),
    ("entry", "The package root that re-exports the public surface."),
    ("tooling", "Docs app, benchmarks and repository check scripts (not published)."),
]

# slug suffix -> definition. `files` decides ownership (see module_of); `topics` are fixed by hand.
MODULES = {
    "types": dict(layer="foundation", status="done", topics=["animation-core", "easing"],
                  desc="Public TypeScript types: animation options and state, easing, frames, physics, streams, values.",
                  entry=["src/types.ts"], subpath=None),
    "utils": dict(layer="foundation", status="done", topics=["easing", "tween-keyframes"],
                  desc="Easing functions, math, vector helpers, staggering, timing and the shared value-template parser.",
                  entry=["src/utils.ts"], subpath="./utils"),
    "core": dict(layer="engine", status="done",
                 topics=["animation-core", "timeline-composition", "frame-scheduling", "reduced-motion"],
                 desc="Animation, Timeline, composition helpers, the shared FrameCoordinator and motion preferences.",
                 entry=["src/core.ts"], subpath="./core"),
    "values": dict(layer="engine", status="done", topics=["tween-keyframes", "easing"],
                   desc="Tween, Keyframes and the interpolation of numbers, strings and colours.",
                   entry=["src/values.ts"], subpath="./values"),
    "physics": dict(layer="engine", status="done", topics=["spring-physics"],
                    desc="Spring motion and retargetable motion.",
                    entry=["src/physics.ts"], subpath="./physics"),
    "operators": dict(layer="engine", status="done",
                      topics=["reactive-operators", "gestures-scroll", "spring-physics"],
                      desc="RxJS operators for smoothing, adaptive tweens, retargeting and gestures.",
                      entry=["src/operators.ts"], subpath="./operators"),
    "dom": dict(layer="adapters", status="done", topics=["dom-adapter", "layout-flip", "gestures-scroll"],
                desc="DOM adapter: animate(), style binding, scope, text, layout/FLIP, scroll, scroll trigger, draggable.",
                entry=["src/adapters/dom.ts"], subpath="./dom"),
    "svg": dict(layer="adapters", status="done", topics=["svg-path-morph"],
                desc="SVG adapter: attribute binding, path following and path morphing.",
                entry=["src/adapters/svg.ts"], subpath="./svg"),
    "canvas": dict(layer="adapters", status="done", topics=["canvas-three"],
                   desc="Canvas 2D adapter (bindCanvas) and the canvas effects (frequency bars).",
                   entry=["src/adapters/canvas.ts", "src/effects/canvas.ts"], subpath="./canvas"),
    "three": dict(layer="adapters", status="done", topics=["canvas-three"],
                  desc="Three.js adapter.",
                  entry=["src/adapters/three.ts"], subpath="./three"),
    "steering": dict(layer="simulation", status="done", topics=["steering-flow-field"],
                     desc="Renderer-independent steering behaviours for autonomous agents.",
                     entry=["src/steering.ts"], subpath="./steering"),
    "flow-field": dict(layer="simulation", status="done", topics=["steering-flow-field"],
                       desc="Flow-field sampling used by steering and simulations.",
                       entry=["src/flowField.ts"], subpath="./flow-field"),
    "root": dict(layer="entry", status="done", topics=["packaging-tooling-deps"],
                 desc="Package root (src/index.ts): re-exports the public surface of the other modules.",
                 entry=["src/index.ts"], subpath="."),
    "docs-app": dict(layer="tooling", status="in-progress", topics=["docs-app-redesign"],
                     desc="The Vue documentation and playground app (apps/docs). The frontend redesign is planned, not started.",
                     entry=[], subpath=None),
    "benchmarks": dict(layer="tooling", status="done", topics=["performance-benchmarks", "testing-coverage"],
                       desc="Node benchmark suites (benchmarks/) and the browser benchmark engine (apps/docs/src/benchmarks).",
                       entry=[], subpath=None),
    "repo-scripts": dict(layer="tooling", status="done", topics=["packaging-tooling-deps", "testing-coverage"],
                         desc="Repository check scripts (scripts/): package, tree-shaking, browser, docs contract and release checks.",
                         entry=[], subpath=None),
}
MODULE_STATUS_ASSUMED = True  # no per-module status data exists in the repository

# Module aliases used to decide which documents name a module (>= 2 mentions, or in the title).
# Case-sensitive when the alias contains an upper-case letter, otherwise case-insensitive.
MODULE_ALIASES = {
    "types": ["src/types"],
    "utils": ["src/utils", "easings.ts", "valueTemplate", "readOnlyBehavior", "Vector2", "stagger("],
    "core": ["src/core", "FrameCoordinator", "PlaybackController", "MotionLifecycleController",
             "MotionPreferences", "Timeline", "@re-code/flux/core"],
    "values": ["src/values", "Tween", "Keyframes", "AnimatedValue", "compiledInterpolators",
               "@re-code/flux/values"],
    "physics": ["src/physics", "RetargetableMotion", "@re-code/flux/physics"],
    "operators": ["src/operators", "smoothStream", "adaptiveTween", "retargetMotion",
                  "@re-code/flux/operators"],
    "dom": ["adapters/dom", "@re-code/flux/dom", "bindStyle", "scrollTrigger", "styleBinding",
            "cssInterpolation", "draggable"],
    "svg": ["adapters/svg", "@re-code/flux/svg", "pathMorph", "bindSvgAttributes", "followSvgPath"],
    "canvas": ["adapters/canvas", "effects/canvas", "@re-code/flux/canvas", "bindCanvas"],
    "three": ["adapters/three", "@re-code/flux/three", "Three.js"],
    "steering": ["src/steering", "@re-code/flux/steering", "steering"],
    "flow-field": ["flowField", "flow-field", "flow field"],
    "root": ["src/index"],
    "docs-app": ["apps/docs", "docs app", "BrowserBenchmarks", "Benchmark Lab"],
    "benchmarks": ["benchmarks/", "bench:", "run-all.bench"],
    "repo-scripts": ["scripts/", "check-tree-shaking", "check-package-"],
}

# Topics for documents: keyword prefixes (case-insensitive). A document gets a topic when it
# names its keywords 5 or more times (or in the title); at most 4 topics per document.
TOPICS = {
    "animation-core": ["PlaybackController", "MotionLifecycle", "motion lifecycle", "playback", "Completion",
                       "settle", "Animation class", "Animation.ts"],
    "timeline-composition": ["timeline", "sequence(", "parallel(", "staggered", "segment", "composition"],
    "frame-scheduling": ["FrameCoordinator", "requestAnimationFrame", "frame loop", "frame coordinator",
                         "scheduler", "tombstone"],
    "tween-keyframes": ["tween", "keyframes", "interpolat", "AnimatedValue", "valueTemplate", "colour parser",
                        "color parser"],
    "easing": ["easing", "cubicBezier", "steps("],
    "spring-physics": ["spring", "RetargetableMotion", "retarget", "physics", "stiffness", "damping"],
    "reactive-operators": ["rxjs", "observable", "operator", "smoothStream", "adaptiveTween", "subscription"],
    "gestures-scroll": ["gesture", "scroll", "draggable", "pointer"],
    "dom-adapter": ["dom adapter", "adapters/dom", "bindStyle", "style binding", "animate()", "getComputedStyle",
                    "css variable", "WAAPI"],
    "layout-flip": ["flip", "layout", "forced layout", "reflow", "recalculation", "getBoundingClientRect"],
    "svg-path-morph": ["svg", "path morph", "pathMorph", "getPointAtLength", "followSvgPath"],
    "canvas-three": ["canvas", "three.js", "bindCanvas", "WebGL", "dirty flag"],
    "steering-flow-field": ["steering", "flow field", "flowField", "flow-field", "boid", "autonomous agent"],
    "reduced-motion": ["reduced motion", "reduced-motion", "prefers-reduced-motion", "MotionPreferences"],
    "performance-benchmarks": ["benchmark", "bench:", "performance", "hot path", "allocation", "percentile",
                               "scavenge"],
    "testing-coverage": ["coverage", "jest", "characterization", "differential", "contract test", "unit test",
                         "ts-jest", "playwright", "regression"],
    "docs-app-redesign": ["docs app", "redesign", "aurora", "frontend", "vue", "vite", "scss", "design system",
                          "DESIGN-"],
    "packaging-tooling-deps": ["package.json", "tree-shak", "biome", "publishing", "trusted publishing",
                               "provenance", "typescript 5", "typescript 7", "semver", "peer dependenc",
                               "toolchain", "dist-tag", "package-lock"],
}
MAX_TOPICS_PER_DOC = 4
TOPIC_MIN_MENTIONS = 5
MODULE_MIN_MENTIONS = 2

# Tests that belong to no single module: no warning for these.
TRANSVERSAL_TEST_PREFIXES = ("tests/helpers/", "tests/browser/", "tests/tree-shaking/")

# Test directory -> module. Files in tests/adapters are assigned by name (see test_owner).
TEST_DIR_OWNER = {
    "core": "core", "values": "values", "physics": "physics", "operators": "operators",
    "steering": "steering", "flowField": "flow-field", "utils": "utils", "types": "types",
    "effects": "canvas", "docs": "benchmarks",
}

# `package.json` "exports" sub-path (without the package name) -> module.
SUBPATH_MODULE = {m["subpath"]: slug for slug, m in MODULES.items() if m["subpath"]}

DOC_KIND_BY_DIR = {
    "": "root", "roadmap": "roadmap", "roadmap/design": "roadmap-design", "roadmap/baseline": "roadmap-baseline",
    "guidelines": "guidelines", "benchmarks": "benchmarks", ".claude/agents": "agent",
}
ID_RE = re.compile(r"\b(?:API|BENCH|CHORE|DOCS|PERF|REFACTOR|UNIT|DESIGN)-\d{3}\b")
TAG_RE = re.compile(r"^[A-Za-z0-9_/-]+$")

SECRET_PATTERNS = [
    ("api key", re.compile(r"api[_-]?key", re.I)),
    ("secret", re.compile(r"secret", re.I)),
    ("token", re.compile(r"token", re.I)),
    ("password", re.compile(r"password", re.I)),
    ("bearer", re.compile(r"bearer", re.I)),
    ("authorization", re.compile(r"authorization", re.I)),
    ("sk-", re.compile(r"sk-[A-Za-z0-9]")),
    ("ghp_", re.compile(r"ghp_")),
    ("AKIA", re.compile(r"AKIA[0-9A-Z]{4,}")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY")),
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
]


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------

def fail(message):
    print("ERROR: " + message, file=sys.stderr)
    sys.exit(1)


def git_files(root):
    out = subprocess.run(["git", "ls-files", "-z"], cwd=str(root), check=True, stdout=subprocess.PIPE).stdout
    return sorted(p for p in out.decode("utf-8").split("\0") if p and (root / p).is_file())


def git_subjects(root):
    out = subprocess.run(["git", "log", "--format=%s"], cwd=str(root), check=True, stdout=subprocess.PIPE).stdout
    return out.decode("utf-8", "replace").splitlines()


def read_text(root, rel):
    return (root / rel).read_text(encoding="utf-8", errors="replace")


def slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return text.strip("-")


def sanitize_text(text):
    """Make text safe for notes: no accidental #tags, no wiki links, no stray pipes in link text."""
    text = text.replace("[[", "[ [").replace("]]", "] ]")
    text = re.sub(r"(^|[\s(\[,;:>])#(?=\w)", r"\1", text)
    return text


def strip_markdown(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("**", "").replace("__", "")
    text = re.sub(r"(?<![\w*])\*(?!\s)([^*\n]+?)\*(?!\w)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def truncate(text, limit):
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.-")
    return cut + "..."


def yaml_str(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def check_tag(tag):
    if not TAG_RE.match(tag) or not re.search(r"[A-Za-z_]", tag):
        fail("invalid tag: %r" % tag)
    return tag


def tag_hub_name(tag):
    return "%s-tag-%s" % (PROJECT, tag.replace("/", "-"))


# --------------------------------------------------------------------------------------
# Module ownership and import resolution
# --------------------------------------------------------------------------------------

def module_of(path):
    """Module that owns a source file, or None (tests, docs, configuration)."""
    if not path.endswith(CODE_EXT):
        return None
    if path.startswith("apps/docs/src/benchmarks/"):
        return "benchmarks"
    if path.startswith("apps/docs/"):
        return "docs-app"
    if path.startswith("benchmarks/"):
        return "benchmarks"
    if path.startswith("scripts/"):
        return "repo-scripts"
    if not path.startswith("src/"):
        return None
    rel = path[len("src/"):]
    if rel == "index.ts":
        return "root"
    if rel in ("core.ts",) or rel.startswith("core/"):
        return "core"
    if rel == "values.ts" or rel.startswith("values/"):
        return "values"
    if rel == "physics.ts" or rel.startswith("physics/"):
        return "physics"
    if rel == "operators.ts" or rel.startswith("operators/"):
        return "operators"
    if rel == "utils.ts" or rel.startswith("utils/"):
        return "utils"
    if rel == "types.ts" or rel.startswith("types/"):
        return "types"
    if rel == "steering.ts":
        return "steering"
    if rel == "flowField.ts":
        return "flow-field"
    if rel == "adapters/dom.ts" or rel.startswith("adapters/dom/"):
        return "dom"
    if rel == "adapters/svg.ts" or rel.startswith("adapters/svg/"):
        return "svg"
    if rel == "adapters/canvas.ts" or rel.startswith("effects/"):
        return "canvas"
    if rel == "adapters/three.ts":
        return "three"
    return None


def test_owner(path):
    """Module that owns a test file by directory or name, or None."""
    parts = path.split("/")
    if len(parts) < 3:
        return None
    directory = parts[1]
    name = parts[-1]
    if directory == "adapters":
        for prefix, mod in (("canvas", "canvas"), ("svg", "svg"), ("three", "three")):
            if name.startswith(prefix):
                return mod
        return "dom"
    return TEST_DIR_OWNER.get(directory)


IMPORT_RE = re.compile(r"""(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"\n]+)['"]""")
EXPORT_FROM_RE = re.compile(r"""export\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]""", re.S)
EXPORT_STAR_RE = re.compile(r"""export\s+\*\s+from\s*['"]([^'"]+)['"]""")
EXPORT_DECL_RE = re.compile(r"^export\s+(?:async\s+)?(function|const|class|interface|type|enum|let)\s+(\w+)", re.M)
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT_RE = re.compile(r"^\s*//.*$", re.M)


def code_without_comments(text):
    return LINE_COMMENT_RE.sub("", BLOCK_COMMENT_RE.sub("", text))


class Resolver:
    def __init__(self, files):
        self.files = set(files)
        self.by_stem = {}
        for f in files:
            if f.endswith(CODE_EXT):
                stem = os.path.splitext(f)[0]
                self.by_stem.setdefault(stem, f)
                if posixpath.basename(f).startswith("index."):
                    self.by_stem.setdefault(posixpath.dirname(f), f)

    def resolve_file(self, from_file, spec):
        """Resolve a relative import to a tracked file path (or None)."""
        if spec.startswith("@/"):
            base = "apps/docs/src/" + spec[2:]
        elif spec.startswith("."):
            base = posixpath.normpath(posixpath.join(posixpath.dirname(from_file), spec))
        else:
            return None
        if base.startswith("dist/"):  # benchmarks and scripts import the built output; same layout as src/
            base = "src/" + base[len("dist/"):]
        if base in self.files:
            return base
        stem = re.sub(r"\.(?:m?js|cjs|tsx?|vue)$", "", base)
        return self.by_stem.get(stem) or self.by_stem.get(base)

    def resolve_module(self, from_file, spec):
        """Module an import points to (None for external packages and non-code files)."""
        if spec == "@re-code/flux":
            return "root"
        if spec.startswith("@re-code/flux/"):
            return SUBPATH_MODULE.get("./" + spec[len("@re-code/flux/"):])
        target = self.resolve_file(from_file, spec)
        return module_of(target) if target else None


def external_package(spec):
    if spec.startswith((".", "@/", "/", "node:")):
        return None
    if spec.startswith("@re-code/flux"):
        return None
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


# --------------------------------------------------------------------------------------
# Data collection
# --------------------------------------------------------------------------------------

def collect_modules(root, files, resolver, warnings):
    """Compute source stats, dependencies, tests and public exports per module."""
    info = {slug: dict(files=[], lines=0, uses=set(), uses_tests=set(), used_by=set(), used_by_tests=set(),
                       external=set(), test_files=[], test_cases=0, test_ids=set(), exports=[], public_files=set())
            for slug in MODULES}
    for f in files:
        mod = module_of(f)
        if not mod:
            continue
        text = read_text(root, f)
        info[mod]["files"].append(f)
        info[mod]["lines"] += text.count("\n") + 1
        for spec in IMPORT_RE.findall(code_without_comments(text)):
            ext = external_package(spec)
            if ext:
                info[mod]["external"].add(ext)
            target = resolver.resolve_module(f, spec)
            if target and target != mod:
                info[mod]["uses"].add(target)

    case_re = re.compile(r"^\s*(?:it|test)(?:\.\w+)*\s*\(", re.M)
    for f in files:
        if not (f.startswith("tests/") and f.endswith(".test.ts")):
            continue
        owner = test_owner(f)
        if not owner:
            if not f.startswith(TRANSVERSAL_TEST_PREFIXES):
                warnings.append("test without owner module: " + f)
            continue
        text = read_text(root, f)
        info[owner]["test_files"].append(f)
        info[owner]["test_cases"] += len(case_re.findall(text))
        info[owner]["test_ids"].update(ID_RE.findall(text))
        for spec in IMPORT_RE.findall(code_without_comments(text)):
            target = resolver.resolve_module(f, spec)
            if target and target != owner:
                info[owner]["uses_tests"].add(target)

    for slug, data in info.items():
        data["uses_tests"] -= data["uses"]
        for dep in data["uses"]:
            info[dep]["used_by"].add(slug)
        for dep in data["uses_tests"]:
            info[dep]["used_by_tests"].add(slug)
    for slug, data in info.items():
        data["used_by_tests"] -= data["used_by"]

    for slug, mod in MODULES.items():
        names = []
        public = set()
        seen = set()

        def visit(entry, names=names, public=public, seen=seen):
            if entry in seen or entry not in resolver.files:
                return
            seen.add(entry)
            code = code_without_comments(read_text(root, entry))
            for is_type, body, spec in EXPORT_FROM_RE.findall(code):
                target = resolver.resolve_file(entry, spec)
                if target:
                    public.add(target)
                for raw in body.split(","):
                    raw = raw.strip()
                    if not raw:
                        continue
                    is_t = bool(is_type) or raw.startswith("type ")
                    raw = re.sub(r"^type\s+", "", raw)
                    name = raw.split(" as ")[-1].strip()
                    names.append((name, is_t))
            for spec in EXPORT_STAR_RE.findall(code):
                target = resolver.resolve_file(entry, spec)
                if target:
                    public.add(target)
                    visit(target)
            for kind, name in EXPORT_DECL_RE.findall(code):
                names.append((name, kind in ("interface", "type")))

        for entry in mod["entry"]:
            visit(entry)
        public -= set(mod["entry"])
        info[slug]["exports"] = names
        info[slug]["public_files"] = public
    return info


def parse_item_phase(text):
    """Phase number from the header table of a roadmap item (column named Phase)."""
    lines = text.splitlines()
    for i, line in enumerate(lines[:20]):
        if line.startswith("|") and re.search(r"\|\s*Phase\s*\|", line + "|") and i + 2 < len(lines):
            headers = [c.strip() for c in line.strip().strip("|").split("|")]
            row = [c.strip() for c in lines[i + 2].strip().strip("|").split("|")]
            if "Phase" in headers and len(row) == len(headers):
                m = re.match(r"\d+", row[headers.index("Phase")])
                if m:
                    return int(m.group(0))
    return None


def section_text(text, heading_re):
    """Text of the first section whose heading matches, up to the next heading of the same or higher level."""
    lines = text.splitlines()
    out = []
    capture = False
    level = 0
    fence = False
    for line in lines:
        if line.startswith("```"):
            fence = not fence
        m = re.match(r"^(#{1,6})\s+(.*)$", line) if not fence else None
        if m:
            if capture and len(m.group(1)) <= level:
                break
            if not capture and re.search(heading_re, m.group(2), re.I):
                capture = True
                level = len(m.group(1))
                continue
        if capture:
            out.append(line)
    return "\n".join(out)


def prose_paragraphs(text):
    """Paragraphs of plain prose (no headings, tables, code, front matter, html comments)."""
    paragraphs = []
    current = []
    fence = False
    for line in text.splitlines():
        if line.startswith("```"):
            fence = not fence
            continue
        if fence:
            continue
        stripped = line.strip()
        skip = (not stripped or stripped.startswith(("#", "|", "<!--", "---", "===", "[!", "<")))
        if skip:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        stripped = re.sub(r"^(?:>\s*|[-*+]\s+(?:\[[ x]\]\s+)?|\d+\.\s+)", "", stripped)
        current.append(stripped)
    if current:
        paragraphs.append(" ".join(current))
    return [strip_markdown(p) for p in paragraphs if strip_markdown(p)]


def strip_front_matter(text):
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[end + 4:].lstrip("\n")
    return text


def make_summary(path, text, is_item):
    body = strip_front_matter(text)
    candidates = []
    if is_item:  # Problem first, then Scope and Evidence, until the summary is long enough
        for heading in (r"^Problem", r"^Scope", r"^Evidence"):
            candidates += prose_paragraphs(section_text(body, heading))
    if not candidates:
        after_title = re.sub(r"\A\s*#\s+.*\n", "", body, count=1)
        candidates = prose_paragraphs(after_title)
    if not candidates:  # tables or lists only: fall back to any text
        candidates = [strip_markdown(re.sub(r"[|#>*`-]+", " ", body))]
    summary = ""
    for p in candidates:
        summary = (summary + " " + p).strip()
        if len(summary) >= SUMMARY_CHARS:
            break
    return sanitize_text(truncate(summary, SUMMARY_CHARS))


def doc_title(path, text):
    body = strip_front_matter(text)
    m = re.search(r"^#\s+(.+)$", body, re.M)
    title = strip_markdown(m.group(1)) if m else posixpath.basename(path)[:-3]
    return sanitize_text(title).replace("`", "")


def h2_headings(text):
    out = []
    fence = False
    for line in strip_front_matter(text).splitlines():
        if line.startswith("```"):
            fence = not fence
        if not fence:
            m = re.match(r"^##\s+(.+?)\s*#*$", line)
            if m:
                out.append(sanitize_text(strip_markdown(m.group(1))).replace("`", ""))
    return out


def count_mentions(text, patterns, case_sensitive_if_upper=True):
    total = 0
    for p in patterns:
        flags = 0 if (case_sensitive_if_upper and any(c.isupper() for c in p)) else re.I
        total += len(re.findall(r"(?<![A-Za-z])" + re.escape(p), text, flags))
    return total


def collect_docs(root, files, commit_subjects):
    docs = []
    md_files = [f for f in files if f.endswith(".md")]
    name_slugs = {}
    for f in md_files:
        text = read_text(root, f)
        directory = posixpath.dirname(f)
        stem = posixpath.basename(f)[:-3]
        is_item = directory == "roadmap" and re.match(r"^[A-Z]+-\d{3}-", stem) is not None
        if is_item:
            slug = slugify(stem)
        else:
            slug = MODULE_PREFIX + slugify(f[:-3].replace("/", "-").lstrip("."))
        if slug in name_slugs:
            fail("slug collision between %s and %s (%s)" % (f, name_slugs[slug], slug))
        name_slugs[slug] = f
        kind = DOC_KIND_BY_DIR.get(directory)
        if kind is None:
            fail("no doc_kind rule for directory %r (%s)" % (directory, f))
        title = doc_title(f, text)
        item_id = re.match(r"^([A-Z]+-\d{3})", stem).group(1) if is_item else None
        docs.append(dict(path=f, slug=slug, text=text, is_item=is_item, item_id=item_id, title=title,
                         kind=kind, directory=directory, lines=text.count("\n") + 1,
                         summary=make_summary(f, text, is_item), h2=h2_headings(text)))

    for d in docs:
        d["status"] = doc_status(d, commit_subjects)
        d["declared"] = declared_status(d) if d["is_item"] else ""
        d["boxes"] = "%d/%d" % (len(re.findall(r"^- \[x\]", d["text"], re.M | re.I)),
                                len(re.findall(r"^- \[[ xX]\]", d["text"], re.M))) if d["is_item"] else ""
        d["phase"] = None
        d["phases"] = []
        if d["is_item"]:
            p = parse_item_phase(d["text"])
            d["phase"] = p
            if p is not None:
                d["phases"] = [p]
        elif d["directory"] == "roadmap/design":
            d["phases"] = [5]
        elif d["path"] == "roadmap.md" or d["directory"].startswith("roadmap"):
            counts = defaultdict(int)
            for n in re.findall(r"\bPhase (\d)\b", d["text"]):
                counts[int(n)] += 1
            d["phases"] = sorted(n for n, c in counts.items() if c >= 3)
        d["topics"] = doc_topics(d)
        d["modules"] = doc_modules(d)
    return docs


def declared_status(d):
    """What the item's own Status section claims (first words), kept apart from the computed status."""
    m = re.search(r"^#{2,3}\s+(?:.*status.*|Outcome.*)$", d["text"], re.M | re.I)
    if not m:
        return ""
    first = re.sub(r"[*_`]", "", d["text"][m.end():m.end() + 400]).strip()[:80].lower()
    if re.match(r"(done|spike done|outcome)", first):
        return "done"
    if first.startswith("status: implemented"):
        return "implemented"
    return ""


def doc_status(d, commit_subjects):
    """Roadmap items: computed from the acceptance checkboxes. Design docs: planned. The rest: reference."""
    if d["is_item"]:
        checked = len(re.findall(r"^- \[x\]", d["text"], re.M | re.I))
        total = checked + len(re.findall(r"^- \[ \]", d["text"], re.M))
        if total and checked == total:
            return "done"
        if checked:
            return "in-progress"
        return "planned"
    if d["kind"] == "roadmap-design":
        return "planned"
    return "reference"


def doc_topics(d):
    title = d["title"].lower()
    scored = []
    for topic, kws in TOPICS.items():
        n = count_mentions(d["text"], kws)
        in_title = any(k.lower() in title for k in kws)
        if n >= TOPIC_MIN_MENTIONS or in_title:
            scored.append((n + (1000 if in_title else 0), topic))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [t for _, t in scored[:MAX_TOPICS_PER_DOC]]


def doc_modules(d):
    out = []
    title = d["title"]
    for slug in MODULES:
        aliases = MODULE_ALIASES.get(slug, [])
        n = count_mentions(d["text"], aliases)
        in_title = count_mentions(title, aliases) > 0
        if n >= MODULE_MIN_MENTIONS or in_title:
            out.append(slug)
    return out


# --------------------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------------------

def mod_slug(slug):
    return MODULE_PREFIX + slug


def node_id(slug):
    return "m_" + slug.replace("-", "_")


def link(slug, alias=None):
    return "[[%s|%s]]" % (slug, alias) if alias else "[[%s]]" % slug


def render_module_diagram(slug, data):
    lines = ["```mermaid", "flowchart LR"]
    names = {slug}
    edges = []
    for dep in sorted(data["uses"]):
        edges.append((slug, dep, False))
        names.add(dep)
    for dep in sorted(data["uses_tests"]):
        edges.append((slug, dep, True))
        names.add(dep)
    for user in sorted(data["used_by"]):
        edges.append((user, slug, False))
        names.add(user)
    for user in sorted(data["used_by_tests"]):
        edges.append((user, slug, True))
        names.add(user)
    for n in sorted(names):
        lines.append('  %s["%s"]' % (node_id(n), n))
    for a, b, dashed in edges:
        lines.append("  %s %s %s" % (node_id(a), "-.->" if dashed else "-->", node_id(b)))
    lines.append("  style %s fill:#fde68a,stroke:#b45309,color:#000" % node_id(slug))
    lines.append("```")
    return "\n".join(lines)


def links_or_none(slugs):
    return " ".join(link(mod_slug(s)) for s in sorted(slugs)) if slugs else "none"


def render_module(slug, mod, data, docs_naming):
    tags = [PROJECT, "module", "layer/" + mod["layer"], "status/" + mod["status"]]
    tags += ["topic/" + t for t in mod["topics"]]
    tags += ["dep/" + d for d in sorted(data["uses"])]
    for t in tags:
        check_tag(t)
    roots = sorted({"/".join(f.split("/")[:2]) if f.startswith(("src/", "apps/")) else f.split("/")[0]
                    for f in data["files"]})
    if slug == "docs-app":
        roots = ["apps/docs"]
    if slug == "canvas":
        roots = ["src/adapters/canvas.ts", "src/effects/"]
    if slug == "benchmarks":
        roots = ["benchmarks/", "apps/docs/src/benchmarks/"]
    fm = ["---", "title: " + yaml_str(slug), "type: module", "project: " + PROJECT,
          "layer: " + mod["layer"], "status: " + mod["status"],
          "source: [%s]" % ", ".join(roots),
          "src_files: %d" % len(data["files"]), "src_lines: %d" % data["lines"],
          "tags: [%s]" % ", ".join(tags),
          "depends_on: [%s]" % ", ".join(sorted(data["uses"])),
          "used_by: [%s]" % ", ".join(sorted(data["used_by"])), "---"]
    body = ["# " + slug, "",
            "**What it is:** " + mod["desc"], "",
            "Layer `%s`, status `%s`. Source: %s. See %s and %s." % (
                mod["layer"], mod["status"], ", ".join("`%s`" % r for r in roots),
                link(MAP_NAME), link(MODULES_NAME)), "",
            "## Dependencies", "",
            "Arrow = \"uses\"; dashed = only in tests. Highlighted = this module.", "",
            render_module_diagram(slug, data), "",
            "- Uses: " + links_or_none(data["uses"]),
            "- Uses (tests only): " + links_or_none(data["uses_tests"]),
            "- Used by: " + links_or_none(data["used_by"]),
            "- Used by (tests only): " + links_or_none(data["used_by_tests"]),
            "- External packages: " + (", ".join("`%s`" % e for e in sorted(data["external"])) or "none"), "",
            "## Public modules", ""]
    if mod["subpath"] is not None:
        body.append("Package entry: `@re-code/flux%s`." % ("" if mod["subpath"] == "." else mod["subpath"][1:]))
    if data["exports"]:
        values = sorted({n for n, t in data["exports"] if not t})
        types = sorted({n for n, t in data["exports"] if t and n not in values})
        body.append("Exports from `%s`:" % "`, `".join(mod["entry"]))
        if values:
            body.append("- Values (%d): %s" % (len(values), ", ".join("`%s`" % v for v in values[:60])
                                               + (" ... +%d more" % (len(values) - 60) if len(values) > 60 else "")))
        if types:
            body.append("- Types (%d): %s" % (len(types), ", ".join("`%s`" % v for v in types[:40])
                                              + (" ... +%d more" % (len(types) - 40) if len(types) > 40 else "")))
    elif not mod["entry"]:
        body.append("Not published: internal tooling, no package entry.")
    if data["public_files"]:
        body.append("- Files behind the entry: " + ", ".join("`%s`" % f for f in sorted(data["public_files"])))
    body += ["", "## Source files", ""]
    if len(data["files"]) <= 25:
        for f in data["files"]:
            body.append("- `%s`" % f)
    else:
        groups = defaultdict(int)
        for f in data["files"]:
            groups["/".join(posixpath.dirname(f).split("/")[:4])] += 1
        for g, n in sorted(groups.items()):
            body.append("- `%s/` (%d files)" % (g, n))
    body += ["", "## Tests", ""]
    if data["test_files"]:
        ids = sorted(data["test_ids"])
        body.append("%d test files in `tests/`, about %d test cases (static count of `it`/`test` calls)." % (
            len(data["test_files"]), data["test_cases"]))
        if ids:
            body.append("Roadmap items named in the tests (%d): %s." % (len(ids), ", ".join(ids)))
        else:
            body.append("No roadmap IDs are named in its tests.")
    else:
        body.append("No test files are assigned to this module.")
    body += ["", "## Documents", ""]
    n = len(docs_naming)
    body.append("%d documents name it: %s." % (n, link(tag_hub_name("module/" + slug))) if n
                else "No document names it (empty tag note: %s)." % link(tag_hub_name("module/" + slug)))
    return "\n".join(fm + [""] + body) + "\n"


def render_doc(d):
    tags = [PROJECT, "doc", "doc_kind/" + d["kind"], "status/" + d["status"]]
    tags += ["topic/" + t for t in d["topics"]]
    tags += ["module/" + m for m in d["modules"]]
    tags += ["phase/%d" % p for p in d["phases"]]
    for t in tags:
        check_tag(t)
    fm = ["---", "title: " + yaml_str(d["title"]), "type: doc", "project: " + PROJECT,
          "source: " + yaml_str(d["path"]), "doc_kind: " + d["kind"], "status: " + d["status"],
          "source_lines: %d" % d["lines"]]
    if d["is_item"]:
        fm += ["criteria_checked: " + d["boxes"], "declared_status: " + (d["declared"] or "none")]
    fm += ["tags: [%s]" % ", ".join(tags), "---"]
    body = ["# " + d["title"], "",
            "Source: `%s` (the repository holds the full text; this note is a summary)." % d["path"], "",
            "**Summary:** " + (d["summary"] or "(no prose found)"), "", "## Sections (H2)", ""]
    if d["h2"]:
        for h in d["h2"][:40]:
            body.append("- " + h)
        if len(d["h2"]) > 40:
            body.append("- ... +%d more" % (len(d["h2"]) - 40))
    else:
        body.append("No H2 sections.")
    if d["modules"]:
        body += ["", "## Modules it names", "", " ".join(link(mod_slug(m)) for m in d["modules"])]
    return "\n".join(fm + [""] + body) + "\n"


def render_modules_note(info):
    fm = ["---", "title: Module list", "type: atlas-part", "project: " + PROJECT,
          "tags: [%s, atlas, modules]" % PROJECT, "---"]
    body = ["# Modules by layer", "",
            "One line per module. Dependency details are in each module note; the whole graph is in %s." % link(MAP_NAME),
            ""]
    for layer, blurb in LAYERS:
        body += ["## " + layer, "", blurb, ""]
        for slug, mod in MODULES.items():
            if mod["layer"] == layer:
                body.append("- %s - %s (`%s`, %d files, %d lines)" % (
                    link(mod_slug(slug), slug), mod["desc"], mod["status"], len(info[slug]["files"]),
                    info[slug]["lines"]))
        body.append("")
    return "\n".join(fm + [""] + body)


def render_map_note(info):
    fm = ["---", "title: Dependency map", "type: atlas-part", "project: " + PROJECT,
          "tags: [%s, atlas, dependencies]" % PROJECT, "---"]
    lines = ["```mermaid", "flowchart LR"]
    for layer, _ in LAYERS:
        members = [s for s, m in MODULES.items() if m["layer"] == layer]
        lines.append('  subgraph L_%s["%s"]' % (layer, layer))
        for s in members:
            lines.append('    %s["%s"]' % (node_id(s), s))
        lines.append("  end")
    for slug in MODULES:
        for dep in sorted(info[slug]["uses"]):
            lines.append("  %s --> %s" % (node_id(slug), node_id(dep)))
    lines.append("```")
    body = ["# Dependency map", "",
            "Arrow = \"uses\" (from static imports; type-only imports count). Test-only dependencies are left out here and "
            "shown dashed in each module note. External packages (RxJS, Three.js, Vue) are not drawn.", "",
            "\n".join(lines), "", "Modules: %s" % link(MODULES_NAME)]
    return "\n".join(fm + [""] + body) + "\n"


def parse_phase_names(root_text):
    names = {}
    for n, title in re.findall(r"^###\s+Phase (\d+)\s+[—-]\s+(.+)$", root_text, re.M):
        names[int(n)] = sanitize_text(strip_markdown(title)).replace("`", "")
    return names


def render_phases_note(docs, phase_names):
    fm = ["---", "title: Phases", "type: atlas-part", "project: " + PROJECT,
          "tags: [%s, atlas, phases]" % PROJECT, "---"]
    body = ["# Phases", "",
            "Phases come from `roadmap.md`. An item's status is computed from the checkboxes of its acceptance "
            "criteria: all ticked = done, some = in-progress, none = planned. Many merged items keep a timing criterion "
            "unticked on purpose (the machine was too loaded), so they show as in-progress here; the item's own claim is in "
            "its `declared_status` field. A phase is done when every item is done, in-progress when any item is done or "
            "in progress, planned otherwise. Each phase also has a tag note `phase/<n>`.", ""]
    phases = sorted({p for d in docs for p in d["phases"] if d["is_item"] or d["kind"] == "roadmap-design"})
    for p in phases:
        members = [d for d in docs if p in d["phases"] and (d["is_item"] or d["kind"] == "roadmap-design")]
        counts = defaultdict(int)
        for d in members:
            counts[d["status"]] += 1
        summary = ", ".join("%d %s" % (counts[s], s) for s in ("done", "in-progress", "planned") if counts[s])
        if all(d["status"] in ("done", "reference") for d in members):
            phase_status = "done"
        elif any(d["status"] in ("done", "in-progress") for d in members):
            phase_status = "in-progress"
        else:
            phase_status = "planned"
        body += ["## Phase %d - %s" % (p, phase_names.get(p, "")), "",
                 "Phase status (computed): `%s`. %d notes: %s. Tag note: %s." % (
                     phase_status, len(members), summary, link(tag_hub_name("phase/%d" % p))), ""]
        for d in sorted(members, key=lambda x: x["slug"]):
            body.append("- %s (`%s`)" % (link(d["slug"]), d["status"]))
        body.append("")
    return "\n".join(fm + [""] + body)


def build_hubs(notes):
    """notes: list of dict(slug, title, summary, tags). Returns {tag: [notes]}."""
    by_tag = defaultdict(list)
    for slug in MODULES:  # every module has both hubs, even when empty, so the index patterns always resolve
        by_tag["module/" + slug]
        by_tag["dep/" + slug]
    for n in notes:
        for t in n["tags"]:
            if t == PROJECT:
                continue
            by_tag[t].append(n)
    return by_tag


def hub_tag_alias(tag):
    return {"module": "type/module", "doc": "type/doc"}.get(tag, tag)


def render_hubs(by_tag):
    """Return {filename_without_ext: content}; splits big hubs into parts."""
    out = {}
    for tag, notes in sorted(by_tag.items()):
        shown = hub_tag_alias(tag)
        name = tag_hub_name(shown)
        titles_only = len(notes) > HUB_DETAIL_LIMIT
        entries = []
        for n in sorted(notes, key=lambda x: x["slug"]):
            if titles_only:
                entries.append("- %s %s" % (link(n["slug"]), n["title"]))
            else:
                entries.append("- %s %s \u2014 %s" % (link(n["slug"]), n["title"], truncate(n["short"], 110)))
        parts = []
        current = []
        size = 0
        for e in entries:
            if current and size + len(e) + 1 > HUB_SIZE_LIMIT - 600:
                parts.append(current)
                current, size = [], 0
            current.append(e)
            size += len(e.encode("utf-8")) + 1
        parts.append(current)
        for i, part in enumerate(parts):
            fname = name if i == 0 else "%s-%d" % (name, i + 1)
            head = ["---", "title: " + yaml_str("Tag %s%s" % (shown, "" if len(parts) == 1 else " (part %d of %d)" % (i + 1, len(parts)))),
                    "type: tag-hub", "project: " + PROJECT, "tags: [%s, tag-hub]" % PROJECT, "---", "",
                    "# Tag: %s (%d)%s" % (shown, len(notes), "" if len(parts) == 1 else " - part %d of %d" % (i + 1, len(parts))), ""]
            if tag.startswith("module/"):
                head += ["Module note: %s." % link(mod_slug(tag.split("/", 1)[1])), ""]
            if len(parts) > 1:
                nav = []
                if i > 0:
                    nav.append("previous: " + link(name if i == 1 else "%s-%d" % (name, i)))
                if i < len(parts) - 1:
                    nav.append("next: " + link("%s-%d" % (name, i + 2)))
                head += ["Parts: " + " | ".join(nav), ""]
            out[fname] = "\n".join(head + part) + "\n"
    return out


KEY_DOCS = [
    ("flux-readme", "README"),
    ("flux-roadmap", "roadmap"),
    ("flux-roadmap-readme", "how to read the roadmap items"),
    ("flux-changelog", "CHANGELOG"),
    ("flux-guidelines-contributing", "CONTRIBUTING"),
    ("flux-roadmap-design-frontend-redesign-plan", "frontend redesign plan"),
]


def render_index(by_tag, doc_slugs):
    def family(prefix):
        tags = sorted(t for t in by_tag if t.startswith(prefix + "/"))
        return " | ".join(link(tag_hub_name(t), t.split("/", 1)[1]) for t in tags)

    for slug, _ in KEY_DOCS:
        if slug not in doc_slugs:
            fail("key document missing: " + slug)
    lines = ["---", "title: Atlas of %s" % PROJECT_TITLE, "type: atlas", "project: " + PROJECT,
             "tags: [%s, atlas, index]" % PROJECT, "---", "",
             "# Atlas of %s" % PROJECT_TITLE, "",
             "Markdown only, no images. The repository (`re-flux`) is the source of truth; this atlas is a search index. "
             "Every document note gives its repository path.", "",
             "## How to search", "",
             "1. Open a tag note below: one line per note (title and short summary).",
             "2. Or grep the front matter: `grep -rl 'module/core' .`, `grep -rl 'phase/2' .`, `grep -rl 'status/in-progress' .`. "
             "`status` = `done`, `in-progress`, `planned` or `reference`.",
             "3. Per module: `reflux-tag-module-<name>` lists the documents that name it; `reflux-tag-dep-<name>` lists its dependants.",
             "4. Module list: %s. Dependency map: %s. Phases: %s." % (link(MODULES_NAME), link(MAP_NAME), link(PHASES_NAME)), "",
             "## Tags", "",
             "- **Topics:** " + family("topic"),
             "- **Layers:** " + family("layer"),
             "- **Status:** " + family("status"),
             "- **Kind:** " + family("doc_kind"),
             "- **Type:** %s | %s" % (link(tag_hub_name("type/module"), "module"), link(tag_hub_name("type/doc"), "doc")), "",
             "## Start here", "",
             " | ".join(link(s, label) for s, label in KEY_DOCS), ""]
    return "\n".join(lines)


# --------------------------------------------------------------------------------------
# Output directory handling and validation
# --------------------------------------------------------------------------------------

def prepare_output(out, repo_root):
    out = out.resolve()
    repo_root = repo_root.resolve()
    if out == repo_root or out in repo_root.parents:
        fail("the output directory contains the repository: " + str(out))
    if repo_root in out.parents:
        fail("the output directory is inside the repository: " + str(out))
    if out.exists():
        if not out.is_dir():
            fail("the output path is not a directory: " + str(out))
        entries = list(out.iterdir())
        if entries:
            ours = out / (INDEX_NAME + ".md")
            if not ours.exists():
                fail("the output directory is not empty and has no %s.md; refusing to use it: %s" % (INDEX_NAME, out))
            other = [p.name for p in out.glob("_*atlas.md") if p.name != INDEX_NAME + ".md"]
            if other:
                fail("the output directory holds an atlas with another index name (%s); use a new directory" % other[0])
            for p in entries:
                if p.is_dir():
                    shutil.rmtree(str(p))
                else:
                    p.unlink()
    else:
        out.mkdir(parents=True)
    return out


def write(out, rel, content):
    path = out / rel
    if path.exists():
        fail("refusing to overwrite " + rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


WIKI_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


def validate(out):
    problems = []
    md = sorted(out.rglob("*.md"))
    names = defaultdict(list)
    for p in md:
        names[p.stem].append(p)
    for stem, paths in names.items():
        if len(paths) > 1:
            problems.append("duplicate file name: " + stem)
    all_names = set(names)
    index = out / (INDEX_NAME + ".md")
    broken = 0
    for p in md:
        text = p.read_text(encoding="utf-8")
        fence = False
        for line in text.splitlines():
            if line.startswith("```"):
                fence = not fence
            if fence:
                continue
            for target in WIKI_RE.findall(line):
                if target.strip() not in all_names:
                    broken += 1
                    problems.append("broken link in %s: [[%s]]" % (p.relative_to(out), target))
        fm = re.match(r"---\n(.*?)\n---", text, re.S)
        if fm:
            m = re.search(r"^tags: \[(.*)\]$", fm.group(1), re.M)
            for tag in [t.strip() for t in m.group(1).split(",")] if m else []:
                if tag and not (TAG_RE.match(tag) and re.search(r"[A-Za-z_]", tag)):
                    problems.append("invalid tag in %s: %s" % (p.relative_to(out), tag))
        # accidental tags in body text (outside code fences and front matter)
        body = text[fm.end():] if fm else text
        fence = False
        for line in body.splitlines():
            if line.startswith("```"):
                fence = not fence
            if not fence and re.search(r"(^|[\s(\[,;:>])#[A-Za-z_]", line):
                problems.append("possible accidental tag in %s: %s" % (p.relative_to(out), line.strip()[:80]))
                break
    non_md = [p for p in out.rglob("*") if p.is_file() and p.suffix != ".md"]
    for p in non_md:
        problems.append("non-md file: " + str(p.relative_to(out)))
    sizes = {p.stem: p.stat().st_size for p in md}
    return problems, sizes, len(md), (index.stat().st_size if index.exists() else 0)


def scan_secrets(out):
    hits = []
    for p in sorted(out.rglob("*.md")):
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            for label, rx in SECRET_PATTERNS:
                if rx.search(line):
                    hits.append((label, str(p.relative_to(out)), n, line.strip()[:110]))
    return hits


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------

def main(argv):
    if len(argv) != 2:
        fail("usage: build-atlas.py <output-dir>")
    root = Path(__file__).resolve().parent.parent
    out = prepare_output(Path(argv[1]), root)
    warnings = []
    files = git_files(root)
    resolver = Resolver(files)
    info = collect_modules(root, files, resolver, warnings)
    docs = collect_docs(root, files, git_subjects(root))

    # slug uniqueness across modules and documents
    slugs = {}
    for s in MODULES:
        slugs[mod_slug(s)] = "module " + s
    for d in docs:
        if d["slug"] in slugs:
            fail("slug collision: %s (%s vs %s)" % (d["slug"], d["path"], slugs[d["slug"]]))
        slugs[d["slug"]] = d["path"]
    reserved = {INDEX_NAME, MODULES_NAME, MAP_NAME, PHASES_NAME}
    clash = reserved & set(slugs)
    if clash:
        fail("slug collides with an index note: " + ", ".join(sorted(clash)))

    docs_naming = defaultdict(list)
    for d in docs:
        for m in d["modules"]:
            docs_naming[m].append(d)

    notes = []
    for slug, mod in MODULES.items():
        content = render_module(slug, mod, info[slug], docs_naming[slug])
        write(out, "modules/%s.md" % mod_slug(slug), content)
        tags = ([PROJECT, "module", "layer/" + mod["layer"], "status/" + mod["status"]]
                + ["topic/" + t for t in mod["topics"]] + ["dep/" + d for d in sorted(info[slug]["uses"])])
        notes.append(dict(slug=mod_slug(slug), title=slug, short=mod["desc"], tags=tags))
    for d in docs:
        write(out, "docs/%s.md" % d["slug"], render_doc(d))
        tags = ([PROJECT, "doc", "doc_kind/" + d["kind"], "status/" + d["status"]]
                + ["topic/" + t for t in d["topics"]] + ["module/" + m for m in d["modules"]]
                + ["phase/%d" % p for p in d["phases"]])
        notes.append(dict(slug=d["slug"], title=d["title"], short=d["summary"], tags=tags))

    by_tag = build_hubs(notes)
    for fname, content in render_hubs(by_tag).items():
        write(out, "tags/%s.md" % fname, content)
    hub_names = {tag_hub_name(hub_tag_alias(t)) for t in by_tag}
    if len(hub_names) != len(by_tag):
        fail("two tags map to the same tag note name")

    roadmap_text = read_text(root, "roadmap.md") if "roadmap.md" in files else ""
    write(out, MODULES_NAME + ".md", render_modules_note(info))
    write(out, MAP_NAME + ".md", render_map_note(info))
    write(out, PHASES_NAME + ".md", render_phases_note(docs, parse_phase_names(roadmap_text)))
    write(out, INDEX_NAME + ".md", render_index(by_tag, {d["slug"] for d in docs}))

    problems, sizes, count, index_size = validate(out)
    hits = scan_secrets(out)

    print("Atlas written to: %s" % out)
    print("Notes: %d (modules %d, documents %d, tag notes %d, index notes 4)" % (
        count, len(MODULES), len(docs), count - len(MODULES) - len(docs) - 4))
    print("Index size: %d bytes (%d lines)" % (index_size, (out / (INDEX_NAME + ".md")).read_text().count("\n")))
    biggest = sorted(((s, n) for n, s in sizes.items() if n.startswith(PROJECT + "-tag-")), reverse=True)[:3]
    print("Largest tag notes: " + ", ".join("%s=%d" % (n, s) for s, n in biggest))
    print("Documents with status: " + ", ".join(
        "%s=%d" % (s, sum(1 for d in docs if d["status"] == s)) for s in ("done", "in-progress", "planned", "reference")))
    for w in warnings:
        print("WARNING: " + w)
    if MODULE_STATUS_ASSUMED:
        print("WARNING: no per-module status data in the repository; assumed: " + ", ".join(
            "%s=%s" % (s, m["status"]) for s, m in MODULES.items()))
    print("Validation problems: %d" % len(problems))
    for p in problems:
        print("  PROBLEM: " + p)
    print("Secret/email pattern hits: %d" % len(hits))
    for label, rel, n, line in hits:
        print("  HIT [%s] %s:%d: %s" % (label, rel, n, line))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
