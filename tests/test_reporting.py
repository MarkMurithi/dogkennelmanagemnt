import pathlib
import unittest


class ReportingTests(unittest.TestCase):
    def test_finance_reporting_ui_and_export_hooks_exist(self):
        root = pathlib.Path(__file__).resolve().parent.parent
        components_source = (root / "js" / "components.js").read_text(encoding="utf-8")
        data_source = (root / "js" / "data.js").read_text(encoding="utf-8")
        app_source = (root / "js" / "app.js").read_text(encoding="utf-8")

        self.assertIn("exportPrintableReport", data_source)
        self.assertIn("printFinanceReport", app_source)
        self.assertIn("Monthly summaries", components_source)
        self.assertIn("Export CSV", components_source)
        self.assertIn("Print report", components_source)


if __name__ == "__main__":
    unittest.main()
