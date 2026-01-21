const fs = require('fs');
const path = require('path');
const db = require('./src/config/database');

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', 'create_school_settings.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon to run multiple statements if needed
        // But for this simple case, we can try running it directly or split it.
        // db.query supports multiple statements if configured, but let's be safe and split manually or just run the create then insert.
        // Actually, db.query in mysql2 usually handles single statement unless multipleStatements is true.
        // My config doesn't have multipleStatements: true.

        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(`Found ${statements.length} SQL statements to run...`);

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            await db.query(statement);
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
