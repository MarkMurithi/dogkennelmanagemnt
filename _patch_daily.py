import re

with open('js/components.js', 'r', encoding='utf-8') as f:
    content = f.read()

needle = '</div></div></div><div class="card section-card"><div class="card-header"><h3><i class="fas fa-edit"></i> New report</h3>'
if needle not in content:
    print('ERROR: needle not found')
    exit(1)

idx = content.index(needle)

prev_reports = "\n            '<div class=\"card section-card full-width\"><div class=\"card-header\"><h3><i class=\"fas fa-history\"></i>"
if prev_reports not in content:
    print('ERROR: previous reports marker not found')
    exit(1)

prev_idx = content.index(prev_reports, idx)

# Extract the form card html (from needle start to just before prev_reports)
form_card = content[idx + len('</div></div></div>'):prev_idx]

locked_panel = '<div class="card section-card"><div class="card-body" style="text-align:center;padding:24px;color:var(--gray-400)"><i class="fas fa-lock" style="font-size:1.5rem;margin-bottom:8px;display:block"></i><p>Reviewers cannot submit daily reports.</p></div></div>'

replacement = (
    '</div></div></div>' + "' +\n"
    + "            (KennelData.getCurrentUserRole() === 'reviewer'\n"
    + "                ? '" + locked_panel.replace("'", "\\'") + "'\n"
    + "                : '" + form_card.strip().lstrip("' +\n            '").replace("'", "\\'") + "') +"
)

new_content = content[:idx] + replacement + content[prev_idx:]

with open('js/components.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')
