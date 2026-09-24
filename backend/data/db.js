// A tiny "database": everything lives in one JSON file (data/db.json).
// It is perfect for learning. For a real school, move to MongoDB or PostgreSQL later.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'db.json');

function read() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Gives the next free id for a list, e.g. [{id:1},{id:2}] -> 3
function nextId(list) {
  return list.length ? Math.max(...list.map((item) => item.id)) + 1 : 1;
}

module.exports = { FILE, read, write, nextId };
