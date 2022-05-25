export default function querier(worker, db) {



  async function query(queryText) {
    const message = {
      type: "database_query",
      query: queryText
    };

    return sendQuery(message);    
  }

  async function insert(dataset, row) {
      return sendQuery({
          type: "crdt_insert",
          dataset,
          row
      });
  }
  async function update(dataset, row) {
      if(!row.id) throw Error("To update a row, you must include it's ID");
      return sendQuery({
          type: "crdt_update",
          dataset,
          row
      });
  }
  async function tombstone(dataset, row) {
      if(!row.id) throw Error("To tombstone a row, you must include it's ID");
      return sendQuery({
          type: "crdt_tombstone",
          dataset,
          row
      });
  }

  async function sync(req) {
    let responseFromSync = await sendQuery({
      type: "crdt_sync",
      req
    });
    console.log("Response", responseFromSync);

    return responseFromSync;
  }

  async function sendQuery(message) {
    const id = Math.random();
    message.id = id;

    const openQuery = new Promise((resolve, reject) => {
      worker.postMessage(message);

      setTimeout(() => reject(), 30000);

      worker.addEventListener('message', function listener(event) {
        if (event.data?.id === id) {

          resolve(event.data.payload);
          console.log("The worker resolved with", event.data.payload);
          worker.removeEventListener('message', listener);
        }
      });
    });  
    return await openQuery;    
  }

  function awaitReady() {
    worker.addEventListener('message', (event) => {
      if (event.data==="CRDT_WORKER_READY") {
        db.addPeer({
          node_id: "worker",
          incomingSync: async req => {
            return await sync(req);
          }
        });
        
        db.sync([]);
      }
    })

  }

  awaitReady();

  return {
    sync,
    query,
    insert,
    update,
    tombstone
  };
}