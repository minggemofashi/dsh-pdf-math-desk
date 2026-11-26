"""LaTeX math -> Typst math, for the Typst typesetting kernel (v1.5 D).

A small recursive-descent converter rather than a regex rewriter: `{}` groups,
scripts, `\left...\right`, fractions and environments need balanced parsing,
and an unknown command must fail loudly instead of leaking backslashes into
Typst. Callers get warnings for every deliberate downgrade.

    result = convert_latex(r"\frac{a}{b}")
    result.typst      # "frac(a, b)" or None
    result.warnings   # [{"code": ..., "message": ...}, ...]
    result.error      # None, or {"category": ..., "message": ...}

Tested against 354 real model-translated formulas (see
`.dsh-scratch/typst-convert/REPORT.md`): 100% convert and compile.
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")



class ConversionError(Exception):
    def __init__(self, category: str, message: str, position: int,
                 command: str | None = None, context: str | None = None):
        super().__init__(message)
        self.category = category
        self.message = message
        self.position = position
        self.command = command
        self.context = context

    def as_dict(self) -> dict:
        return {
            "category": self.category,
            "message": self.message,
            "position": self.position,
            "command": self.command,
            "context": self.context,
        }


@dataclass
class ConversionResult:
    latex: str
    typst: str | None
    error: dict | None = None
    warnings: list[dict] = field(default_factory=list)


# --------------------------------------------------------------------------
# Symbol table.  Unicode is used wherever Typst accepts the character in math;
# structural constructs use Typst functions instead of symbol aliases.
# --------------------------------------------------------------------------
SYMBOLS = {
    # Greek (lower case)
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ",
    "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ", "eta": "η",
    "theta": "θ", "vartheta": "ϑ", "iota": "ι", "kappa": "κ",
    "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "omicron": "ο",
    "pi": "π", "varpi": "ϖ", "rho": "ρ", "varrho": "ϱ",
    "sigma": "σ", "varsigma": "ς", "tau": "τ", "upsilon": "υ",
    "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    # Greek (upper case)
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ",
    "Xi": "Ξ", "Pi": "Π", "Sigma": "Σ", "Upsilon": "Υ",
    "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    # Binary operators
    "cdot": "·", "cdotp": "·", "times": "×", "otimes": "⊗",
    "oplus": "⊕", "ominus": "⊖", "odot": "⊙", "pm": "±", "mp": "∓",
    "div": "÷", "ast": "∗", "star": "⋆", "circ": "∘", "bullet": "•",
    "cap": "∩", "cup": "∪", "setminus": "∖", "backslash": "∖",
    "wedge": "∧", "land": "∧", "vee": "∨", "lor": "∨",
    "uplus": "⊎", "sqcap": "⊓", "sqcup": "⊔", "amalg": "⨿",
    "dagger": "†", "ddagger": "‡", "wr": "≀",
    # Relations
    "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥",
    "ne": "≠", "neq": "≠", "approx": "≈", "sim": "∼",
    "simeq": "≃", "cong": "≅", "equiv": "≡", "propto": "∝",
    "subset": "⊂", "subseteq": "⊆", "supset": "⊃", "supseteq": "⊇",
    "in": "∈", "notin": "∉", "ni": "∋", "owns": "∋",
    "mid": "∣", "parallel": "∥", "nparallel": "∦", "perp": "⊥",
    "ll": "≪", "gg": "≫", "prec": "≺", "succ": "≻",
    "preceq": "⪯", "succeq": "⪰", "models": "⊨", "vdash": "⊢",
    "dashv": "⊣", "smile": "⌣", "frown": "⌢",
    "lesssim": "≲", "gtrsim": "≳", "leqslant": "≤", "geqslant": "≥",
    "trianglelefteq": "⊴", "trianglerighteq": "⊵",
    # Arrows
    "to": "→", "rightarrow": "→", "leftarrow": "←",
    "leftrightarrow": "↔", "Rightarrow": "⇒", "Leftarrow": "⇐",
    "Leftrightarrow": "⇔", "longrightarrow": "⟶", "longleftarrow": "⟵",
    "longleftrightarrow": "⟷", "Longrightarrow": "⟹", "Longleftarrow": "⟸",
    "Longleftrightarrow": "⟺", "hookrightarrow": "↪", "hookleftarrow": "↩",
    "uparrow": "↑", "downarrow": "↓", "updownarrow": "↕",
    "nearrow": "↗", "searrow": "↘", "swarrow": "↙", "nwarrow": "↖",
    "implies": "⇒", "impliedby": "⇐", "iff": "⇔",
    "mapsto": "↦", "longmapsto": "⟼",
    # Misc symbols
    "infty": "∞", "partial": "∂", "nabla": "∇", "forall": "∀",
    "exists": "∃", "nexists": "∄", "neg": "¬", "lnot": "¬",
    "emptyset": "∅", "varnothing": "∅", "aleph": "ℵ", "hbar": "ℏ",
    "ell": "ℓ", "Re": "ℜ", "Im": "ℑ", "prime": "′", "degree": "°",
    "angle": "∠", "triangle": "△", "square": "□", "Box": "□",
    "checkmark": "✓", "blacksquare": "■", "diamondsuit": "♢",
    "heartsuit": "♡", "clubsuit": "♣", "spadesuit": "♠",
    "flat": "♭", "natural": "♮", "sharp": "♯",
    "colon": ":", "ldotp": ".", "vdots": "⋮", "ddots": "⋱",
    "ldots": "…", "dots": "…", "dotsb": "⋯", "dotsc": "…",
    "dotsm": "⋯", "dotsi": "⋯", "cdots": "⋯",
    "dots.h": "…", "dots.c": "⋯", "dots.v": "⋮", "dots.down": "⋱",
    # Delimiters / big operators
    "langle": "⟨", "rangle": "⟩", "lfloor": "⌊", "rfloor": "⌋",
    "lceil": "⌈", "rceil": "⌉", "lbrace": "\\{", "rbrace": "\\}",
    "vert": "|", "lvert": "|", "rvert": "|", "Vert": "‖",
    "lVert": "‖", "rVert": "‖", "|": "‖",
    "sum": "∑", "prod": "∏", "coprod": "∐", "int": "∫",
    "iint": "∬", "iiint": "∭", "iiiint": "⨌", "oint": "∮",
    "oiint": "∯", "oiiint": "∰",
    "bigcup": "⋃", "bigcap": "⋂", "bigoplus": "⨁", "bigotimes": "⨂",
    "bigvee": "⋁", "bigwedge": "⋀", "bigsqcup": "⨆",
    "biguplus": "⨄",
    "smallint": "∫",
    # Punctuation / spacing-like symbols
    "quad": "quad", "qquad": "wide",
    ",": "thin", ";": "thick", ":": "med", ">": "med",
    "!": "#h(-0.1667em)", " ": "space",
    "enspace": "med", "thinspace": "thin", "medspace": "med",
    "thickspace": "thick", "negthinspace": "#h(-0.1667em)",
    "allowbreak": "", "nobreak": "",
}

NAMED_OPERATORS = {
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos",
    "arctan", "sinh", "cosh", "tanh", "coth", "log", "ln", "lg", "exp",
    "det", "dim", "ker", "gcd", "max", "min", "sup", "inf", "lim",
    "limsup", "liminf", "arg", "deg", "hom", "Pr", "mod",
}

SPACING_COMMANDS = {
    ",": "thin", ":": "med", ">": "med", ";": "thick",
    "!": "#h(-0.1667em)", " ": "space", "quad": "quad", "qquad": "wide",
    "enspace": "med", "thinspace": "thin", "medspace": "med",
    "thickspace": "thick", "negthinspace": "#h(-0.1667em)",
}

TEXT_COMMANDS = {
    "text", "mbox", "textrm", "textnormal", "textup", "hbox",
    "textbf", "textit", "texttt", "textsf", "textsc", "emph",
}

MATH_STYLE_COMMANDS = {
    "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "mathbb",
    "mathcal", "mathscr", "mathfrak", "boldsymbol", "bm", "mathnormal",
}

ACCENT_COMMANDS = {
    "hat": "hat", "widehat": "hat", "tilde": "tilde",
    "widetilde": "tilde", "vec": "arrow", "dot": "dot",
    "ddot": "diaer", "dddot": "dot(dot(dot(%s)))",
    "acute": "acute", "grave": "grave", "breve": "breve",
    "check": "caron", "mathring": "circle",
}

MATRIX_DELIMS = {
    "matrix": None, "smallmatrix": None,
    "pmatrix": "(", "bmatrix": "[", "Bmatrix": "{",
    "vmatrix": "|", "Vmatrix": "||",
    "pmatrix*": "(", "bmatrix*": "[", "Bmatrix*": "{",
    "vmatrix*": "|", "Vmatrix*": "||", "matrix*": None,
}

ALIGN_ENVS = {"aligned", "align", "align*", "alignedat", "alignat",
              "alignat*", "split", "eqnarray", "eqnarray*"}
GATHER_ENVS = {"gather", "gather*", "gathered", "multline", "multline*",
               "multlined"}


def _brace_context(src: str, pos: int, width: int = 28) -> str:
    left = max(0, pos - width)
    right = min(len(src), pos + width)
    return src[left:right].replace("\n", "\\n")


class Converter:
    def __init__(self, src: str, display: bool = True):
        self.src = src
        self.n = len(src)
        self.i = 0
        self.display = display
        self.warnings: list[dict] = []
        self._env_depth = 0

    # ------------------------------------------------------------- utilities
    def warn(self, code: str, message: str) -> None:
        if not any(w["code"] == code for w in self.warnings):
            self.warnings.append({"code": code, "message": message})

    def fail(self, category: str, message: str,
             command: str | None = None) -> None:
        raise ConversionError(category, message, self.i, command,
                              _brace_context(self.src, self.i))

    def peek(self, offset: int = 0) -> str:
        j = self.i + offset
        return self.src[j] if 0 <= j < self.n else ""

    def at_end(self) -> bool:
        return self.i >= self.n

    def skip_spaces(self) -> None:
        while self.i < self.n and self.src[self.i] in " \t\r\n":
            self.i += 1

    def expect(self, char: str) -> None:
        if self.peek() != char:
            self.fail("unbalanced_brace",
                      "期望 %r，实际是 %r" % (char, self.peek() or "<结束>"))
        self.i += 1

    def read_letter_command(self) -> str:
        start = self.i
        while self.i < self.n and self.src[self.i].isalpha():
            self.i += 1
        name = self.src[start:self.i]
        if self.i < self.n and self.src[self.i] == "*":
            self.i += 1
            name += "*"
        return name

    def raw_group(self) -> str:
        """Read a balanced {...} and return its raw body (outer braces gone)."""
        self.skip_spaces()
        self.expect("{")
        depth = 1
        start = self.i
        while self.i < self.n:
            ch = self.src[self.i]
            if ch == "\\":
                self.i += 2
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    body = self.src[start:self.i]
                    self.i += 1
                    return body
            self.i += 1
        self.fail("unbalanced_brace", "花括号没有配对（缺少 }）")

    def raw_or_single_argument(self, command: str) -> str:
        """LaTeX allows \\mathbb C as shorthand for \\mathbb{C}."""
        self.skip_spaces()
        if self.at_end():
            self.fail("missing_argument", "\\%s 缺少参数" % command, command)
        if self.peek() == "{":
            return self.raw_group()
        if self.peek() == "\\":
            start = self.i
            self.i += 1
            name = self.read_letter_command()
            return "\\" + name
        char = self.peek()
        self.i += 1
        return char

    def optional_raw(self) -> str | None:
        self.skip_spaces()
        if self.peek() != "[":
            return None
        self.i += 1
        depth = 0
        start = self.i
        while self.i < self.n:
            ch = self.src[self.i]
            if ch == "\\":
                self.i += 2
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth = max(0, depth - 1)
            elif ch == "]" and depth == 0:
                body = self.src[start:self.i]
                self.i += 1
                return body
            self.i += 1
        self.fail("unbalanced_bracket", "可选参数 [ ... ] 没有配对的 ]")

    # --------------------------------------------------------------- parsing
    def parse(self) -> str:
        out = self.parse_sequence()
        return normalise_output(out)

    def parse_sequence(self, stop: str | None = None) -> str:
        out: list[str] = []
        while self.i < self.n:
            ch = self.src[self.i]
            if stop == "brace" and ch == "}":
                break
            if stop == "right" and self.src.startswith("\\right", self.i):
                break
            if ch == "}":
                self.fail("unbalanced_brace", "多余的 }（没有对应的 {）")
            if ch == "{":
                out.append(self.parse_group())
                continue
            if ch in "^_":
                self.i += 1
                arg = self.parse_script_argument()
                out.append(ch + "(" + arg + ")")
                continue
            if ch == "\\":
                if self.src.startswith("\\\\", self.i):
                    self.i += 2
                    self.warn("linebreak_outside_environment",
                              "\\\\ 在环境外被当作 Typst 数学换行")
                    out.append(" \\ ")
                    continue
                out.append(self.parse_command())
                continue
            if ch == "&":
                self.i += 1
                out.append(" & ")
                self.warn("alignment_outside_environment",
                          "& 在环境外被保留为 Typst 对齐点")
                continue
            if ch == "~":
                self.i += 1
                out.append(" ")
                continue
            if ch == "#":
                # Bare # would switch Typst into code mode.
                self.i += 1
                out.append("\\#")
                continue
            if ch == "$":
                self.i += 1
                out.append("\\$")
                continue
            out.append(ch)
            self.i += 1
        return "".join(out)

    def parse_group(self) -> str:
        content = self.raw_group()
        child = Converter(content, display=self.display)
        result = child.parse()
        self.warnings.extend(child.warnings)
        return result

    def parse_argument(self, command: str) -> str:
        self.skip_spaces()
        if self.at_end():
            self.fail("missing_argument",
                      "\\%s 缺少参数" % command, command)
        if self.peek() == "{":
            return self.parse_group()
        if self.peek() == "\\":
            return self.parse_command()
        char = self.peek()
        self.i += 1
        if char in "^_&}":
            self.fail("missing_argument",
                      "\\%s 的参数以 %r 开头" % (command, char), command)
        return char

    def parse_script_argument(self) -> str:
        self.skip_spaces()
        if self.at_end():
            self.fail("missing_argument", "上下标缺少参数")
        if self.peek() == "{":
            return self.parse_group()
        if self.peek() == "\\":
            return self.parse_command()
        char = self.peek()
        self.i += 1
        return char

    # ------------------------------------------------------------- commands
    def parse_command(self) -> str:
        start = self.i
        self.expect("\\")
        if self.at_end():
            self.fail("unexpected_token", "公式以孤立的反斜杠结束")
        ch = self.peek()
        if ch == "\\":
            self.i += 1
            self.warn("linebreak_outside_environment",
                      "\\\\ 在环境外被当作 Typst 数学换行")
            return " \\ "
        if ch in SPACING_COMMANDS:
            self.i += 1
            return SPACING_COMMANDS[ch]
        if ch in "{}%&#_$":
            self.i += 1
            literal = {"{": "\\{", "}": "\\}", "%": "%", "&": "\\&",
                       "#": "\\#", "_": "\\_", "$": "\\$"}[ch]
            return literal
        if not ch.isalpha():
            self.i += 1
            self.fail("unsupported_command", "不支持的命令 \\%s" % ch,
                      "\\" + ch)
        name = self.read_letter_command()

        if name in ("displaystyle", "textstyle", "scriptstyle",
                    "scriptscriptstyle"):
            return self.handle_style(name)
        if name in ("limits", "nolimits", "displaylimits"):
            self.warn("limits_modifier_ignored",
                      "\\%s 被忽略；Typst 按自己的显示样式排版" % name)
            return ""
        if name in ("label", "tag", "nonumber", "notag"):
            argument = self.raw_group() if name in ("label", "tag") else ""
            self.warn("label_tag_ignored",
                      "\\%s 被忽略；Typst 侧没有对应的公式编号/标签" % name)
            return ""
        if name in ("index", "footnote", "footnotemark", "footnotetext"):
            self.raw_group()
            self.fail("unsupported_command",
                      "\\%s（脚注/索引）不在数学转换范围内" % name,
                      "\\" + name)
        if name in ("begin",):
            return self.parse_environment()
        if name in ("end",):
            self.fail("unexpected_end", "出现没有 \\begin 的 \\end", "\\end")
        if name in ("left", "right", "middle"):
            if name == "left":
                return self.parse_left_right()
            if name == "right":
                self.fail("unbalanced_left_right",
                          "出现没有 \\left 的 \\right", "\\right")
            self.fail("unsupported_command",
                      "\\middle 无法直接映射到 Typst 的 lr()", "\\middle")
        if name in ("frac", "dfrac", "tfrac", "cfrac"):
            numerator = self.parse_argument(name)
            denominator = self.parse_argument(name)
            if name in ("dfrac", "cfrac"):
                self.warn("frac_style_ignored",
                          "\\%s 的显示样式由 Typst 上下文决定" % name)
            return "frac(%s, %s)" % (numerator, denominator)
        if name in ("binom", "dbinom", "tbinom"):
            top = self.parse_argument(name)
            bottom = self.parse_argument(name)
            if name != "binom":
                self.warn("binom_style_ignored",
                          "\\%s 的样式由 Typst 上下文决定" % name)
            return "binom(%s, %s)" % (top, bottom)
        if name == "sqrt":
            index = self.optional_raw()
            argument = self.parse_argument(name)
            if index is not None:
                index_typst = self.convert_subformula(index, "sqrt index")
                return "root(%s, %s)" % (index_typst, argument)
            return "sqrt(%s)" % argument
        if name in ("overline", "underline"):
            argument = self.parse_argument(name)
            return "%s(%s)" % (name, argument)
        if name in ("overbrace", "underbrace"):
            argument = self.parse_argument(name)
            label = None
            if self.peek() in "^_":
                self.i += 1
                label = self.parse_script_argument()
            if label is not None:
                return "%s(%s, %s)" % (name, argument, label)
            return "%s(%s)" % (name, argument)
        if name in ACCENT_COMMANDS:
            argument = self.parse_argument(name)
            template = ACCENT_COMMANDS[name]
            if "%s" in template:
                return template % argument
            return "%s(%s)" % (template, argument)
        if name in ("overrightarrow", "overleftarrow"):
            argument = self.parse_argument(name)
            self.warn("long_arrow_accent_degraded",
                      "\\%s 退化为普通 arrow 重音" % name)
            return "arrow(%s)" % argument
        if name in ("overleftrightarrow", "underleftarrow",
                    "underrightarrow"):
            self.parse_argument(name)
            self.fail("unsupported_command",
                      "\\%s 在 Typst 0.15 没有直接对应物" % name,
                      "\\" + name)
        if name in ("text", "mbox", "textrm", "textnormal", "textup", "hbox",
                    "textbf", "textit", "texttt", "textsf", "textsc", "emph"):
            return self.parse_text_command(name)
        if name in MATH_STYLE_COMMANDS:
            return self.parse_math_style(name)
        if name == "operatorname" or name.startswith("operatorname"):
            raw = self.raw_group()
            cleaned = clean_operator_name(raw)
            if not cleaned:
                self.fail("missing_argument", "\\operatorname{} 为空", name)
            if name.endswith("*"):
                self.warn("operatorname_limits_unknown",
                          "\\operatorname* 的上下限行为未验证，按普通 op 处理")
            return 'op("%s")' % escape_typst_string(cleaned)
        if name in NAMED_OPERATORS:
            return name
        if name == "pmod":
            argument = self.parse_argument(name)
            return "(mod %s)" % argument
        if name == "pod":
            argument = self.parse_argument(name)
            return "(%s)" % argument
        if name in ("bmod", "mod"):
            return "mod"
        if name in ("not",):
            return self.parse_not()
        if name in ("boxed", "fbox"):
            argument = self.parse_argument(name)
            self.warn("boxed_via_box",
                      "\\%s 用 #box(stroke:) 模拟，边距与 LaTeX \\fbox 不完全一致" % name)
            return '#box(stroke: 0.6pt, inset: 4pt, [$%s$])' % argument
        if name in ("cancel", "bcancel", "xcancel", "sout"):
            argument = self.parse_argument(name)
            if name in ("bcancel", "xcancel", "sout"):
                self.warn("cancel_direction_ignored",
                          "\\%s 统一映射为 cancel()，斜线方向不保留" % name)
            return "cancel(%s)" % argument
        if name in ("stackrel", "overset", "underset"):
            top = self.parse_argument(name)
            base = self.parse_argument(name)
            if name == "underset":
                return "attach(%s, b: %s)" % (base, top)
            return "attach(%s, t: %s)" % (base, top)
        if name == "substack":
            raw = self.raw_group()
            rows = split_top_level(raw, "\\\\")
            converted = []
            for row in rows:
                row = row.strip()
                if not row:
                    continue
                converted.append(self.convert_subformula(row, "substack row"))
            if not converted:
                self.fail("missing_argument", "\\substack{} 为空", name)
            self.warn("substack_layout_degraded",
                      "\\substack 退化为多行脚标，行距与 LaTeX 不完全一致")
            return " \\ ".join(converted)
        if name in ("xrightarrow", "xleftarrow", "xRightarrow",
                    "xLeftarrow", "xleftrightarrow"):
            label = self.optional_raw()
            argument = self.parse_argument(name)
            arrow = {
                "xrightarrow": "→", "xleftarrow": "←",
                "xRightarrow": "⇒", "xLeftarrow": "⇐",
                "xleftrightarrow": "↔",
            }[name]
            if label is not None:
                label_typst = self.convert_subformula(label, "arrow label")
                self.warn("xarrow_label_degraded",
                          "\\%s 的标签放在箭头上方，Typst attach 的位置略有差异" % name)
                return "attach(%s, t: %s)" % (arrow, label_typst)
            return arrow
        if name in ("phantom", "hphantom", "vphantom"):
            self.parse_argument(name)
            self.fail("unsupported_command",
                      "\\%s 需要不可见的精确占位；Typst 0.15 没有 hide/phantom，"
                      "用空白代替会改变宽度" % name, "\\" + name)
        if name in ("smash",):
            argument = self.parse_argument(name)
            self.warn("smash_ignored", "\\smash 被忽略，行高仍按内容计算")
            return argument
        if name in ("mathop",):
            argument = self.parse_argument(name)
            self.warn("mathop_class_degraded",
                      "\\mathop 用 op() 近似，运算符类别不完全等价")
            return "op(%s)" % argument
        if name in ("mathbin", "mathrel", "mathord", "mathopen",
                    "mathclose", "mathpunct", "mathinner"):
            argument = self.parse_argument(name)
            self.warn("math_class_ignored",
                      "\\%s 的原子类别被忽略，只保留内容" % name)
            return argument
        if name in ("color", "textcolor"):
            if name == "textcolor":
                self.raw_group()
            self.raw_group()
            self.fail("unsupported_command",
                      "\\%s 需要嵌套 Typst 文本填充；当前转换器不处理颜色"
                      % name, "\\" + name)
        if name in ("hspace", "hskip", "kern", "mkern"):
            raw = self.raw_group() if name in ("hspace", "hskip") else None
            if raw is None:
                self.skip_spaces()
                start = self.i
                while self.i < self.n and self.src[self.i] not in " \\{}":
                    self.i += 1
                raw = self.src[start:self.i]
            converted = convert_dimension(raw)
            if converted is None:
                self.fail("unsupported_command",
                          "\\%s{%s} 的长度单位无法转换" % (name, raw),
                          "\\" + name)
            self.warn("explicit_space", "\\%s 转成 Typst 显式间距" % name)
            return "#h(%s)" % converted
        if name in ("hfill", "hfil", "vfill", "vfil"):
            self.warn("fill_space_degraded", "\\%s 用 1fr 近似" % name)
            return "#h(1fr)"
        if name in ("big", "Big", "bigg", "Bigg",
                    "bigl", "Bigl", "biggl", "Biggl",
                    "bigr", "Bigr", "biggr", "Biggr",
                    "bigm", "Bigm", "biggm", "Biggm"):
            return self.parse_big(name)
        if name in ("middle",):
            self.fail("unsupported_command", "\\middle 不在当前范围", "\\middle")
        if name in SYMBOLS:
            return SYMBOLS[name]
        if name in ("hline", "cline"):
            self.fail("unsupported_command",
                      "\\%s 只能出现在矩阵/数组内部，当前上下文不支持" % name,
                      "\\" + name)
        if name in ("multicolumn", "multirow"):
            self.fail("unsupported_command",
                      "\\%s 会改变表格结构，Typst 的 mat() 无对应参数" % name,
                      "\\" + name)
        if name in ("intertext", "shortintertext"):
            self.fail("unsupported_command",
                      "\\%s 需要打断对齐环境并插入正文" % name, "\\" + name)
        if name in ("tag",):
            self.fail("unsupported_command", "\\tag 在当前范围外", "\\tag")
        if name in ("nonumber",):
            return ""
        if name in ("eqref", "ref", "cite"):
            self.raw_group()
            self.fail("unsupported_command",
                      "\\%s 依赖交叉引用系统" % name, "\\" + name)
        if name in ("mathds", "mathbbm"):
            raw = self.raw_group()
            self.warn("blackboard_variant", "\\%s 用 bb() 近似" % name)
            return "bb(%s)" % raw
        if name in ("mod", "bmod"):
            return "mod"
        if name in ("quad", "qquad"):
            return SYMBOLS[name]
        self.fail("unsupported_command",
                  "未支持的 LaTeX 命令 \\%s" % name, "\\" + name)
        return ""

    # --------------------------------------------------------- command parts
    def handle_style(self, name: str) -> str:
        if name == "displaystyle":
            self.skip_spaces()
            if self.peek() == "{":
                content = self.parse_group()
                return "display(%s)" % content
            self.warn("displaystyle_ignored",
                      "\\displaystyle 在整段公式上被忽略，Typst 显示公式默认就是 display")
            return ""
        self.warn("text_style_ignored",
                  "\\%s 被忽略，Typst 按上下文排版" % name)
        return ""

    def parse_math_style(self, name: str) -> str:
        raw = self.raw_or_single_argument(name)
        simple = re.fullmatch(r"[A-Za-z0-9 ]+", raw)
        if simple:
            argument = '"%s"' % raw
        else:
            argument = self.convert_subformula(raw, name + " argument")
        if name == "mathbb":
            return "bb(%s)" % argument
        if name in ("mathcal", "mathscr"):
            return "cal(%s)" % argument
        if name == "mathfrak":
            return "frak(%s)" % argument
        if name == "mathsf":
            return "sans(%s)" % argument
        if name == "mathtt":
            return "mono(%s)" % argument
        if name == "mathbf":
            return "bold(%s)" % argument
        if name in ("boldsymbol", "bm"):
            return "bold(%s)" % argument
        if name == "mathit":
            return "italic(%s)" % argument
        if name == "mathrm":
            return "upright(%s)" % argument
        return argument

    def parse_text_command(self, name: str) -> str:
        raw = self.raw_group()
        if name == "textsc":
            self.warn("smallcaps_lost",
                      "Typst 0.15 没有 smallcaps；\\textsc 按普通 text 输出")
        if name in ("textbf",):
            return "bold(%s)" % text_to_typst(raw, self)
        if name in ("textit", "emph"):
            return "italic(%s)" % text_to_typst(raw, self)
        if name in ("texttt",):
            return "mono(%s)" % text_to_typst(raw, self)
        if name in ("textsf",):
            return "sans(%s)" % text_to_typst(raw, self)
        return text_to_typst(raw, self)

    def parse_not(self) -> str:
        self.skip_spaces()
        if self.peek() == "=":
            self.i += 1
            return "≠"
        if self.peek() == "\\":
            saved = self.i
            self.i += 1
            name = self.read_letter_command()
            negated = {
                "in": "∉", "equiv": "≢", "subset": "⊄",
                "subseteq": "⊈", "supset": "⊅", "supseteq": "⊉",
                "cong": "≇", "approx": "≉", "sim": "≁",
                "parallel": "∦", "le": "≰", "ge": "≱", "mid": "∤",
                "ni": "∌", "prec": "⊀", "succ": "⊁",
            }
            if name in negated:
                return negated[name]
            self.i = saved
            self.warn("not_fallback", "\\not 后接未知关系，退回为 ≠")
            return "≠"
        self.fail("missing_argument", "\\not 后面没有关系符", "\\not")

    def parse_big(self, name: str) -> str:
        delimiter = self.parse_delimiter("\\" + name)
        self.warn("big_size_ignored",
                  "\\%s 只保留定界符，不加高；需要等高等定界符时用 \\left/\\right"
                  % name)
        return delimiter

    def parse_delimiter(self, command: str) -> str:
        self.skip_spaces()
        if self.at_end():
            self.fail("missing_argument", "%s 缺少定界符" % command)
        ch = self.peek()
        if ch == "\\":
            # Escaped non-letter delimiters: \{, \}, \|.
            if self.i + 1 < self.n and self.src[self.i + 1] in "{}|":
                escaped = self.src[self.i + 1]
                self.i += 2
                return {"{": "\\{", "}": "\\}", "|": "‖"}[escaped]
            self.i += 1
            if self.at_end():
                self.fail("missing_argument", "%s 缺少定界符" % command)
            name = self.read_letter_command()
            mapping = {
                "{": "\\{", "}": "\\}", "|": "‖", "vert": "|",
                "lvert": "|", "rvert": "|", "Vert": "‖",
                "lVert": "‖", "rVert": "‖", "lfloor": "⌊",
                "rfloor": "⌋", "lceil": "⌈", "rceil": "⌉",
                "langle": "⟨", "rangle": "⟩", "backslash": "∖",
                ".": "",
            }
            if name in mapping:
                return mapping[name]
            self.fail("unsupported_command",
                      "%s 后跟随不支持的分隔符 \\%s" % (command, name),
                      "\\" + name)
        self.i += 1
        if ch in "()[]|.":
            return "" if ch == "." else ch
        self.fail("unsupported_command",
                  "%s 后跟随不支持的定界符 %r" % (command, ch))

    def parse_left_right(self) -> str:
        left = self.parse_delimiter("\\left")
        content = self.parse_sequence(stop="right")
        if not self.src.startswith("\\right", self.i):
            self.fail("unbalanced_left_right",
                      "\\left 没有对应的 \\right")
        self.i += len("\\right")
        right = self.parse_delimiter("\\right")
        return wrap_left_right(left, right, content, self)

    # ---------------------------------------------------------- environments
    def parse_environment(self) -> str:
        env = self.raw_group().strip()
        if not env:
            self.fail("unsupported_environment", "\\begin{} 环境名为空")
        optional_spec = None
        if env.startswith("array") or env in ("darray",):
            self.optional_raw()
            if self.peek() == "{":
                optional_spec = self.raw_group()
        elif env in ("alignedat", "alignat", "alignat*"):
            if self.peek() == "{":
                self.raw_group()
        elif env.endswith("*") and env[:-1] in MATRIX_DELIMS:
            self.optional_raw()

        content, end_env = self.read_environment_body(env)
        if end_env != env:
            self.fail("unbalanced_environment",
                      "\\begin{%s} 与 \\end{%s} 不匹配" % (env, end_env),
                      "\\begin{" + env + "}")

        if env in MATRIX_DELIMS:
            return self.convert_matrix(env, content)
        if env in ("cases", "cases*", "dcases", "dcases*"):
            return self.convert_cases(env, content)
        if env in ALIGN_ENVS:
            return self.convert_alignment(env, content, align=True)
        if env in GATHER_ENVS:
            return self.convert_alignment(env, content, align=False)
        if env in ("equation", "equation*", "displaymath", "math"):
            child = Converter(content, display=True)
            result = child.parse()
            self.warnings.extend(child.warnings)
            return result
        if env == "array" or env == "darray":
            if optional_spec is not None:
                bad = set(re.sub(r"[clr]", "", optional_spec)) - set("|")
                if bad or "|" in optional_spec:
                    self.warn("array_alignment_ignored",
                              "array 列格式 {%s} 被忽略，Typst mat() 各列居中且无竖线"
                              % optional_spec)
            return self.convert_matrix("array", content)
        if env == "subarray":
            return self.convert_matrix("array", content)
        if env in ("rcases", "rcases*", "drcases"):
            self.fail("unsupported_environment",
                      "\\begin{%s} 是右花括号分段，Typst cases() 只有左侧花括号"
                      % env, "\\begin{" + env + "}")
        if env in ("gathered",):
            return self.convert_alignment(env, content, align=False)
        if env in ("align*", "flalign", "flalign*"):
            return self.convert_alignment(env, content, align=True)
        if env in ("split",):
            return self.convert_alignment(env, content, align=True)
        self.fail("unsupported_environment",
                  "未支持的环境 \\begin{%s}" % env,
                  "\\begin{" + env + "}")
        return ""

    def read_environment_body(self, env: str) -> tuple[str, str]:
        """Return (raw body, actual end env), leaving self.i after \\end{...}."""
        start = self.i
        depth = 0
        i = self.i
        while i < self.n:
            if self.src.startswith("\\begin", i):
                depth += 1
                i += len("\\begin")
                continue
            if self.src.startswith("\\end", i):
                j = i + len("\\end")
                # read the {name} without moving self.i yet
                k = j
                while k < self.n and self.src[k] in " \t\r\n":
                    k += 1
                if k < self.n and self.src[k] == "{":
                    end = self.src.find("}", k)
                    if end == -1:
                        self.i = i
                        self.fail("unbalanced_environment",
                                  "\\end 后缺少关闭花括号")
                    name = self.src[k + 1:end].strip()
                    if depth == 0:
                        body = self.src[start:i]
                        self.i = end + 1
                        return body, name
                    depth -= 1
                    i = end + 1
                    continue
            i += 1
        self.i = start
        self.fail("unbalanced_environment",
                  "\\begin{%s} 没有找到配对的 \\end{%s}" % (env, env),
                  "\\begin{" + env + "}")

    def convert_cell(self, cell: str, where: str) -> str:
        child = Converter(cell, display=False)
        try:
            result = child.parse()
        except ConversionError as error:
            error.message = "%s: %s" % (where, error.message)
            raise
        self.warnings.extend(child.warnings)
        return result

    def convert_matrix(self, env: str, content: str) -> str:
        rows = split_rows(content)
        converted_rows = []
        for row_number, row in enumerate(rows, 1):
            if not row.strip():
                continue
            cells = split_top_level(row, "&")
            converted_cells = []
            for cell_number, cell in enumerate(cells, 1):
                cell = cell.strip()
                cell = strip_array_noise(cell)
                if cell == "":
                    converted_cells.append("#none")
                    continue
                converted_cells.append(self.convert_cell(
                    cell, "%s 第%d行第%d列" % (env, row_number, cell_number)))
            if converted_cells:
                converted_rows.append(", ".join(converted_cells))
        if not converted_rows:
            self.fail("empty_environment", "\\begin{%s} 没有单元格" % env,
                      "\\begin{" + env + "}")
        body = "; ".join(converted_rows)
        delim = MATRIX_DELIMS.get(env)
        if delim == "||":
            self.warn("vmatrix_double_bar",
                      "Vmatrix 用 lr(‖ mat(...) ‖) 模拟双竖线")
            return "lr(‖ mat(%s) ‖)" % body
        if delim is None:
            return "mat(%s)" % body
        return 'mat(delim: "%s", %s)' % (delim, body)

    def convert_cases(self, env: str, content: str) -> str:
        rows = split_rows(content)
        converted = []
        for row in rows:
            row = row.strip()
            if not row:
                continue
            cells = split_top_level(row, "&")
            converted_cells = []
            for cell in cells:
                cell = cell.strip()
                if not cell:
                    converted_cells.append("#none")
                else:
                    converted_cells.append(self.convert_cell(cell, env))
            converted.append(" & ".join(converted_cells))
        if not converted:
            self.fail("empty_environment", "\\begin{%s} 没有内容" % env,
                      "\\begin{" + env + "}")
        if env.startswith("d"):
            self.warn("cases_style_ignored", "\\begin{%s} 的 display 样式被忽略" % env)
        return "cases(%s)" % ", ".join(converted)

    def convert_alignment(self, env: str, content: str,
                          align: bool) -> str:
        rows = split_rows(content)
        converted = []
        for row in rows:
            row = row.strip()
            if not row:
                continue
            if align:
                cells = split_top_level(row, "&")
                cleaned = []
                for cell in cells:
                    cell = cell.strip()
                    cleaned.append(self.convert_cell(cell, env) if cell else "")
                converted.append(" & ".join(cleaned))
            else:
                converted.append(self.convert_cell(row, env))
        if not converted:
            self.fail("empty_environment", "\\begin{%s} 没有内容" % env,
                      "\\begin{" + env + "}")
        self.warn("aligned_as_flow",
                  "\\begin{%s} 用原生 & / \\\\ 对齐；公式编号与列间距不保留" % env)
        return " \\ ".join(converted)

    def convert_subformula(self, latex: str, where: str) -> str:
        child = Converter(latex, display=False)
        try:
            result = child.parse()
        except ConversionError as error:
            error.message = "%s: %s" % (where, error.message)
            raise
        self.warnings.extend(child.warnings)
        return result


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def normalise_output(text: str) -> str:
    text = re.sub(r"[ \t\r\n]+", " ", text).strip()
    text = text.replace(" _ (", "_(").replace(" ^ (", "^(")
    text = text.replace("( ", "(").replace(" )", ")")
    text = space_typst_math(text)
    # A plain brace in Typst math is a visible brace; the converter only
    # emits escaped braces for literal ones, so an unescaped brace here is a
    # converter bug (or an unhandled text construct).
    if re.search(r"(?<!\\)[{}]", text):
        # Braces inside text("...") are legitimate literal text.
        cleaned = re.sub(r'text\("(?:[^"\\]|\\.)*"\)', "", text)
        if re.search(r"(?<!\\)[{}]", cleaned):
            raise ConversionError(
                "internal_unbalanced_output",
                "转换结果里出现未转义的花括号（转换器内部错误）",
                0, None, text[:80])
    return text


PROTECTED_WORDS = {
    # Typst math functions we emit
    "frac", "sqrt", "root", "binom", "mat", "cases", "lr", "abs",
    "norm", "floor", "ceil", "attach", "cancel", "display", "text",
    "upright", "bold", "italic", "sans", "mono", "cal", "bb", "frak",
    "op", "overline", "underline", "overbrace", "underbrace",
    "hat", "tilde", "dot", "diaer", "acute", "grave", "breve",
    "caron", "circle", "arrow",
    # Typst named arguments / keywords we emit
    "delim", "align", "stroke", "inset", "fill", "width", "height",
    "size", "numbering",
    # Typst math spacing/symbol words
    "quad", "wide", "thin", "med", "thick", "space",
    # Typst built-in operators we emit
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos",
    "arctan", "sinh", "cosh", "tanh", "coth", "log", "ln", "lg",
    "exp", "det", "dim", "ker", "gcd", "max", "min", "sup", "inf",
    "lim", "limsup", "liminf", "arg", "deg", "hom", "Pr", "mod",
}

# Characters that should not get surrounding spaces.
ATTACH_CHARS = set("_^'!")
NO_SPACE_BEFORE = set(",.;:)]}")
NO_SPACE_AFTER = set("([{")
MATH_OPERATOR_CHARS = set(
    "+-=<>|*/"
    "·×⊗⊕⊖⊙±∓∘∗⋆→←↔⇒⇐⇔↦⟶⟵⟷⟹⟸⟺↪↩"
    "≤≥≠≈∼≃≅≡∝∈∉∋⊂⊆⊃⊇∪∩∖⊥∥≪≫≺≻⪯⪰⊨⊢⊣"
    "∀∃¬∞∂∇∑∏∫∬∭∮⋃⋂⋁⋀⨁⨂⨆⨄"
    "∠△□✓■≀†‡"
)


def _copy_string(text: str, i: int) -> tuple[str, int]:
    start = i
    i += 1
    while i < len(text):
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == '"':
            return text[start:i + 1], i + 1
        i += 1
    return text[start:], len(text)


def _copy_balanced(text: str, i: int, open_char: str, close_char: str) -> tuple[str, int]:
    depth = 0
    start = i
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == '"':
            _, i = _copy_string(text, i)
            continue
        if ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
            if depth == 0:
                return text[start:i + 1], i + 1
        i += 1
    return text[start:], len(text)


def _segment_letters(run: str) -> str:
    """Split `GL`/`ij` but keep concatenated Typst words (`quadtext`)."""
    if run in PROTECTED_WORDS:
        return run
    words = sorted(PROTECTED_WORDS, key=len, reverse=True)
    parts: list[str] = []
    i = 0
    while i < len(run):
        match = next((word for word in words if run.startswith(word, i)), None)
        if match:
            parts.append(match)
            i += len(match)
        else:
            parts.append(run[i])
            i += 1
    return " ".join(parts)


def space_typst_math(text: str) -> str:
    """Insert the whitespace Typst needs to see separate math atoms.

    Typst reads `GL` or `ij` as one identifier (and errors "unknown variable"),
    while LaTeX reads them as adjacent variables. It also needs spaces around
    `·`; otherwise the symbol joins the identifier. Function names, string
    literals and `#code` chunks are kept intact.
    """
    out: list[str] = []
    i = 0
    n = len(text)
    previous = ""
    while i < n:
        ch = text[i]
        if ch == '"':
            chunk, i = _copy_string(text, i)
            out.append(chunk)
            previous = chunk[-1]
            continue
        if ch == "#":
            start = i
            i += 1
            while i < n and (text[i].isalnum() or text[i] in "._-"):
                i += 1
            if i < n and text[i] == "(":
                _, i = _copy_balanced(text, i, "(", ")")
            chunk = text[start:i]
            out.append(chunk)
            previous = chunk[-1]
            continue
        if ch.isalpha():
            start = i
            while i < n and text[i].isalpha():
                i += 1
            run = text[start:i]
            chunk = _segment_letters(run)
            if previous.isdigit():
                chunk = " " + chunk
            out.append(chunk)
            previous = chunk[-1]
            continue
        if ch.isdigit():
            start = i
            while i < n and (text[i].isdigit() or text[i] == "."):
                i += 1
            chunk = text[start:i]
            if previous.isalpha():
                chunk = " " + chunk
            out.append(chunk)
            previous = chunk[-1]
            if i < n and text[i].isalpha():
                out.append(" ")
                previous = " "
            continue
        if ch in MATH_OPERATOR_CHARS:
            out.append(" " + ch + " ")
            previous = " "
            i += 1
            continue
        if ch in ATTACH_CHARS:
            out.append(ch)
            previous = ch
            i += 1
            continue
        out.append(ch)
        previous = ch
        i += 1
    result = "".join(out)
    result = re.sub(r"[ \t\r\n]+", " ", result).strip()
    result = re.sub(r"\s*_\s*", "_", result)
    result = re.sub(r"\s*\^\s*", "^", result)
    result = re.sub(r"\s*'\s*", "'", result)
    result = re.sub(r"\s*!\s*", "!", result)
    result = re.sub(r"\s*([,.;:\)\]\}])", r"\1", result)
    result = re.sub(r"([\(\[\{])\s*", r"\1", result)
    # `)quad` / `]text` must become separate atoms.
    result = re.sub(r"([\)\]])(?=[A-Za-z#])", r"\1 ", result)
    return result


def wrap_left_right(left: str, right: str, content: str,
                    converter: Converter) -> str:
    if left == "." or right == ".":
        if left == "." and right == "|":
            converter.warn("one_sided_left_right",
                           "\\left. ... \\right| 用 lr(#none ... |) 模拟")
            return "lr(#none %s |)" % content
        if left == "|" and right == ".":
            converter.warn("one_sided_left_right",
                           "\\left| ... \\right. 用 lr(| ... #none) 模拟")
            return "lr(| %s #none)" % content
        converter.warn("one_sided_left_right",
                       "单侧 \\left./\\right. 退化为普通定界符")
        return left + content + right
    if left == "(" and right == ")":
        return "lr((%s))" % content
    if left == "[" and right == "]":
        return "lr([%s])" % content
    if left == "\\{" and right == "\\}":
        return "lr(\\{%s\\})" % content
    if left == "|" and right == "|":
        return "abs(%s)" % content
    if left == "‖" and right == "‖":
        return "norm(%s)" % content
    if left == "⌊" and right == "⌋":
        return "floor(%s)" % content
    if left == "⌈" and right == "⌉":
        return "ceil(%s)" % content
    if left == "⟨" and right == "⟩":
        return "lr(⟨%s⟩)" % content
    converter.warn("left_right_passthrough",
                   "\\left%s ... \\right%s 没有专用的 Typst 定界符组合，按普通符号拼接"
                   % (left or ".", right or "."))
    return left + content + right


def split_top_level(text: str, separator: str) -> list[str]:
    """Split on a separator at brace depth 0, respecting \\escapes."""
    parts = []
    start = 0
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            if separator == "\\\\" and text.startswith("\\\\", i) and depth == 0:
                parts.append(text[start:i])
                i += 2
                # optional [2pt] after a row break
                if i < n and text[i] == "[":
                    close = text.find("]", i)
                    if close != -1:
                        i = close + 1
                start = i
                continue
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        elif ch == separator and depth == 0 and separator != "\\\\":
            parts.append(text[start:i])
            i += 1
            start = i
            continue
        i += 1
    parts.append(text[start:])
    return parts


def split_rows(content: str) -> list[str]:
    """Split matrix/alignment rows on \\\\ or \\cr at top level."""
    rows = []
    start = 0
    depth = 0
    env_depth = 0
    i = 0
    n = len(content)
    while i < n:
        ch = content[i]
        if ch == "\\":
            if content.startswith("\\\\", i) and depth == 0 and env_depth == 0:
                rows.append(content[start:i])
                i += 2
                if i < n and content[i] == "[":
                    close = content.find("]", i)
                    if close != -1:
                        i = close + 1
                start = i
                continue
            if content.startswith("\\cr", i) and depth == 0 and env_depth == 0:
                rows.append(content[start:i])
                i += 3
                start = i
                continue
            if content.startswith("\\begin", i):
                env_depth += 1
                i += len("\\begin")
                continue
            if content.startswith("\\end", i):
                env_depth = max(0, env_depth - 1)
                i += len("\\end")
                continue
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        i += 1
    rows.append(content[start:])
    return rows


def strip_array_noise(cell: str) -> str:
    cell = re.sub(r"\\(?:hline|cline\{[^{}]*\}|toprule|midrule|bottomrule)\b",
                  "", cell).strip()
    return cell


def clean_operator_name(raw: str) -> str:
    raw = raw.replace("\\,", " ").replace("\\;", " ").replace("\\:", " ")
    raw = raw.replace("\\!", "").replace("~", " ")
    raw = re.sub(r"\\[A-Za-z]+", "", raw)
    return re.sub(r"\s+", " ", raw).strip()


def escape_typst_string(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def text_to_typst(raw: str, converter: Converter) -> str:
    """Convert \\text{...} content, including embedded $...$ if present."""
    if "$" not in raw:
        return 'text("%s")' % escape_typst_string(clean_text(raw))
    pieces = []
    index = 0
    for match in re.finditer(r"(?<!\\)\$(.+?)(?<!\\)\$", raw, flags=re.S):
        before = raw[index:match.start()]
        if before:
            pieces.append('text("%s")' % escape_typst_string(clean_text(before)))
        inner = match.group(1)
        converted = converter.convert_subformula(inner, "text math")
        pieces.append(converted)
        index = match.end()
    tail = raw[index:]
    if tail:
        pieces.append('text("%s")' % escape_typst_string(clean_text(tail)))
    if not pieces:
        return 'text("")'
    converter.warn("math_inside_text",
                   "\\text 内嵌 $...$ 已拆成 text() 与数学片段，基线可能略有差异")
    return " ".join(pieces)


def clean_text(raw: str) -> str:
    raw = raw.replace("\\\\", " ")
    raw = raw.replace("~", " ")
    raw = re.sub(r"\\[,;:!]", "", raw)
    raw = re.sub(r"\\([%&#_{}$])", r"\1", raw)
    raw = raw.replace("\\textbackslash", "\\")
    raw = raw.replace("\\textasciitilde", "~")
    raw = raw.replace("{", "").replace("}", "")
    return re.sub(r"[ \t\r\n]+", " ", raw).strip()


def convert_dimension(raw: str) -> str | None:
    raw = raw.strip()
    match = re.fullmatch(r"(-?\d*\.?\d+)\s*(em|ex|pt|pc|in|cm|mm|mu)", raw)
    if not match:
        return None
    value, unit = match.groups()
    factor = {"em": 1.0, "ex": 0.5, "pt": 1.0, "pc": 12.0,
              "in": 72.0, "cm": 28.3465, "mm": 2.83465, "mu": 1 / 18.0}
    points = float(value) * factor[unit]
    return "%.4gpt" % points


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------
def convert_latex(latex: str, display: bool = True) -> ConversionResult:
    converter = Converter(latex, display=display)
    try:
        typst = converter.parse()
    except ConversionError as error:
        return ConversionResult(latex=latex, typst=None,
                                error=error.as_dict(),
                                warnings=converter.warnings)
    return ConversionResult(latex=latex, typst=typst,
                            warnings=converter.warnings)
