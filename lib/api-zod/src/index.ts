export * from "./generated/api.js";
export * from "./generated/types/index.js";

// Keep the route schemas explicit so workspace consumers receive these exports
// consistently in both source and declaration builds.
export {
  CreateBookBody,
  CreateBookResponse,
  CreateBorrowBody,
  CreateBorrowResponse,
  CreateStudentBody,
  CreateStudentResponse,
  CreateTeacherBody,
  CreateTeacherResponse,
  DeleteBookParams,
  DeleteStudentParams,
  DeleteTeacherParams,
  GetAcademicYearsResponse,
  GetBooksQueryParams,
  GetBooksResponse,
  GetBorrowsQueryParams,
  GetBorrowsResponse,
  GetDashboardSummaryResponse,
  GetStudentsQueryParams,
  GetStudentsResponse,
  GetTeachersQueryParams,
  GetTeachersResponse,
  MarkBookConditionBody,
  MarkBookConditionParams,
  MarkBookConditionResponse,
  ReturnBorrowBody,
  ReturnBorrowParams,
  ReturnBorrowResponse,
  UpdateBookBody,
  UpdateBookParams,
  UpdateBookResponse,
} from "./generated/api.js";
