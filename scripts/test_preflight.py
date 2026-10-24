"""OP55_SCRIPTS와 설치 위치 탐색 회귀 검사. 외부 명령·API는 실행하지 않는다."""
import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import preflight


class FindOp55Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix="showreel-preflight-")).resolve()

    @classmethod
    def tearDownClass(cls):
        print(f"검사 폴더 보존: {cls.root}")

    def setUp(self):
        self.base = self.root / self._testMethodName
        self.cwd = self.base / "project" / "nested"
        self.home = self.base / "home"
        self.here = self.base / "installed" / "showreel" / "scripts"
        self.cwd.mkdir(parents=True)
        self.stderr = io.StringIO()
        for ctx in (patch.dict(os.environ, {}, clear=True),
                    patch.object(preflight, "HERE", self.here),
                    patch.object(Path, "cwd", return_value=self.cwd),
                    patch.object(Path, "home", return_value=self.home),
                    contextlib.redirect_stderr(self.stderr)):
            ctx.__enter__()
            self.addCleanup(ctx.__exit__, None, None, None)

    def install(self, root, name="resolve-op55-tools"):
        scripts = root / name / "scripts"
        scripts.mkdir(parents=True)
        for filename in ("render.mjs", "setup.mjs", "verify.py"):
            (scripts / filename).touch()
        return scripts

    def test_search_locations(self):
        roots = [self.here.parent.parent]
        roots += [d / harness / "skills" for d in (self.cwd, self.cwd.parent)
                  for harness in (".claude", ".agents")]
        roots += [self.home / harness / "skills" for harness in (".claude", ".agents")]
        for root in roots:
            with self.subTest(root=root):
                scripts = self.install(root)
                self.assertEqual(preflight.find_op55(), scripts)
                scripts.rename(scripts.with_name("disabled"))

    def test_sibling_precedes_ancestor(self):
        sibling = self.install(self.here.parent.parent)
        self.install(self.cwd.parent / ".claude" / "skills")
        self.assertEqual(preflight.find_op55(), sibling)

    def test_explicit_path_with_spaces(self):
        self.install(self.here.parent.parent)
        explicit = self.install(self.base / "chosen tools")
        os.environ["OP55_SCRIPTS"] = str(explicit)
        self.assertEqual(preflight.find_op55(), explicit)

    def test_invalid_override_does_not_fall_back(self):
        self.install(self.here.parent.parent)
        os.environ["OP55_SCRIPTS"] = str(self.base / "missing")
        self.assertIsNone(preflight.find_op55())
        self.assertIn("OP55_SCRIPTS 경로를 사용할 수 없음", self.stderr.getvalue())

    def test_incomplete_install_is_not_selected(self):
        scripts = self.install(self.here.parent.parent)
        (scripts / "verify.py").unlink()
        self.assertIsNone(preflight.find_op55())

    def test_legacy_only_is_rejected(self):
        self.install(self.here.parent.parent, "op55")
        self.assertIsNone(preflight.find_op55())
        self.assertIn("npx skills@1.7.4 add ynginkim/op55", self.stderr.getvalue())
        self.assertIn("npx skills@1.7.4 remove op55", self.stderr.getvalue())

    def test_new_install_wins_over_legacy(self):
        self.install(self.here.parent.parent, "op55")
        new = self.install(self.home / ".agents" / "skills")
        self.assertEqual(preflight.find_op55(), new)
        self.assertIn("이전 구조는 사용하지 않음", self.stderr.getvalue())

    def test_explicit_legacy_and_symlink_are_rejected(self):
        old = self.install(self.here.parent.parent, "op55")
        alias = self.base / "alias"
        alias.symlink_to(old, target_is_directory=True)
        for scripts in (old, alias):
            with self.subTest(scripts=scripts):
                os.environ["OP55_SCRIPTS"] = str(scripts)
                self.assertIsNone(preflight.find_op55())

    def test_new_name_linked_to_legacy_is_rejected(self):
        old = self.install(self.here.parent.parent, "op55")
        alias = self.here.parent.parent / "resolve-op55-tools"
        alias.symlink_to(old.parent, target_is_directory=True)
        self.assertIsNone(preflight.find_op55())
        self.assertIn("npx skills@1.7.4 remove op55", self.stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
