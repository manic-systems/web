import json
import os
import re
import tomllib
from itertools import count
from pathlib import Path
from urllib.request import Request, urlopen

PROJECTS = Path(__file__).resolve().parents[1] / "src/content/projects"
API = "https://api.github.com/orgs/manic-systems/repos"
INFRASTRUCTURE = {"web", "workflows"}


def fetch_repositories():
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token := os.environ.get("GH_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"

    for number in count(1):
        url = f"{API}?type=public&per_page=100&page={number}"
        with urlopen(Request(url, headers=headers), timeout=30) as response:
            page = json.load(response)
            has_next = 'rel="next"' in response.headers.get("Link", "")
        if not isinstance(page, list) or (not page and has_next):
            raise ValueError(f"Unexpected GitHub repositories response on page {number}")
        yield from page
        if not has_next:
            return


def project_entries(repositories, existing):
    entries = {}
    for repository in repositories:
        name = repository["name"]
        if (
            repository["private"]
            or repository["fork"]
            or repository["disabled"]
            or name.startswith(".")
            or name in INFRASTRUCTURE
        ):
            continue
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or name in entries:
            raise ValueError(f"Invalid or duplicate repository name: {name!r}")

        # These fields are curated in the checked-in entries, not by GitHub.
        previous = existing.get(name, {})
        entry = {"area": previous.get("area", "other")}
        if description := (repository["description"] or "").strip():
            entry["description"] = description
        for field in ("order", "note"):
            if field in previous:
                entry[field] = previous[field]
        if repository["archived"]:
            entry["archived"] = True
        entries[name] = entry

    if not entries:
        raise ValueError("No public projects returned; refusing to clear the index")
    return entries


def toml_value(value):
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False).replace("\x7f", r"\u007f")
    return json.dumps(value)


def sync_projects(directory, repositories):
    previous = {
        path.stem: path.read_text(encoding="utf-8") for path in directory.glob("*.toml")
    }
    existing = {name: tomllib.loads(text) for name, text in previous.items()}
    entries = project_entries(repositories, existing)

    directory.mkdir(parents=True, exist_ok=True)
    for name, fields in sorted(entries.items()):
        text = "".join(f"{key} = {toml_value(value)}\n" for key, value in fields.items())
        if text != previous.get(name):
            (directory / f"{name}.toml").write_text(text, encoding="utf-8")
    for name in previous:
        if name not in entries:
            (directory / f"{name}.toml").unlink()

    return len(entries)


if __name__ == "__main__":
    project_count = sync_projects(PROJECTS, fetch_repositories())
    print(f"Synced {project_count} public projects from GitHub.")
