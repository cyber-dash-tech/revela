from __future__ import annotations

import json
import pathlib
import shutil
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

CONFIG_DIR = pathlib.Path.home() / ".config" / "slides-it"
INDUSTRIES_DIR = CONFIG_DIR / "industries"
CONFIG_FILE = CONFIG_DIR / "config.json"

# Built-in industries shipped with the package — used only as seed source.
# At runtime all industries live in INDUSTRIES_DIR (~/.config/slides-it/industries/).
_SEED_DIR = pathlib.Path(__file__).parent / "industries"

DEFAULT_INDUSTRY = "general"


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class IndustryInfo:
    name: str
    description: str
    author: str
    version: str
    skill_text: str = field(default="")


# ---------------------------------------------------------------------------
# IndustryManager
# ---------------------------------------------------------------------------

class IndustryManager:
    """Manage slides-it industries stored in ~/.config/slides-it/industries/."""

    def __init__(self) -> None:
        INDUSTRIES_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        self._seed_builtin_industries()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list(self) -> list[IndustryInfo]:
        """Return all installed industries sorted by name."""
        results: list[IndustryInfo] = []
        if not INDUSTRIES_DIR.exists():
            return results
        for path in sorted(INDUSTRIES_DIR.iterdir()):
            if path.is_dir() and (path / "INDUSTRY.md").exists():
                info = self._parse_industry_file(path / "INDUSTRY.md")
                if info:
                    results.append(info)
        return results

    def install(self, source: str, name: str | None = None) -> str:
        """
        Install an industry from any source.

        Args:
            source: Registry name, https:// URL (zip), github:user/repo, or local path.
            name: Override the industry name. Defaults to name from INDUSTRY.md.

        Returns:
            Installed industry name.
        """
        if source.startswith("https://") or source.startswith("http://"):
            return self._install_from_url(source, name)
        if source.startswith("github:"):
            repo = source[len("github:"):]
            url = f"https://github.com/{repo}/archive/refs/heads/main.zip"
            return self._install_from_url(url, name)
        if source.startswith("./") or source.startswith("/") or pathlib.Path(source).exists():
            return self._install_from_path(pathlib.Path(source), name)
        # Fall back to registry lookup (future: industry registry)
        raise ValueError(f"Industry '{source}' not found. Provide a URL, github:user/repo, or local path.")

    def remove(self, name: str) -> None:
        """
        Remove an installed industry.

        Raises:
            ValueError: If industry is not installed or is the built-in default.
        """
        if name == DEFAULT_INDUSTRY:
            raise ValueError("Cannot remove the built-in 'general' industry")
        target = INDUSTRIES_DIR / name
        if not target.exists():
            raise ValueError(f"Industry '{name}' is not installed")
        shutil.rmtree(target)
        # Reset active industry if it was the removed one
        if self.active() == name:
            self.activate(DEFAULT_INDUSTRY)

    def activate(self, name: str) -> None:
        """
        Set the active industry.

        Raises:
            ValueError: If industry is not installed.
        """
        if not self._industry_path(name):
            raise ValueError(f"Industry '{name}' is not installed")
        config = self._load_config()
        config["activeIndustry"] = name
        self._save_config(config)

    def active(self) -> str:
        """Return the name of the currently active industry."""
        cfg = self._load_config()
        return cfg.get("activeIndustry") or DEFAULT_INDUSTRY

    def get_skill_md(self, name: str | None = None) -> str:
        """
        Read and return the skill text body from INDUSTRY.md for an industry.

        Args:
            name: Industry name. Defaults to the active industry.

        Returns:
            Skill text (everything after the frontmatter block) as a string.

        Raises:
            ValueError: If industry is not installed or INDUSTRY.md is missing.
        """
        industry_name = name or self.active()
        path = self._industry_path(industry_name)
        if not path:
            raise ValueError(f"Industry '{industry_name}' is not installed")
        industry_file = path / "INDUSTRY.md"
        if not industry_file.exists():
            raise ValueError(f"Industry '{industry_name}' has no INDUSTRY.md")
        info = self._parse_industry_file(industry_file)
        if not info:
            raise ValueError(f"Industry '{industry_name}' has no INDUSTRY.md")
        return info.skill_text

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _seed_builtin_industries(self) -> None:
        """
        Copy built-in industries from the package seed directory to INDUSTRIES_DIR.

        Always overwrites to ensure bundled industries stay up to date with
        the installed package version. User-created industries (not present in
        the seed directory) are never touched.
        """
        if not _SEED_DIR.exists():
            return
        for src in sorted(_SEED_DIR.iterdir()):
            if not src.is_dir() or not (src / "INDUSTRY.md").exists():
                continue
            dst = INDUSTRIES_DIR / src.name
            dst.mkdir(exist_ok=True)
            shutil.copytree(src, dst, dirs_exist_ok=True)

    def _industry_path(self, name: str) -> pathlib.Path | None:
        """Return the directory for an industry, or None if not found."""
        path = INDUSTRIES_DIR / name
        if path.exists() and (path / "INDUSTRY.md").exists():
            return path
        return None

    def _install_from_url(self, url: str, name: str | None) -> str:
        """Download a zip from any URL and install the industry."""
        with tempfile.TemporaryDirectory() as tmp:
            zip_path = pathlib.Path(tmp) / "industry.zip"
            try:
                urllib.request.urlretrieve(url, zip_path)
            except Exception as e:
                raise RuntimeError(f"Failed to download industry from {url}") from e

            extract_dir = pathlib.Path(tmp) / "extracted"
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(extract_dir)
            except zipfile.BadZipFile as e:
                raise RuntimeError(f"Downloaded file is not a valid zip: {url}") from e

            return self._install_from_extracted(extract_dir, name)

    def _install_from_path(self, path: pathlib.Path, name: str | None) -> str:
        """Install an industry from a local directory."""
        if not path.exists():
            raise ValueError(f"Path does not exist: {path}")
        if not (path / "INDUSTRY.md").exists():
            raise ValueError(f"No INDUSTRY.md found in {path}")

        info = self._parse_industry_file(path / "INDUSTRY.md")
        industry_name = name or (info.name if info else path.name)
        target = INDUSTRIES_DIR / industry_name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(path, target)
        return industry_name

    def _install_from_extracted(self, extract_dir: pathlib.Path, name: str | None) -> str:
        """Find the industry root inside an extracted zip and install it."""
        # GitHub zips wrap contents in a subdirectory — find INDUSTRY.md
        industry_root: pathlib.Path | None = None
        for candidate in [extract_dir, *extract_dir.iterdir()]:
            if candidate.is_dir() and (candidate / "INDUSTRY.md").exists():
                industry_root = candidate
                break
        if not industry_root:
            raise RuntimeError("No INDUSTRY.md found inside the downloaded zip")
        return self._install_from_path(industry_root, name)

    @staticmethod
    def _parse_industry_file(path: pathlib.Path) -> IndustryInfo | None:
        """
        Parse INDUSTRY.md and return an IndustryInfo with both metadata and skill text.

        INDUSTRY.md format:
            ---
            name: ...
            description: ...
            author: ...
            version: ...
            ---

            <skill text body>

        The YAML frontmatter block is between the first and second '---' lines.
        Everything after the closing '---' is the skill text.
        """
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return None

        fields: dict[str, str] = {}
        skill_text = ""
        lines = text.splitlines()

        if lines and lines[0].strip() == "---":
            end_idx = None
            for i, line in enumerate(lines[1:], start=1):
                if line.strip() == "---":
                    end_idx = i
                    break
                if ":" in line:
                    key, _, value = line.partition(":")
                    fields[key.strip()] = value.strip()
            if end_idx is not None:
                # Everything after the closing --- is the skill text body
                skill_text = "\n".join(lines[end_idx + 1:]).strip()

        return IndustryInfo(
            name=fields.get("name", path.parent.name),
            description=fields.get("description", ""),
            author=fields.get("author", "unknown"),
            version=fields.get("version", "0.0.0"),
            skill_text=skill_text,
        )

    def _load_config(self) -> dict[str, str]:
        if CONFIG_FILE.exists():
            try:
                return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _save_config(self, config: dict[str, str]) -> None:
        CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
