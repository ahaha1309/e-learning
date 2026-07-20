const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else if (file.endsWith('.pug')) {
      results.push(file);
    }
  });
  return results;
}

const files = walkDir(path.join(__dirname, '../views'));
let updatedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let lines = content.split('\n');
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^[ \t]*form.*method=['"]POST['"]/i)) {
      // check if next line already has csrf
      if (!lines[i+1] || !lines[i+1].includes('_csrf')) {
        const spaces = line.match(/^[ \t]*/)[0];
        lines.splice(i + 1, 0, spaces + '  input(type="hidden", name="_csrf", value=csrfToken)');
        modified = true;
        i++;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(file, lines.join('\n'));
    updatedCount++;
  }
});

console.log(`Updated ${updatedCount} pug files with CSRF tokens.`);
