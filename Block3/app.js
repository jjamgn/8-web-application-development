const express = require('express');
const path = require('node:path');
const { createStudentStore } = require('./services/studentService');
const { studentRoutes } = require('./routes/students');

function createApp({ dataFile = path.join(__dirname, 'data', 'students.json'), logger = console } = {}) {
  const app = express();
  const store = createStudentStore(dataFile);
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.get('/', (req, res) => res.redirect('/students'));
  app.use('/students', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, studentRoutes(store));
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Không tìm thấy trang', activePage: '', status: 404,
      message: 'Trang bạn đang tìm không tồn tại. Hãy quay về danh sách sinh viên.'
    });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    logger.error(error);
    const status = error.type === 'entity.too.large' ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).render('error', {
      title: 'Không thể xử lý yêu cầu', activePage: '', status,
      message: status === 413 ? 'Dữ liệu gửi lên quá lớn. Vui lòng rút gọn nội dung.'
        : status === 400 ? 'Dữ liệu gửi lên không hợp lệ.'
          : 'Không thể đọc hoặc lưu dữ liệu lúc này. Vui lòng thử lại sau.'
    });
  });
  return { app, store };
}

module.exports = { createApp };
