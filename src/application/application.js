import { InitDatabase } from "./database.js";

import { initBackend } from 'absurd-sql/dist/indexeddb-main-thread.js';
import querier from "../lib/queryWorker.js";





async function PersistentStoreStartup(options) {
    let webworker = new Worker(new URL('./application.worker.js', import.meta.url));
    initBackend(webworker);

    window.db = await InitDatabase();

    let quer = querier(webworker, window.db);

    if(options.polling) {
        setInterval(() => {
            window.db.sync();
        }, 10000);
    }


    return quer;
}


async function main() {

    window.quer = await PersistentStoreStartup({polling: true});

    return;
}
main();
