import { Pool } from 'pg';
import { registerUser, changeUserPassword } from '../src/auth/auth-utils';
import bcrypt from 'bcrypt';

jest.mock('pg', () => {
  const query = jest.fn();
  const mockPool = {
    query,
  };
  return { Pool: jest.fn(() => mockPool) };
});

const mockPool = new Pool() as unknown as Pool & {
  query: jest.Mock;
};
const originalConsoleError = console.error;

beforeAll(() => {
  console.error = jest.fn(); // Suppress console.error during tests
});

afterAll(() => {
  console.error = originalConsoleError; // Restore original console.error
});

beforeEach(() => {
  jest.clearAllMocks(); // Clear all mock calls and instances before each test
});

describe('Auth Utils', () => {
  describe('registerUser', () => {
    it('should register a new user and return the user ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-id-123' }] });

      const userId = await registerUser(
        mockPool,
        'testuser',
        'testuser@example.com',
        'password123',
        'This is a bio',
        'profile-image-url'
      );

      expect(userId).toBe('user-id-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.any(Array)
      );
    });

    it('should return null if registration fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const userId = await registerUser(
        mockPool,
        'testuser',
        'testuser@example.com',
        'password123'
      );

      expect(userId).toBeNull();
    });
  });

  describe('changeUserPassword', () => {
    it('should change the user password if the current password is correct', async () => {
      const hashedPassword = await bcrypt.hash('currentPassword', 10);
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ password: hashedPassword }] }) // Current password query
        .mockResolvedValueOnce({}); // Update password query

      const result = await changeUserPassword(
        mockPool,
        'user-id-123',
        'currentPassword',
        'newPassword123'
      );

      console.log('mockPool.query calls:', mockPool.query.mock.calls); // Log all calls to mockPool.query

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password updated successfully');

      // Adjusting the expectation to match the actual number of calls
      expect(mockPool.query).toHaveBeenCalledTimes(2);

      // Verify the specific queries made
      expect(mockPool.query).toHaveBeenNthCalledWith(1, 'SELECT password FROM users WHERE id = $1', ['user-id-123']);
      expect(mockPool.query).toHaveBeenNthCalledWith(2, 'UPDATE users SET password = $1 WHERE id = $2', [expect.any(String), 'user-id-123']);
    });

    it('should return an error if the current password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('currentPassword', 10);
      mockPool.query.mockResolvedValueOnce({ rows: [{ password: hashedPassword }] });

      const result = await changeUserPassword(
        mockPool,
        'user-id-123',
        'wrongPassword',
        'newPassword123'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Current password is incorrect');
    });

    it('should return an error if the user is not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await changeUserPassword(
        mockPool,
        'non-existent-user',
        'currentPassword',
        'newPassword123'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });
  });
});