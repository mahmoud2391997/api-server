# System App Integration Prompt

## Overview
The API server has been updated with multi-school support and API key authentication. This prompt provides the necessary changes required in the system app (desktop application, student panel, admin panel) to integrate with these new features.

## Required Changes

### 1. School Registration Flow (First-Time Setup)

**Task**: Implement school registration in the desktop app's setup wizard.

**Changes Needed**:
- Add a registration form in the setup wizard with the following fields:
  - School Name (English)
  - School Name (Arabic)
  - School Code (unique identifier)
  - Address
  - Phone
  - Email
  - Principal Name
  - Established Date (optional)

- Implement API call to register the school:
```typescript
async function registerSchool(schoolData: SchoolRegistrationData) {
  const response = await fetch(`${API_BASE_URL}/api/register-school`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(schoolData),
  });

  const result = await response.json();

  if (response.ok) {
    // Store the API key securely in app configuration
    await saveApiKey(result.apiKey);
    // Store school info
    await saveSchoolInfo(result.school);
    return result;
  } else {
    throw new Error(result.error || 'Registration failed');
  }
}
```

- **CRITICAL**: Display the API key to the user and instruct them to save it securely
- Store the API key in the app's secure storage (encrypted if possible)
- Store school ID and code for future reference

### 2. API Key Authentication

**Task**: Add API key authentication to all API requests.

**Changes Needed**:
- Create an API client wrapper that automatically includes the API key:
```typescript
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const apiKey = await getApiKey(); // Retrieve from secure storage

  if (!apiKey) {
    throw new Error('API key not found. Please configure your school.');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    // Handle unauthorized - redirect to setup or show error
    handleUnauthorizedError();
  }

  if (response.status === 403) {
    // Handle forbidden - invalid API key or inactive school
    handleForbiddenError();
  }

  return response;
}
```

- Replace all existing `fetch` calls with this wrapper
- Ensure the API key is included in EVERY request (except registration)

### 3. Configuration Management

**Task**: Update app configuration to store and manage API keys.

**Changes Needed**:
- Add these fields to your app configuration:
```typescript
interface AppConfig {
  apiUrl: string;           // e.g., "https://api.example.com"
  apiKey: string;           // School-specific API key (secure storage)
  schoolId: number;         // School ID from registration
  schoolCode: string;       // School code
  schoolName: string;       // School name
  schoolNameArabic: string; // School name in Arabic
}
```

- Implement secure storage for the API key:
  - Use platform-specific secure storage (Keychain on macOS, Credential Manager on Windows)
  - Never store API key in plain text files
  - Allow users to view/regenerate their API key from settings

### 4. Admin Panel Integration

**Task**: Update admin panel to work with multi-school architecture.

**Changes Needed**:
- Admin panel should use the same API key as the desktop app
- All CRUD operations (students, teachers, books, etc.) automatically filtered by school
- Add school info display in admin panel header/settings
- Add "Switch School" feature if managing multiple schools (future feature)
- Update all API calls to use the authenticated API client

**Example Updates**:
```typescript
// Before (old way)
const students = await fetch(`${API_URL}/api/students`).then(r => r.json());

// After (new way with authentication)
const students = await apiRequest('/api/students').then(r => r.json());
```

### 5. Student Panel Integration

**Task**: Update student panel to work with multi-school architecture.

**Changes Needed**:
- Student panel should use the same API key (can be shared from desktop app config)
- Implement read-only access for students (restrict delete/update operations)
- Add school context to student views
- All data automatically filtered by school

**Security Considerations**:
- Student panel should have limited permissions
- Consider implementing role-based access control on the API side
- Student credentials should be separate from API key (future feature)

### 6. Error Handling

**Task**: Add proper error handling for authentication failures.

**Changes Needed**:
- Handle 401 Unauthorized: Prompt user to re-register or check API key
- Handle 403 Forbidden: Show error "Invalid API key or school inactive"
- Handle 404 Not Found: Show appropriate error messages
- Handle 500 Internal Server Error: Show generic error with retry option

