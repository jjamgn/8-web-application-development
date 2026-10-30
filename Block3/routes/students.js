const express = require('express');
const { createStudentController } = require('../controllers/studentController');

function studentRoutes(store) {
  const router = express.Router();
  const controller = createStudentController(store);
  router.get('/', controller.index);
  router.get('/new', controller.newForm);
  router.post('/', controller.create);
  return router;
}

module.exports = { studentRoutes };
