# GitHub Copilot Instructions

## Purpose
This file provides guidelines for using GitHub Copilot to ensure unit tests are properly covered in the project.

## Instructions

### 1. **Unit Test Coverage**
- Ensure every new feature or function has corresponding unit tests.
- Write tests for edge cases and common scenarios.
- Use descriptive test names to clarify the purpose of each test.

### 2. **Testing Framework**
- Use the existing testing framework (e.g., Jest) configured in the project.
- Follow the structure and conventions of existing test files.

### 3. **Mocking and Stubbing**
- Mock external dependencies (e.g., database calls, API requests) to isolate the functionality being tested.
- Use stubs for functions that are not directly related to the test.

### 4. **Code Coverage**
- Aim for high code coverage (e.g., 80% or above).
- Use tools like `jest --coverage` to measure coverage.

### 5. **Error Handling**
- Write tests to verify proper error handling and edge cases.
- Ensure that exceptions are logged and handled gracefully.

### 6. **Test File Location**
- Place test files in the `test/` directory.
- Use the naming convention `<filename>.test.ts` for test files.

### 7. **Continuous Integration**
- Ensure tests are run automatically in CI pipelines using GitHub Actions.
- Fix any failing tests before merging code.

### 8. **Best Practices**
- Write clean and maintainable test code.
- Avoid hardcoding values; use fixtures or factories.
- Use assertions to validate expected outcomes.

### 9. **Examples**
- Refer to existing test files (e.g., `auth-utils.test.ts`) for examples of test structure and style.

### 10. **Documentation**
- Document any special testing requirements or setup in the test files.

By following these instructions, you can ensure that unit tests are comprehensive and maintain high-quality code standards.
