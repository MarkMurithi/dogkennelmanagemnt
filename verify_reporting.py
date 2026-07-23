from pathlib import Path

root = Path(__file__).resolve().parent
components_source = (root / 'js' / 'components.js').read_text(encoding='utf-8')
data_source = (root / 'js' / 'data.js').read_text(encoding='utf-8')
app_source = (root / 'js' / 'app.js').read_text(encoding='utf-8')

assert 'exportPrintableReport' in data_source, 'printable report export missing'
assert 'printFinanceReport' in app_source, 'print finance handler missing'
assert 'Monthly summaries' in components_source, 'monthly summaries section missing'
assert 'Export CSV' in components_source, 'export CSV action missing'
assert 'Print report' in components_source, 'print report action missing'
print('reporting verification passed')
