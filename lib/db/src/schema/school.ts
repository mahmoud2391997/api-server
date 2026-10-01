import { createInsertSchema } from "drizzle-zod";
import { boolean, date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const schoolsTable = pgTable("schools", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  nameArabic: text("name_arabic").notNull(),
  code: text("code").notNull().unique(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  principalName: text("principal_name").notNull().default(""),
  establishedDate: date("established_date", { mode: "string" }),
  apiKey: text("api_key").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const academicYearsTable = pgTable("academic_years", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  isCurrent: text("is_current").notNull().default("false"),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
}, (table) => ({ schoolLabelUnique: uniqueIndex("academic_years_school_label_idx").on(table.schoolId, table.label) }));

export const studentsTable = pgTable("students", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  academicYearId: integer("academic_year_id").notNull().default(0),
  fullName: text("full_name").notNull(),
  fullNameArabic: text("full_name_arabic").notNull(),
  gender: text("gender").notNull().default(""),
  studentNumber: text("student_number").notNull(),
  nationalId: text("national_id").notNull(),
  grade: text("grade").notNull(),
  className: text("class_name").notNull(),
  guardianName: text("guardian_name").notNull().default(""),
  guardianPhone: text("guardian_phone").notNull().default(""),
  status: text("status").notNull().default("active"),
  enrollmentDate: date("enrollment_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ schoolStudentNumberUnique: uniqueIndex("students_school_student_number_idx").on(table.schoolId, table.studentNumber) }));

export const teachersTable = pgTable("teachers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  academicYearId: integer("academic_year_id").notNull().default(0),
  fullName: text("full_name").notNull(),
  fullNameArabic: text("full_name_arabic").notNull().default(""),
  name: text("name").notNull().default(""),
  surname: text("surname").notNull().default(""),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  englishName: text("english_name").notNull().default(""),
  employeeCode: text("employee_code").notNull(),
  nationalId: text("national_id").notNull().default(""),
  nationality: text("nationality").notNull().default(""),
  gender: text("gender").notNull().default(""),
  maritalStatus: text("marital_status").notNull().default(""),
  religion: text("religion").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  area: text("area").notNull().default(""),
  country: text("country").notNull().default(""),
  height: integer("height").notNull().default(0),
  weight: integer("weight").notNull().default(0),
  branch: text("branch").notNull().default(""),
  academicLevel: text("academic_level").notNull().default(""),
  subject: text("subject").notNull().default(""),
  weeklyClasses: integer("weekly_classes").notNull().default(0),
  isEmployee: boolean("is_employee").notNull().default(true),
  status: text("status").notNull().default("active"),
}, (table) => ({ schoolEmployeeCodeUnique: uniqueIndex("teachers_school_employee_code_idx").on(table.schoolId, table.employeeCode) }));

export const employeesTable = pgTable("employees", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  fullNameArabic: text("full_name_arabic").notNull(),
  employeeNumber: text("employee_number").notNull(),
  nationalId: text("national_id").notNull().default(""),
  jobTitle: text("job_title").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull().default("active"),
}, (table) => ({ schoolEmployeeNumberUnique: uniqueIndex("employees_school_employee_number_idx").on(table.schoolId, table.employeeNumber) }));

export const booksTable = pgTable("books", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  author: text("author").notNull().default(""),
  publisher: text("publisher").notNull().default(""),
  topic: text("topic").notNull().default(""),
  isbn: text("isbn").notNull().default(""),
  barcode: text("barcode").notNull().default(""),
  category: text("category").notNull(),
  language: text("language").notNull().default("Arabic"),
  volume: text("volume").notNull().default(""),
  copies: integer("copies").notNull().default(1),
  availableCopies: integer("available_copies").notNull().default(1),
  dateAdded: date("date_added", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  depositNumber: text("deposit_number").notNull().default(""),
  status: text("status").notNull().default("available"),
  publicationPlace: text("publication_place").notNull().default(""),
  publicationDate: text("publication_date").notNull().default(""),
  generalNumber: text("general_number").notNull().default(""),
  specialNumber: text("special_number").notNull().default(""),
  description: text("description").notNull().default(""),
  coverImage: text("cover_image").notNull().default(""),
  shelf: text("shelf").notNull().default(""),
  lostCopies: integer("lost_copies").notNull().default(0),
  damagedCopies: integer("damaged_copies").notNull().default(0),
});

export const bookCopiesTable = pgTable("book_copies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  copyNumber: integer("copy_number").notNull(),
  barcode: text("barcode").notNull().unique(),
  status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ bookCopyNumberUnique: uniqueIndex("book_copies_book_id_copy_number_idx").on(table.bookId, table.copyNumber) }));

export const attendanceTable = pgTable("attendance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  academicYearId: integer("academic_year_id").notNull(),
  attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const borrowsTable = pgTable("borrows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").references(() => studentsTable.id, { onDelete: "cascade" }),
  borrowerType: text("borrower_type").notNull().default("student"),
  borrowerId: integer("borrower_id"),
  borrowedAt: timestamp("borrowed_at", { withTimezone: true }).notNull().defaultNow(),
  dueDate: date("due_date", { mode: "string" }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  condition: text("condition").notNull().default("good"),
});

export const insertSchoolSchema = createInsertSchema(schoolsTable);
export const insertAcademicYearSchema = createInsertSchema(academicYearsTable);
export const insertStudentSchema = createInsertSchema(studentsTable);
export const insertTeacherSchema = createInsertSchema(teachersTable);
export const insertEmployeeSchema = createInsertSchema(employeesTable);
export const insertBookCopySchema = createInsertSchema(bookCopiesTable);
export const insertBookSchema = createInsertSchema(booksTable);
export const insertBorrowSchema = createInsertSchema(borrowsTable);
export const insertAttendanceSchema = createInsertSchema(attendanceTable);

export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schoolsTable.$inferSelect;
export type InsertAcademicYear = z.infer<typeof insertAcademicYearSchema>;
export type AcademicYear = typeof academicYearsTable.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type Teacher = typeof teachersTable.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type InsertBookCopy = z.infer<typeof insertBookCopySchema>;
export type BookCopy = typeof bookCopiesTable.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
export type InsertBorrow = z.infer<typeof insertBorrowSchema>;
export type Borrow = typeof borrowsTable.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
