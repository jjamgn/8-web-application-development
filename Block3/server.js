const { createApp } = require('./app');

async function start() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const { app, store } = createApp();
  await store.initialize();
  const server = app.listen(port, () => {
    console.log(`Ứng dụng sinh viên: http://localhost:${port}/students`);
  });
  server.on('error', error => {
    console.error('Không thể khởi động server:', error.message);
    process.exitCode = 1;
  });
}

start().catch(error => {
  console.error('Không thể khởi động ứng dụng:', error.message);
  process.exitCode = 1;
});
