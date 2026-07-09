require('dotenv').config();
const { app } = require('./app');
const { prisma } = require('./lib/prisma');

const port = Number(process.env.PORT || 4000);

async function start() {
  try {
    await prisma.$connect();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Quadre backend escuchando en puerto ${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo iniciar el backend:', error);
    process.exit(1);
  }
}

start();