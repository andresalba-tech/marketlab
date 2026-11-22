import { createApp } from "./app.js";

const app = createApp();

app.listen(3000, () => {
  console.log("Servidor disponible en http://localhost:3000");
});