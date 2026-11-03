import { createApp } from "./app.js";

const app = await createApp();
await app.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
);
