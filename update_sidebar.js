const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the toggle with a toggle + save
  if (content.includes("sidebar.classList.toggle('collapsed');") && !content.includes("localStorage.setItem('sidebar_collapsed'")) {
    content = content.replace(
      /sidebar\.classList\.toggle\('collapsed'\);/g,
      "sidebar.classList.toggle('collapsed'); localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));"
    );
    
    // Also, inject a small script to read the state immediately to prevent flickering
    if (!content.includes("if(localStorage.getItem('sidebar_collapsed')==='true')")) {
      content = content.replace(
        /<aside class="sidebar" id="sidebar">/g,
        `<aside class="sidebar" id="sidebar">\n      <script>if(localStorage.getItem('sidebar_collapsed')==='true' && window.innerWidth > 768) document.getElementById('sidebar').classList.add('collapsed');</script>`
      );
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
