import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);

const server = createApp().listen(port, () => {
  console.log(`Task API listening on port ${port}`);
});

export default server;