```typescript
function handleApiError(error: ApiError) {
  switch (error.status) {
    case 401:
      showNotification('Authentication required. Please check your API key.');
      navigateToSettings();
      break;
    case 403:
      showNotification('Invalid API key or school is inactive. Please contact support.');
      break;
    case 404:
      showNotification('Resource not found.');
      break;
    default:
      showNotification('An error occurred. Please try again.');
  }
}
```

### 7. Testing Checklist

**Task**: Test the integration thoroughly.

**Testing Steps**:
1. **School Registration**:
   - [ ] Register a new school successfully
   - [ ] Verify API key is generated and displayed
   - [ ] Verify API key is stored securely
   - [ ] Test duplicate school code error handling

2. **API Authentication**:
   - [ ] Test API calls with valid API key
   - [ ] Test API calls with invalid API key (should fail with 403)
   - [ ] Test API calls without API key (should fail with 401)
   - [ ] Test inactive school scenario

3. **Data Isolation**:
   - [ ] Create students in School A
   - [ ] Verify School B cannot see School A's students
   - [ ] Verify each school's data is properly isolated

4. **Admin Panel**:
   - [ ] Test all CRUD operations with authentication
   - [ ] Verify data is scoped to the correct school
   - [ ] Test error handling for authentication failures

5. **Student Panel**:
   - [ ] Test read operations with authentication
   - [ ] Verify restricted access (if implemented)
   - [ ] Test error handling

### 8. Migration Guide for Existing Deployments

**Task**: Guide existing users through the upgrade.

**Migration Steps**:
1. **Backup existing data** (if any)
2. **Run database migration** on the server:
   ```bash
   pnpm db:push
   # Or manually run: 0004_multi_school_support.sql
   ```
3. **Update desktop app** to new version with API key support
4. **Existing data** will be automatically associated with a default school
5. **Users need to**:
   - Update their desktop app
   - The app will detect missing API key
   - Guide them through registration or use default school
   - Provide them with their API key

### 9. Configuration File Template

**Task**: Provide a template for app configuration.

**Example Configuration**:
```json
{
  "apiUrl": "https://api.your-domain.com",
  "school": {
    "id": 1,
    "name": "My School",
    "nameArabic": "مدرستي",
    "code": "SCHOOL001"
  },
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // Store securely
  "version": "2.0.0"
}
```

### 10. Security Best Practices

**Important Security Guidelines**:
- ✅ Store API keys in platform-specific secure storage
- ✅ Never log API keys
- ✅ Never include API keys in error messages
- ✅ Use HTTPS for all API calls
- ✅ Implement API key rotation (future feature)
- ✅ Add rate limiting on the API side (future feature)
- ❌ Never hardcode API keys in source code
- ❌ Never commit API keys to version control
- ❌ Never share API keys via email/chat

## API Endpoints Reference

### New Endpoints
- `POST /api/register-school` - Register a new school
- `GET /api/school-info` - Get current school information (requires auth)

### Existing Endpoints (Now Require Auth)
- `GET /api/healthz` - Health check (no auth required)
- `GET /api/students` - Get students (requires auth)
- `POST /api/students` - Create student (requires auth)
- `GET /api/teachers` - Get teachers (requires auth)
- `GET /api/books` - Get books (requires auth)
- All other `/api/*` endpoints (requires auth)

## Support and Troubleshooting

### Common Issues

**Issue**: "API key is required" error
**Solution**: Complete school registration or configure API key in settings

**Issue**: "Invalid API key" error
**Solution**: Verify API key is correct, check if school is active

**Issue**: "School is inactive" error
**Solution**: Contact administrator to activate the school

**Issue**: Database connection errors
**Solution**: Verify DATABASE_URL is configured correctly on the server

## Next Steps

1. Implement the changes outlined above
2. Test thoroughly with the testing checklist
3. Update user documentation
4. Deploy to production
5. Monitor for authentication errors
6. Plan for future features (role-based access, API key rotation, etc.)

## Contact

For questions or issues with the integration, refer to the API server documentation or contact the development team.
