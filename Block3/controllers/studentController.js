const { ValidationError } = require('../services/studentService');

function createStudentController(store) {
  return {
    async index(req, res) {
      const allStudents = await store.list();
      const selectedClass = typeof req.query.className === 'string'
        ? req.query.className.trim().toUpperCase() : '';
      const classes = [...new Set(allStudents.map(student => student.className.trim().toUpperCase()))]
        .sort((a, b) => a.localeCompare(b, 'vi'));
      const students = selectedClass
        ? allStudents.filter(student => student.className.trim().toUpperCase() === selectedClass)
        : allStudents;
      res.render('students/index', {
        title: 'Danh sách sinh viên',
        activePage: 'students',
        students,
        classes,
        selectedClass,
        totalStudents: allStudents.length,
        added: req.query.added === '1'
      });
    },
    newForm(req, res) {
      res.render('students/new', {
        title: 'Thêm sinh viên', activePage: 'new', values: {}, errors: {}
      });
    },
    async create(req, res) {
      try {
        await store.add(req.body);
        res.redirect(303, '/students?added=1');
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        res.status(422).render('students/new', {
          title: 'Thêm sinh viên', activePage: 'new',
          values: error.values, errors: error.errors
        });
      }
    }
  };
}

module.exports = { createStudentController };
