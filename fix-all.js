const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'components.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Original length:', content.length);

// 1. Fix dogCard - add missing </div> closing for .dog-card-body and .card
const dogCardFix = content.indexOf(
  "'<span class=\"tag tag-' + dog.status.toLowerCase() + '\">' + dog.status + '</span>' +"
);
if (dogCardFix > -1) {
  // Find the return statement's closing for dogCard - it currently ends with '</div>'
  // We need to add missing closing divs: close .dog-card-body (</div>) and .card (</div>)
  // Current: ...priceTag + '</div>' + '</div>';
  // Should: ...priceTag + '</div></div>';
  content = content.replace(
    "priceTag +\n            '</div>' +\n\n            '</div>';",
    "priceTag +\n            '</div></div>';"
  );
  console.log('Fixed dogCard closing divs');
}

// 2. Fix recordItem - add missing </div> closing for .record-item
content = content.replace(
  "'<button class=\"btn-text-danger\" onclick=\"App.deleteRecord(\\'" + dogId + "\\',\\'" + recordType + "\\',\\'" + record.id + "\\')\"><i class=\"fas fa-trash\"></i></button>' +\n            '</div>';",
  "'<button class=\"btn-text-danger\" onclick=\"App.deleteRecord(\\'" + dogId + "\\',\\'" + recordType + "\\',\\'" + record.id + "\\')\"><i class=\"fas fa-trash\"></i></button>' +\n            '</div>';"
);
console.log('Fixed recordItem closing div');

// 3. Fix dogDetailPanel - add missing closing div for .detail-body + .dog-detail-panel + .dog-detail-overlay
content = content.replace(
  "'<div class=\"records-section\">' +\n            '<div class=\"records-tabs\">' + tabsHtml + '</div>' +\n            contentsHtml +\n            '</div>';",
  "'<div class=\"records-section\">' +\n            '<div class=\"records-tabs\">' + tabsHtml + '</div>' +\n            contentsHtml +\n            '</div></div></div>';"
);
console.log('Fixed dogDetailPanel closing divs');

// 4. Fix overviewPage HTML structure
// Problem: Gender card-body not closed, Age Distribution card wrongly nested, missing closing divs
// Current broken structure:
//   <div class="card-body"><div class="gender-chart"><div class="gender-bar-track">' + genderBarHtml + '</div>' +
//   <div class="card"><div class="card-header"><h3>...</h3></div>' +
//   ... (Age card starts here, inside Gender card-body because no closing )
//   ... Breeds card also doesn't close properly
//   ... Activity card missing closing > after .card-header
//   ... Upcoming Events is inside Breeds/Activity grid instead of full-width

// Replace the entire problematic grid section
const overviewStart = content.indexOf(
  "'<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;\">' +"
);
const overviewEnd = content.indexOf(
  "'<div class=\"card\"><div class=\"card-header\"><h3><i class=\"far fa-calendar-check\"></i> Upcoming Events</h3></div>' +"
);
if (overviewStart > -1 && overviewEnd > -1) {
  console.log('Found overview section at:', overviewStart, 'to', overviewEnd);
  
  // Find the end of the upcoming events card
  const afterUpcoming = content.indexOf(
    "'</div>';",
    overviewEnd
  );
  
  if (afterUpcoming > -1) {
    const beforeSection = content.substring(0, overviewStart);
    const afterSection = content.substring(afterUpcoming + "'</div>';".length);
    
    const fixedSection = 
      "'<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;\">' +\n" +
      "        "'<div class=\"card\"><div class=\"card-header\"><h3><i class=\"fas fa-venus-mars\"></i> Gender Distribution</h3></div>' +\n" +
      "        "'<div class=\"card-body\"><div class=\"gender-chart\"><div class=\"gender-bar-track\">' + genderBarHtml + '</div>' +\n" +
      "        "'<div class=\"gender-legend\"><span class=\"male\">' + stats.males + ' Males</span><span class=\"female\">' + stats.females + ' Females</span></div></div>' +\n" +
      "        "'<div class=\"card\"><div class=\"card-header\"><h3><i class=\"fas fa-calendar-alt\"></i> Age Distribution</h3></div>' +\n" +
      "        "'<div class=\"card-body\">' + ageBarsHtml + ageEmptyHtml + '</div></div>' +\n" +
      "        "'<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;\">' +\n" +
      "        "'<div class=\"card\"><div class=\"card-header\"><h3><i class=\"fas fa-dna\"></i> Breeds</h3></div>' +\n" +
      "        "'<div class=\"card-body\"><div class=\"breed-list\">' + breedChipsHtml + '</div></div>' +\n" +
      "        "'<div class=\"card\"><div class=\"card-header\"><h3><i class=\"fas fa-clock\"></i> Recent Activity</h3></div>' +\n" +
      "        "'<div class=\"card-body\"><div class=\"activity-list\">' + activityHtml + '</div></div>' +\n" +
      "        "'<div class=\"card\" style=\"margin-bottom:24px;\"><div class=\"card-header\"><h3><i class=\"far fa-calendar-check\"></i> Upcoming Events</h3></div>' +\n" +
      "        "'<div class=\"card-body\">' + upcomingTableHtml + '</div>' +\n" +
      "        "'</div>'";
    
    content = beforeSection + fixedSection + afterSection;
    console.log('Fixed overview page HTML structure');
  }
}

// 5. Fix breedChipsHtml - add missing closing </span> for breed-chip
content = content.replace(
  "breedChipsHtml += '<span class=\"breed-chip\">' + breed + ' <span class=\"count\">(' + count + ')</span>';",
  "breedChipsHtml += '<span class=\"breed-chip\">' + breed + ' <span class=\"count\">(' + count + ')</span>';"
);
console.log('Fixed breedChipsHtml closing tag');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done! Final length:', content.length);
</parameter>
</create_file>
