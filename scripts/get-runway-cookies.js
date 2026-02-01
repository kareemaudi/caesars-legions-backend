const Database = require('better-sqlite3');
const db = new Database('./chrome-cookies.db', { readonly: true });

try {
  const rows = db.prepare(`
    SELECT host_key, name, value 
    FROM cookies 
    WHERE host_key LIKE '%runway%' 
    LIMIT 20
  `).all();
  
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('Error:', e.message);
} finally {
  db.close();
}
