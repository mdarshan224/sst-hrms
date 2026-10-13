import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readdirSync,readFileSync} from "node:fs";
test("Milestone07-to08 additive upgrade preserves legacy employee records and foreign keys",()=>{
 const sql=new DatabaseSync(":memory:");sql.exec("PRAGMA foreign_keys=ON");
 const files=readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort();
 for(const f of files.filter(f=>Number(f.slice(0,4))<=9))sql.exec(readFileSync(new URL("../drizzle/"+f,import.meta.url),"utf8"));
 sql.exec("INSERT INTO users(id,mobile,display_name,created_at) VALUES('u','9000000011','Synthetic','2026-01-01'); INSERT INTO tenants(id,name,slug,stages,created_at) VALUES('t','Synthetic','synthetic','[]','2026-01-01');INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,joining_date,created_at) VALUES('e','t','EMP-1','Synthetic','employee@example.test','Engineer','2026-01-01','2026-01-01')");
 const before=JSON.stringify(sql.prepare("SELECT * FROM employees").all());
 for(const f of files.filter(f=>Number(f.slice(0,4))>9)){
  const migration=readFileSync(new URL("../drizzle/"+f,import.meta.url),"utf8");
  assert(!/\bDROP TABLE\b|\bDELETE FROM\b/i.test(migration));
  sql.exec(migration);
 }
 assert.equal(JSON.stringify(sql.prepare("SELECT * FROM employees").all()),before);
 assert.equal(sql.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 assert.equal(sql.prepare("PRAGMA foreign_key_check").all().length,0);
 assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n,48);
 sql.close();
});
test("new trigger SQL preserves the native single-line deployment convention",()=>{
 const text=readFileSync(new URL("../drizzle/0010_clammy_stephen_strange.sql",import.meta.url),"utf8");
 for(const line of text.split("\n").filter(line=>line.startsWith("CREATE TRIGGER")))assert(line.endsWith("END;"));
 assert.equal(text.split("\n").filter(line=>line.startsWith("CREATE TRIGGER")).length,13);
});
