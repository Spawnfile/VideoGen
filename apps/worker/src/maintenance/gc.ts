// Plan M7 Y10: the GC core lives in @videogen/db, because the API runs the confirmed delete itself (it answers with the result or a
// Turkish 409); the worker makes the weekly report through the same functions.
export { deleteBlob, gcDelete, GcRefused, gcReport, referencedShas, REFERENCE_COLUMNS, unwiredShaColumns, withBlobLock } from '@videogen/db';
export type { DeleteOutcome, GcDeleteResult, GcReport } from '@videogen/db';
