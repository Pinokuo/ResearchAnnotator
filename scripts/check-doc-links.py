"""Check repository Markdown/HTML local links and GitHub-style heading anchors.

Uses only Python's standard library; makes no network requests.
"""
import html
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent


def anchors(path):
    text = path.read_text(encoding="utf-8-sig")
    ids = set(re.findall(r'\bid=["\']([^"\']+)', text))
    counts = {}
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, re.M):
        heading = re.sub(r"<[^>]+>", "", html.unescape(heading)).lower()
        slug = "".join(c for c in heading if c.isalnum() or c in "_ -").replace(" ", "-")
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        ids.add(slug + ("-" + str(count) if count else ""))
    return ids


def main():
    errors, checked, fragments = [], 0, 0
    files = [ROOT / "README.md", ROOT / "TESTING.md", ROOT / "CHANGELOG.md", ROOT / "AGENTS.md"]
    for folder in ("docs", ".github"):
        files.extend(p for p in (ROOT / folder).rglob("*") if p.suffix in (".md", ".html"))
    for source in files:
        text = source.read_text(encoding="utf-8-sig")
        # Fenced examples are not rendered as links by GitHub.
        text = re.sub(r"```[^\n]*\n[\s\S]*?```", "", text)
        links = re.findall(r"!?\[[^\]\n]*\]\(([^\s)]+)\)", text)
        links += re.findall(r'(?:href|src)=["\']([^"\']+)', text)
        for link in links:
            parsed = urlsplit(html.unescape(link.strip("<>")))
            if parsed.scheme or parsed.netloc:
                continue
            target = (source.parent / unquote(parsed.path)).resolve() if parsed.path else source
            checked += 1
            if not target.exists():
                errors.append(f"{source.relative_to(ROOT)}: missing {link}")
            elif parsed.fragment and target.suffix in (".md", ".html"):
                fragments += 1
                if unquote(parsed.fragment) not in anchors(target):
                    errors.append(f"{source.relative_to(ROOT)}: missing anchor {link}")
    for error in errors:
        print(error)
    print(f"Checked {checked} local links and {fragments} anchors; {len(errors)} errors.")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
