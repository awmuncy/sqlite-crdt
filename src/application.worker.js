import initSqlJs from '@jlongster/sql.js';
import { SQLiteFS } from 'absurd-sql';
import IndexedDBBackend from 'absurd-sql/dist/indexeddb-backend.js';
import crdtDriver from './crdtDriver.js';


export async function PersistentStoreWorkerStartup() {
  let SQL = await initSqlJs({ locateFile: file => file });
  let sqlFS = new SQLiteFS(SQL.FS, new IndexedDBBackend());
  SQL.register_for_idb(sqlFS);

  SQL.FS.mkdir('/sql');
  SQL.FS.mount(sqlFS, {}, '/sql');

  const path = '/sql/db.sqlite';
  if (typeof SharedArrayBuffer === 'undefined') {
    let stream = SQL.FS.open(path, 'a+');
    await stream.node.contents.readIfFallback();
    SQL.FS.close(stream);
  }

  let db = new SQL.Database(path, { filename: true });

  db.exec(`
    PRAGMA journal_mode=MEMORY;
    PRAGMA page_size=8192;
  `);

  const crdt = await crdtDriver(db, {debug: true, messagesOnly: true});

  self.addEventListener('message', function(event) {

    let response;
    switch(event.data?.type) {
      case "database_query":
        response = db.exec(event.data.query);
        self.postMessage({id:event.data.id, payload: response});  
        break;
      case "crdt_insert":
        response = crdt.insert(event.data.dataset, event.data.row);
        self.postMessage({id:event.data.id, payload: response});
        break;
      case "crdt_tombstone":
        response = crdt.tombstone(event.data.dataset, event.data.row);
        self.postMessage({id:event.data.id, payload: response});
        break;
      case "crdt_update":
        response = crdt.update(event.data.dataset, event.data.row);
        self.postMessage({id:event.data.id, payload: response});
        break;
    }
      
  });
}

