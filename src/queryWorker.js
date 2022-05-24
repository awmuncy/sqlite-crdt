export default function querier(worker) {

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

  async function sendQuery(message) {
    const id = Math.random();
    message.id = id;

    const openQuery = new Promise((resolve, reject) => {
      worker.postMessage(message);
      setTimeout(() => reject(), 30000);

      worker.addEventListener('message', function listener(event) {

        if (event.data?.id === id) {
          resolve(event.data.payload);
          worker.removeEventListener('message', listener);
        }
      });
    });  
    return await openQuery;    
  }

  return {
    query,
    insert,
    update,
    tombstone
  };
}