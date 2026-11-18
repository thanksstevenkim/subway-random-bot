import unittest
from importlib.machinery import SourceFileLoader
from importlib.util import spec_from_loader, module_from_spec
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_ingredients.py"
loader = SourceFileLoader("check_ingredients", str(SCRIPT))
spec = spec_from_loader(loader.name, loader)
monitor = module_from_spec(spec)
loader.exec_module(monitor)

def fixture(items):
    return "<html><body>" + "".join(
        f"<div><h3>{name}</h3><h3>12.5 kcal</h3></div>" for name in items
    ) + "</body></html>"

class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.menu = {
            "status": "partially-verified",
            "breads": ["화이트", "위트", "파마산 오레가노", "허니오트", "그레인", "플랫브레드"],
            "vegetables": ["양상추", "토마토", "오이", "피망(파프리카)", "양파", "피클", "올리브", "할라피뇨"],
            "cheeses": ["아메리칸 치즈", "슈레드 치즈", "모차렐라 치즈"],
            "sauces": ["치미추리", "랜치", "스위트 어니언", "마요네즈", "스위트 칠리", "스모크 바비큐", "핫 칠리", "허니 머스터드", "사우스웨스트 치폴레", "홀스래디쉬", "저당 크리미 어니언 소스", "저칼로리 오리엔탈", "엑스트라 버진 올리브 오일", "레드 와인 식초"],
            "extras": ["아보카도"],
        }
        self.items = self.menu["breads"] + self.menu["vegetables"] + self.menu["extras"] + self.menu["cheeses"] + self.menu["sauces"]

    def test_unchanged(self):
        new, diff = monitor.proposal(self.menu, monitor.extract_items(fixture(self.items)))
        self.assertFalse(diff)
        self.assertEqual(new, self.menu)

    def test_change_proposes_review_not_deployment(self):
        items = self.items.copy()
        items.insert(items.index("마요네즈"), "새 소스")
        items.remove("허니 머스터드")
        new, diff = monitor.proposal(self.menu, monitor.extract_items(fixture(items)))
        self.assertIn("새 소스", new["sauces"])
        self.assertNotIn("허니 머스터드", new["sauces"])
        self.assertEqual(new["status"], "partially-verified")
        self.assertIn("삭제 여부 검토", monitor.render_review(diff))

    def test_partial_page_safely_stops(self):
        with self.assertRaises(ValueError):
            monitor.extract_items("<html><h3>화이트</h3></html>")

    def test_missing_anchor_safely_stops(self):
        items = ["새 빵" if name == "화이트" else name for name in self.items]
        with self.assertRaises(ValueError):
            monitor.extract_items(fixture(items))

    def test_mass_disappearance_safely_stops(self):
        items = [name for name in self.items if name not in self.menu["sauces"][:10]]
        with self.assertRaises(ValueError):
            monitor.proposal(self.menu, monitor.extract_items(fixture(items)))

if __name__ == "__main__":
    unittest.main()
