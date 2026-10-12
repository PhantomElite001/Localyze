better-sqlite3=require("better-sqlite3");
 const db= new Database("leads.db")

 db.exec(`CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, number TEXT, city TEXT, type TEXT, outreach TEXT)`);