const db = require('./backend/db');
(async () => {
    db.query('SELECT * FROM admins', [], (err, results) => {
        if (err) console.error(err);
        else console.log(results);
        process.exit(0);
    });
})();
