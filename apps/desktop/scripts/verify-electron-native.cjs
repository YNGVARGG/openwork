// Run with Electron's Node runtime: importing from host Node does not prove ABI compatibility.
const Database = require("better-sqlite3");
const pty = require("node-pty");
const database = new Database(":memory:");
try {
  if (database.prepare("SELECT 1 AS ready").get().ready !== 1) {
    throw new Error("SQLite did not return the expected probe result");
  }
  if (typeof pty.spawn !== "function") throw new Error("Terminal module is unavailable");
  console.log("cvc-native-ready");
} finally {
  database.close();
}
