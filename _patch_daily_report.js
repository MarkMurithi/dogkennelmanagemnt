const fs = require('fs');
let c = fs.readFileSync('js/components.js', 'utf8');

const snapshotEnd = '</div></div></div>';
const formStart = '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-edit"></i> New report</h3>';

const oldLine = snapshotEnd + formStart;
const idx = c.indexOf(oldLine);
if (idx === -1) { console.error('Pattern not found'); process.exit(1); }

const prevReportsMarker = '\n            \'<div class="card section-card full-width"><div class="card-header"><h3><i class="fas fa-history"></i>';
const prevIdx = c.indexOf(prevReportsMarker, idx);
if (prevIdx === -1) { console.error('Previous reports marker not found'); process.exit(1); }

// The form card content (everything from formStart to just before prevReportsMarker)
const formCardContent = c.substring(idx + snapshotEnd.length, prevIdx);

const lockedPanel = '<div class="card section-card"><div class="card-body" style="text-align:center;padding:24px;color:var(--gray-400)"><i class="fas fa-lock" style="font-size:1.5rem;margin-bottom:8px;display:block"></i><p>Reviewers cannot submit daily reports.</p></div></div>';

const replacement =
  snapshotEnd +
  '\' +\n' +
  '            (KennelData.getCurrentUserRole() === \'reviewer\'\n' +
  '                ? \'' + lockedPanel.replace(/'/g, "\\'") + '\'\n' +
  '                : \'' + formCardContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim().replace(/^' \+\n\s+'/g, '') + '\') +';

c = c.substring(0, idx) + replacement + c.substring(prevIdx);

fs.writeFileSync('js/components.js', c);
console.log('Done. Lines around change:');
const lines = c.split('\n');
const changeLine = c.substring(0, idx).split('\n').length;
console.log('Line', changeLine, ':', lines[changeLine - 1].substring(0, 120));
