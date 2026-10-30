import { app } from './app.js';
const port = Number(process.env.PORT || 3000);
app.listen(port,'127.0.0.1',()=>console.log(`Bếp Nhà: http://localhost:${port}`));
