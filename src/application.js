import { InitDatabase } from "./database.js";

import { initBackend } from 'absurd-sql/dist/indexeddb-main-thread.js';
import querier from "./queryWorker.js";





export function PersistentStoreStartup() {
    let webworker = new Worker(new URL('./application.worker.js', import.meta.url));
    initBackend(webworker);

    return querier(webworker);
}


async function main() {
    return await InitDatabase();
}