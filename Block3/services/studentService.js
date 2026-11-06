const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class ValidationError extends Error {
  constructor(errors, values) {
    super('Thông tin sinh viên chưa hợp lệ.');
    this.name = 'ValidationError';
    this.errors = errors;
    this.values = values;
  }
}

function validateStudent(input) {
  const values = {};
  for (const field of ['studentCode', 'name', 'email', 'className']) {
    values[field] = typeof input?.[field] === 'string' ? input[field].trim() : '';
  }
  values.studentCode = values.studentCode.toUpperCase();
  values.email = values.email.toLowerCase();

  const errors = {};
  if (!/^[A-Z0-9_-]{2,30}$/.test(values.studentCode)) {
    errors.studentCode = 'Nhập mã từ 2–30 ký tự: chữ không dấu, số, dấu gạch ngang hoặc gạch dưới.';
  }
  if (!values.name || values.name.length > 100) {
    errors.name = 'Nhập họ tên từ 1–100 ký tự.';
  }
  if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Nhập địa chỉ email hợp lệ, tối đa 254 ký tự.';
  }
  if (!values.className || values.className.length > 50) {
    errors.className = 'Nhập tên lớp từ 1–50 ký tự.';
  }
  return { values, errors };
}

function createStudentStore(filePath) {
  let queue = Promise.resolve();

  function enqueue(task) {
    const operation = queue.then(task);
    // A failed operation must not stop later requests from using the queue.
    queue = operation.catch(() => {});
    return operation;
  }

  async function readStudents() {
    const students = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!Array.isArray(students)) throw new Error('Dữ liệu sinh viên phải là một mảng JSON.');
    const ids = new Set();
    const codes = new Set();
    const emails = new Set();
    for (const student of students) {
      const { values, errors } = validateStudent(student);
      if (!student || typeof student.id !== 'string' || !student.id.trim()
        || Object.keys(errors).length || ids.has(student.id)
        || codes.has(values.studentCode) || emails.has(values.email)) {
        throw new Error('File JSON chứa sinh viên không hợp lệ hoặc thông tin bị trùng.');
      }
      ids.add(student.id);
      codes.add(values.studentCode);
      emails.add(values.email);
    }
    return students;
  }

  async function writeStudents(students) {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(students, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      // Replace only after the complete JSON has been written, in the same directory.
      await fs.rename(temporaryPath, filePath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  return {
    initialize() {
      return enqueue(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        try {
          await readStudents();
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await writeStudents([]);
        }
      });
    },
    list() {
      return enqueue(readStudents);
    },
    add(input) {
      return enqueue(async () => {
        const { values, errors } = validateStudent(input);
        if (Object.keys(errors).length) throw new ValidationError(errors, values);
        const students = await readStudents();
        if (students.some(student => student.studentCode.trim().toUpperCase() === values.studentCode)) {
          errors.studentCode = 'Mã sinh viên này đã tồn tại.';
        }
        if (students.some(student => student.email.trim().toLowerCase() === values.email)) {
          errors.email = 'Email này đã được sử dụng.';
        }
        if (Object.keys(errors).length) throw new ValidationError(errors, values);
        const student = { id: randomUUID(), ...values };
        students.push(student);
        await writeStudents(students);
        return student;
      });
    }
  };
}

module.exports = { createStudentStore, ValidationError };
