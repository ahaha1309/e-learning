const { sanitizeUser } = require('../../controller/auth/auth.service');

describe('Auth Service', () => {
  describe('sanitizeUser', () => {
    it('should strip out sensitive fields like passwordHash and refreshTokenHash', () => {
      const mockUser = {
        id: '1234567890',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'student',
        status: 'active',
        provider: 'local',
        passwordHash: 'hashed_password_123',
        refreshTokenHash: 'hashed_refresh_token_123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = sanitizeUser(mockUser);

      expect(result).toHaveProperty('id', '1234567890');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
      expect(result).toHaveProperty('role', 'student');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('refreshTokenHash');
      expect(result).not.toHaveProperty('createdAt');
    });
  });
});
