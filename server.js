import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
// let { Timestamp } = require('./server_lib/timestamp');
// let merkle = require('./server_lib/merkle');
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import crdtDriver from './src/crdtDriver.js';

let db;
let crdt; 
async function main() {

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
      locateFile: file => file
    });

    try {
      var data = fs.readFileSync('./db.db');
      db = new SQL.Database(data);
    } catch(e) {
        db = new SQL.Database();    
    }
    
    // Create a database
    crdt = await crdtDriver(db, {messagesOnly:true, debug:true, serverMode: true});

    console.log("SQL is ready");

}

main();



let app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));




app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
app.use(express.static(path.resolve('./')));

app.post('/sync', async (req, res) => {
  let back = await crdt.deliverMessages(req.body);

  let data = crdt.debug.db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync("./db.db", buffer);


  res.send(
    JSON.stringify({
      status: 'ok',
      data: back
    })
  );
});

app.get('/ping', (req, res) => {
  res.send('ok');
});


app.listen(8006);