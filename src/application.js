import { InitDatabase } from "./database.js";

import { initBackend } from 'absurd-sql/dist/indexeddb-main-thread.js';
import querier from "./queryWorker.js";





async function PersistentStoreStartup() {
    let webworker = new Worker(new URL('./application.worker.js', import.meta.url));
    initBackend(webworker);

    window.db = await InitDatabase();

    let quer = querier(webworker, window.db);


    return quer;
}


async function main() {

    window.quer = await PersistentStoreStartup();

    return;
}
main();
