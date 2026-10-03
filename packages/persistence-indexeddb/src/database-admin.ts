export function deleteIndexedDbDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<void> {
  if (databaseName.trim().length === 0) {
    return Promise.reject(
      new TypeError('The database name must not be empty.'),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener(
      'error',
      () =>
        reject(request.error ?? new Error(`Could not delete ${databaseName}.`)),
      { once: true },
    );
    request.addEventListener(
      'blocked',
      () =>
        reject(
          new Error(
            `Could not delete ${databaseName} because another tab is using it.`,
          ),
        ),
      { once: true },
    );
  });
}
