export default async function syncer(worker, db) {

  async function sync(req) {
    let responseFromSync = await sendQuery({
      type: "crdt_sync",
      req
    });

    return responseFromSync;
  }

  async function sendQuery(message) {
    const id = Math.random();
    message.id = id;

    const openQuery = new Promise((resolve, reject) => {
      worker.port.postMessage(message);

      setTimeout(() => reject(), 30000);

      worker.port.addEventListener('message', function listener(event) {
        if (event.data?.id === id) {

          resolve(event.data.payload);
          worker.port.removeEventListener('message', listener);
        }
      });
    });  
    return await openQuery;    
  }

  function awaitReady() {
    let ready = new Promise((resolve, reject) => {
      worker.port.addEventListener('message', async (event) => {
        if (event.data.type==="CRDT_WORKER_READY") {
          db.addPeer({
            client_id: event.data.client_id,
            node_name: "worker",
            deliverMessages: async req => {
              return await sync(req);
            }
          });
          
          resolve(await db.sync());
        }
      });
    })

    return ready;
  }

  await awaitReady();

  return sync;
}