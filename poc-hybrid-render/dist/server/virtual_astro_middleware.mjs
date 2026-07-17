globalThis.process ??= {};
globalThis.process.env ??= {};
//#region \0noop-middleware
var onRequest = (_, next) => next();
//#endregion
export { onRequest };
