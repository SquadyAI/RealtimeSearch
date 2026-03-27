import { createServer } from './server';
import { config } from './config';

async function main() {
  const app = await createServer();
  await app.listen({ port: config.port, host: config.host });
   
  console.log(`Server listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
   
  console.error(err);
  process.exit(1);
});


