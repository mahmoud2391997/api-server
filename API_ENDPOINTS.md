# API Endpoints Documentation

## Authentication Methods

- **API Key**: School admins authenticate using `X-API-Key` header
- **Student JWT**: Students authenticate using `Authorization: Bearer <token>` header
- **Public**: No authentication required

## Public Endpoints

| Method | Endpoint | Auth | Description | Example Request/Response |
|--------|----------|------|-------------|---------------------------|
| GET | `/api/healthz` | None | Health check | Response: `{ "status": "ok" }` |
| POST | `/api/register-school` | None | Register a new school | Request: `{ "name": "School Name", "nameArabic": "المدرسة", "code": "SCHOOL001", ... }` |
| POST | `/api/student/login` | None | Student login | Request: `{ "schoolCode": "SCHOOL001", "password": "password123" }`<br>Response: `{ "token": "jwt_token_here" }` |

## Admin Endpoints (API Key Required)

| Method | Endpoint | Auth | Description | Example Request/Response |
|--------|----------|------|-------------|---------------------------|
| PUT | `/api/admin/student-access` | API Key | Set/rotate student password | Request: `{ "password": "newpassword123" }`<br>Response: `{ "success": true }` |
| GET | `/api/dashboard/summary` | API Key | Get dashboard summary | Response: `{ "students": 100, "teachers": 20, "books": 500, ... }` |
| GET | `/api/students` | API Key | List students | Query: `?search=John&status=active`<br>Response: `[{ "id": 1, "fullName": "John Doe", ... }]` |
| POST | `/api/students` | API Key | Create student | Request: `{ "fullName": "John Doe", "fullNameArabic": "...", "studentNumber": "123", ... }` |
| PATCH | `/api/students/:id` | API Key | Update student | Request: `{ "fullName": "John Smith", ... }` |
| DELETE | `/api/students/:id` | API Key | Delete student | Response: 204 No Content |
| GET | `/api/teachers` | API Key | List teachers | Query: `?search=Mary&status=active` |
| POST | `/api/teachers` | API Key | Create teacher | Request: `{ "name": "Mary", "surname": "Smith", "employeeCode": "T001", ... }` |
| PATCH | `/api/teachers/:id` | API Key | Update teacher | Request: `{ "name": "Mary", ... }` |
| DELETE | `/api/teachers/:id` | API Key | Delete teacher | Response: 204 No Content |
| GET | `/api/employees` | API Key | List employees | Query: `?search=John&status=active` |
| POST | `/api/employees` | API Key | Create employee | Request: `{ "fullName": "John Doe", "employeeNumber": "E001", ... }` |
| PATCH | `/api/employees/:id` | API Key | Update employee | Request: `{ "fullName": "John Smith", ... }` |
| DELETE | `/api/employees/:id` | API Key | Delete employee | Response: 204 No Content |
| GET | `/api/library/books` | API Key | List books | Query: `?search=Harry&category=Fiction` |
| POST | `/api/library/books` | API Key | Create book | Request: `{ "title": "Book Title", "author": "Author Name", "copies": 5, ... }` |
| PATCH | `/api/library/books/:id` | API Key | Update book | Request: `{ "title": "Updated Title", ... }` |
| DELETE | `/api/library/books/:id` | API Key | Delete book | Response: 204 No Content |
| PATCH | `/api/library/books/:id/condition` | API Key | Mark book condition | Request: `{ "action": "lost", "copyId": "BARCODE001" }` |
| GET | `/api/library/borrows` | API Key | List borrows | Query: `?active=true` |
| POST | `/api/library/borrows` | API Key | Create borrow | Request: `{ "bookId": 1, "borrowerType": "student", "borrowerId": 1, ... }` |
| PATCH | `/api/library/borrows/:id/return` | API Key | Return book | Request: `{ "condition": "good" }` |
| GET | `/api/attendance` | API Key | List attendance | Query: `?academicYearId=1&studentId=1&from=2024-01-01&to=2024-12-31` |
| POST | `/api/attendance` | API Key | Create attendance record | Request: `{ "studentId": 1, "academicYearId": 1, "attendanceDate": "2024-01-01", "status": "present" }` |
| GET | `/api/academic-years` | API Key | List academic years | Response: `[{ "id": 1, "label": "2024 / 2025", "isCurrent": true, ... }]` |
| POST | `/api/library/sync` | API Key | Sync library data | Request: `{ "books": [...], "borrows": [...] }` |
| GET | `/api/library/student-data` | API Key | Get student library data from MongoDB | Response: `{ "books": [...], "borrows": [...] }` |
| GET | `/api/borrows/due-today` | API Key | Get borrows due today | Response: `[{ "id": 1, "bookTitle": "...", "dueDate": "2024-01-01", ... }]` |

## Student Endpoints (Student JWT Required)

| Method | Endpoint | Auth | Description | Example Request/Response |
|--------|----------|------|-------------|---------------------------|
| GET | `/api/student/library/books` | Student JWT | List books (read-only) | Query: `?search=Harry&category=Fiction&language=Arabic&available=true`<br>Response: `[{ "id": 1, "title": "Book Title", "author": "Author", "availableCopies": 3, ... }]` |
| GET | `/api/student/library/books/:id` | Student JWT | Get single book (read-only) | Response: `{ "id": 1, "title": "Book Title", "author": "Author", "availableCopies": 3, ... }` |

## Security Notes

1. **Tenant Isolation**: All admin routes are scoped to `req.schoolId` from the API key. Schools cannot access each other's data.
2. **Student Data Protection**: Student endpoints never return:
   - Passwords
   - National IDs
   - Guardian phone numbers
   - Borrower names
   - Student IDs in loan records
3. **Cross-Authorization**:
   - Student JWT tokens get 401/403 on admin routes
   - API keys get 401/403 on `/api/student/*` routes (except `/login`)
4. **Default Key**: The default API key `sk-default-school-api-key-change-me` is deactivated by migration 0006.
5. **Password Hashing**: Student passwords are hashed using Argon2 (migration 0007).
6. **JWT Expiry**: Student tokens expire after 2 hours.

## Error Responses

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - Authentication valid but insufficient permissions |
| 404 | Not Found - Resource doesn't exist (returns 404, not 403, for cross-school access) |
| 409 | Conflict - Resource state conflict (e.g., book not available) |
| 500 | Internal Server Error - Server error |

## CORS Configuration

- Allowed origins: Configured via `FRONTEND_URL` environment variable
- Allowed methods: GET, POST, PATCH, DELETE, PUT, OPTIONS
- Allowed headers: Content-Type, Authorization, X-API-Key
- Credentials: supported
