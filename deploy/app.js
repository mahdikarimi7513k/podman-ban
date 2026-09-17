// cPanel / Passenger entry shim.
// If your host insists on `app.js` as the startup file, point it here.
// Otherwise you can set the startup file directly to:
//   server/dist-server/server.cjs
require("./server/dist-server/server.cjs");
