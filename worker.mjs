import { handleRequest } from "./app.mjs";

export default {
  async fetch(request, env) {
    return handleRequest(request, env, {
      serveStatic: () => env.ASSETS.fetch(request),
    });
  },
};
